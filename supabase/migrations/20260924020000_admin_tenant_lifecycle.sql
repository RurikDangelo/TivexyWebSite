-- Ciclo de vida do cliente: suspender, reativar, trocar plano
--
-- ─────────────────────────────────────────────────────────────────────────
-- Por que função, e não `update` pela aplicação
-- ─────────────────────────────────────────────────────────────────────────
--
-- `20260919050000_core_tenant_column_privileges.sql` revogou `update` em
-- `public.tenants` e devolveu **só** `name, legal_name, document, settings`.
-- `status` e `plan_id` ficaram de fora de propósito: são decisão de
-- plataforma, e nem o administrador do tenant nem o Super Admin os alteram
-- por PostgREST.
--
-- Isso deixava duas saídas. A primeira é a aplicação escrever por SQL direto,
-- com a conexão de serviço — que é como o provisionamento faz. Funciona, e
-- tem um custo: a regra de quem pode suspender um cliente passaria a morar em
-- TypeScript, fora do alcance dos testes de banco, e a conexão de serviço
-- ignora RLS por definição.
--
-- A segunda é esta: funções `SECURITY DEFINER` estreitas que conferem
-- `is_super_admin()` **dentro do banco**. A regra fica onde o resto das
-- regras está, o teste de isolamento a alcança, e a aplicação não precisa da
-- conexão de serviço para operar um cliente.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O que estas funções deliberadamente NÃO fazem
-- ─────────────────────────────────────────────────────────────────────────
--
-- Não apagam nada. Suspender não é apagar, e rebaixar de plano não é apagar:
-- o dado continua sendo do cliente, e precisa continuar alcançável para
-- exportação, suporte e reativação. Rebaixar desabilita o módulo — que é
-- evento comercial — e deixa as linhas onde estão.

-- ─────────────────────────────────────────────────────────────────────────
-- Suspender e reativar
-- ─────────────────────────────────────────────────────────────────────────
--
-- As transições permitidas são poucas e vale escrevê-las por extenso:
--
--   active     → suspended    inadimplência, uso indevido
--   suspended  → active       o motivo saiu
--   active     → cancelled    encerramento
--   suspended  → cancelled    encerramento a partir da suspensão
--
-- `provisioning` não entra: um cliente pela metade não se suspende, se
-- desfaz — e desfazer é `compensateProvisioning`, que já existe e sabe a
-- ordem inversa. `cancelled` é terminal aqui: ressuscitar um cliente
-- cancelado não é troca de status, é decisão que merece o caminho explícito.

create or replace function public.admin_set_tenant_status(
  p_tenant_id uuid,
  p_status public.tenant_status,
  p_reason text default null
)
returns public.tenant_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  atual public.tenant_status;
begin
  if not public.is_super_admin() then
    raise exception using
      errcode = '42501',
      message = 'Só a plataforma muda o estado de um cliente.';
  end if;

  select t.status into atual from public.tenants t where t.id = p_tenant_id;

  if atual is null then
    raise exception using errcode = 'P0002', message = 'Cliente não encontrado.';
  end if;

  -- Pedir o estado que já vale não é erro: é clique repetido, ou duas abas.
  if atual = p_status then
    return atual;
  end if;

  if not (
    (atual = 'active'    and p_status in ('suspended', 'cancelled')) or
    (atual = 'suspended' and p_status in ('active', 'cancelled'))
  ) then
    raise exception using
      errcode = '23514',
      message = format('Não dá para ir de %s para %s.', atual, p_status);
  end if;

  update public.tenants t
  set status = p_status, updated_at = now()
  where t.id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, quem, 'core.tenant.status_changed', 'tenant', p_tenant_id::text,
    -- `::text::jsonb` em toda escrita de JSON: sem o `::text` os drivers
    -- divergem e o valor chega como string em vez de objeto.
    (json_build_object('de', atual, 'para', p_status, 'motivo', p_reason))::text::jsonb
  );

  return p_status;
end;
$$;

