-- Tivexy Core — aceitar convite
--
-- O vínculo nasce `invited`: o provisionamento cria a conta do administrador
-- e o liga à empresa sem dar acesso, porque convite não é acesso. O comentário
-- de `create_admin` sempre disse que ele "só vira active no primeiro login".
-- Nada fazia isso. O administrador de um cliente recém-criado entrava, caía em
-- `/convite` e não tinha como sair de lá.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Por que SECURITY DEFINER, quando a conversão de lead é INVOKER
-- ─────────────────────────────────────────────────────────────────────────
--
-- Ativar o vínculo é escrever em `tenant_users`, e a política de escrita exige
-- `core.users.write` **na empresa**. Quem está aceitando ainda não é membro
-- ativo — é exatamente quem a política nega. Com INVOKER a função falharia
-- para toda pessoa que precisa dela.
--
-- DEFINER passa por cima do RLS, e por isso a autorização precisa estar
-- inteira aqui dentro, e ela é uma frase: **o convite é seu**. A única linha
-- que esta função toca é a de `user_id = auth.uid()`. Não há parâmetro de
-- usuário; não dá para aceitar o convite de outra pessoa passando o id dela.
--
-- E a função não cria vínculo — só ativa o que já existe. Quem pode convidar
-- continua decidido pela política de `tenant_users`, que esta função não
-- contorna.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O que ela não conta a um estranho
-- ─────────────────────────────────────────────────────────────────────────
--
-- Para quem não tem vínculo, "a empresa não existe" e "a empresa existe e você
-- não foi convidado" dão a mesma resposta. É o silêncio de `current_viewer()`:
-- ninguém descobre por aqui que um tenant é cliente da Tivexy.

create or replace function public.accept_invitation(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_vinculo  public.tenant_users;
  v_empresa  public.tenants;
  v_aceitou  boolean := false;
begin
  if v_user is null then
    raise exception using
      errcode = '42501',
      message = 'entre na sua conta para aceitar o convite';
  end if;

  -- `for update`: dois cliques seguidos não registram a aceitação duas vezes.
  select tu.* into v_vinculo
  from public.tenant_users tu
  where tu.user_id = v_user
    and tu.tenant_id = p_tenant_id
  for update;

  if v_vinculo.id is null then
    raise exception using
      errcode = 'no_data_found',
      message = 'convite não encontrado';
  end if;

  select t.* into v_empresa
  from public.tenants t
  where t.id = p_tenant_id;

  -- Daqui para baixo quem pergunta tem vínculo, então pode saber o nome.
  if v_empresa.status = 'cancelled' then
    raise exception using
      errcode = '23514',
      message = format('%s não está mais ativa na Tivexy', v_empresa.name);
  end if;

  -- Suspender é decisão de quem administra. Aceitar de novo não pode desfazê-la.
  if v_vinculo.status = 'suspended' then
    raise exception using
      errcode = '42501',
      message = 'seu acesso a esta empresa está suspenso; fale com quem administra a conta';
  end if;

  if v_vinculo.status = 'invited' then
    update public.tenant_users
    set status = 'active',
        joined_at = now()
    where id = v_vinculo.id;

    insert into public.audit_logs (
      tenant_id, actor_user_id, action, resource_type, resource_id, metadata
    )
    values (
      p_tenant_id, v_user, 'membership.accepted', 'tenant_user', v_vinculo.id::text,
      jsonb_build_object('invited_at', v_vinculo.invited_at, 'invited_by', v_vinculo.invited_by)
    );

    v_aceitou := true;
  end if;

  -- Já ativo não é erro: é o segundo clique, ou a aba que ficou aberta.
  return jsonb_build_object(
    'tenantId', v_empresa.id,
    'slug', v_empresa.slug,
    'status', v_empresa.status,
    'accepted', v_aceitou
  );
end;
$$;

comment on function public.accept_invitation(uuid) is
  'Ativa o vínculo convidado de auth.uid() com o tenant. DEFINER: quem aceita ainda não passa no RLS de tenant_users.';

-- Visitante não aceita nada. O padrão do Postgres dá EXECUTE a PUBLIC, e o
-- Supabase ainda concede ao `anon` por privilégio padrão.
revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
