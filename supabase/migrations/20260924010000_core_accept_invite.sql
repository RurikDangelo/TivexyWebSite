-- Aceitar convite: a escrita que o RLS precisa negar e mesmo assim precisa acontecer
--
-- ─────────────────────────────────────────────────────────────────────────
-- O impasse
-- ─────────────────────────────────────────────────────────────────────────
--
-- Ativar um vínculo é `update public.tenant_users set status = 'active'`. As
-- políticas dessa tabela exigem ser **membro ativo** do tenant para escrever
-- nela — que é exatamente quem a pessoa ainda não é. Quem está na tela de
-- convite é, por definição, quem o RLS recusa.
--
-- Afrouxar a política seria a saída errada: ela passaria a aceitar escrita de
-- quem só foi convidado, e convite pendente é o estado de menor confiança que
-- existe no sistema. A saída certa é uma função `SECURITY DEFINER` estreita —
-- ela não relaxa nenhuma regra, executa **uma** operação com o dono da função
-- e confere tudo antes.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O que esta função confere, e por que cada conferência existe
-- ─────────────────────────────────────────────────────────────────────────
--
--   1. Há sessão.              Sem isso, `auth.uid()` nulo casaria com
--                              `user_id is null` em alguma reescrita futura.
--   2. O vínculo é DE QUEM     O parâmetro é o tenant, nunca o usuário. Aceitar
--      CHAMA.                  convite alheio seria entrar na conta de outro.
--   3. O vínculo está          Reaceitar não é erro, mas também não pode
--      `invited`.              reescrever `joined_at` de quem já entrou.
--   4. O tenant opera.         Convite para cliente cancelado ou ainda em
--                              provisionamento não vale — daria acesso a uma
--                              conta morta, ou a uma pela metade.
--
-- `security definer` sem `set search_path = ''` é escalada de privilégio, e há
-- teste de esquema varrendo o catálogo atrás de exatamente isso. O caminho
-- vazio obriga todo objeto a ser escrito por extenso aqui dentro.

create or replace function public.accept_invite(p_tenant_id uuid)
returns table (tenant_id uuid, slug text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  estado_do_tenant public.tenant_status;
  atualizados integer;
begin
  if quem is null then
    raise exception using
      errcode = '28000',
      message = 'Entre na sua conta antes de aceitar o convite.';
  end if;

  -- O tenant precisa existir e estar operando. A leitura é direta na tabela,
  -- sem RLS, porque a função roda como dona — e é justamente por isso que a
  -- mensagem não distingue "não existe" de "não opera": quem não tem convite
  -- não fica sabendo que o tenant existe.
  select t.status into estado_do_tenant
  from public.tenants t
  where t.id = p_tenant_id;

  if estado_do_tenant is null or estado_do_tenant <> 'active' then
    raise exception using
      errcode = 'P0002',
      message = 'Este convite não está mais válido. Peça um novo a quem administra a conta.';
  end if;

  -- A escrita. Note o `user_id = quem`: o parâmetro escolhe o tenant, nunca a
  -- pessoa. E o `status = 'invited'` no `where` faz dois cliques seguidos não
  -- reescreverem `joined_at` — o segundo simplesmente não casa.
  update public.tenant_users tu
  set status = 'active',
      joined_at = now(),
      updated_at = now()
  where tu.tenant_id = p_tenant_id
    and tu.user_id = quem
    and tu.status = 'invited';

  get diagnostics atualizados = row_count;

  if atualizados = 0 then
    -- Já é membro ativo? Então isto é um clique repetido, e clique repetido
    -- não é erro: devolve o mesmo que devolveria na primeira vez, e a tela
    -- segue para dentro do sistema.
    if exists (
      select 1 from public.tenant_users tu
      where tu.tenant_id = p_tenant_id and tu.user_id = quem and tu.status = 'active'
    ) then
      return query
        select t.id, t.slug, t.name from public.tenants t where t.id = p_tenant_id;
      return;
    end if;

    -- Convite suspenso, inexistente, ou de outra pessoa. A mesma frase para
    -- os três: distinguir contaria a quem tentasse se aquele tenant tem
    -- convite pendente para aquele e-mail.
    raise exception using
      errcode = 'P0002',
      message = 'Este convite não está mais válido. Peça um novo a quem administra a conta.';
  end if;

  -- A auditoria é parte da operação, não um "depois". Na mesma transação:
  -- se o registro falhar, a entrada também não acontece.
  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id,
    quem,
    'core.membership.accepted',
    'tenant_user',
    quem::text,
    -- `::text::jsonb` em toda escrita de JSON: sem o `::text` os drivers
    -- divergem — o PGlite analisa, o de produção serializa de novo — e o
    -- valor chega como string em vez de objeto.
    ('{"via":"tela"}')::text::jsonb
  );

  return query
    select t.id, t.slug, t.name from public.tenants t where t.id = p_tenant_id;
end;
$$;

comment on function public.accept_invite(uuid) is
  'Ativa o próprio convite. O parâmetro escolhe o tenant; a pessoa é sempre auth.uid().';

-- `authenticated` e não `anon`: aceitar convite exige sessão, e a função já
-- recusa `auth.uid()` nulo. Os dois juntos — quem chama e o que a função
-- confere — porque conceder a `anon` transformaria a primeira conferência na
-- única.
revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;