comment on function public.admin_set_tenant_status(uuid, public.tenant_status, text) is
  'Suspende, reativa ou cancela um cliente. Só plataforma. Transições por extenso.';

revoke all on function public.admin_set_tenant_status(uuid, public.tenant_status, text) from public;
grant execute on function public.admin_set_tenant_status(uuid, public.tenant_status, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Trocar de plano
-- ─────────────────────────────────────────────────────────────────────────
--
-- Trocar o plano **não basta**: `tenant_modules` é a fonte de verdade sobre
-- acesso a módulo, não `plans`. Um cliente que subisse de plano e continuasse
-- sem a linha de `tenant_modules` pagaria por um módulo que não abre — e o
-- sintoma seria a navegação mostrar o item desabilitado, sem erro nenhum.
--
-- Então a função sincroniza as duas coisas na mesma transação:
--
--   módulo novo no plano   → linha criada, ou reabilitada se já existia
--   módulo fora do plano   → `is_enabled = false`, linha preservada
--
-- Desabilitar e não apagar é o ponto. O dado do módulo continua no banco e
-- continua alcançável — `20260920020000_crm_foundation.sql` já diz que módulo
-- desabilitado não é fronteira de segurança. Quem voltar para o plano maior
-- encontra tudo como deixou.

create or replace function public.admin_set_tenant_plan(
  p_tenant_id uuid,
  p_plan_code text
)
returns table (plan_code text, habilitados integer, desabilitados integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  novo_plano uuid;
  plano_atual uuid;
  n_habilitados integer;
  n_desabilitados integer;
begin
  if not public.is_super_admin() then
    raise exception using
      errcode = '42501',
      message = 'Só a plataforma troca o plano de um cliente.';
  end if;

  select t.plan_id into plano_atual from public.tenants t where t.id = p_tenant_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Cliente não encontrado.';
  end if;

  select p.id into novo_plano from public.plans p where p.code = p_plan_code;
  if novo_plano is null then
    raise exception using errcode = 'P0002', message = format('Plano %s não existe.', p_plan_code);
  end if;

  update public.tenants t
  set plan_id = novo_plano, updated_at = now()
  where t.id = p_tenant_id;

  -- Habilita o que o plano novo inclui. `on conflict` porque a linha pode
  -- existir desabilitada de um rebaixamento anterior — e aí o certo é
  -- reacender, não falhar.
  with incluidos as (
    select pm.module_id from public.plan_modules pm where pm.plan_id = novo_plano
  ), aplicados as (
    insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
    select p_tenant_id, i.module_id, true, now() from incluidos i
    on conflict (tenant_id, module_id) do update
      set is_enabled = true,
          enabled_at = coalesce(public.tenant_modules.enabled_at, now()),
          updated_at = now()
    returning 1
  )
  select count(*)::integer into n_habilitados from aplicados;

  -- Desabilita o que saiu. As linhas ficam: o dado é do cliente.
  with removidos as (
    update public.tenant_modules tm
    set is_enabled = false, updated_at = now()
    where tm.tenant_id = p_tenant_id
      and tm.is_enabled
      and tm.module_id not in (
        select pm.module_id from public.plan_modules pm where pm.plan_id = novo_plano
      )
    returning 1
  )
  select count(*)::integer into n_desabilitados from removidos;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, quem, 'core.tenant.plan_changed', 'tenant', p_tenant_id::text,
    (json_build_object(
      'para', p_plan_code,
      'modulos_habilitados', n_habilitados,
      'modulos_desabilitados', n_desabilitados
    ))::text::jsonb
  );

  return query select p_plan_code, n_habilitados, n_desabilitados;
end;
$$;

comment on function public.admin_set_tenant_plan(uuid, text) is
  'Troca o plano e sincroniza tenant_modules. Rebaixar desabilita, nunca apaga.';

revoke all on function public.admin_set_tenant_plan(uuid, text) from public;
grant execute on function public.admin_set_tenant_plan(uuid, text) to authenticated;
