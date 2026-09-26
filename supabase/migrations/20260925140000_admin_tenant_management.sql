-- Tivexy Admin — editar, suspender, reativar, trocar plano
--
-- ─────────────────────────────────────────────────────────────────────────
-- O defeito que isto fecha
-- ─────────────────────────────────────────────────────────────────────────
--
-- A suspensão só existia na aplicação. `has_permission()` conferia o vínculo
-- da pessoa, e não a situação da empresa: quem tinha sessão numa empresa
-- suspensa era mandado para `/preparando` pela tela — e continuava lendo e
-- escrevendo CRM, vendas e financeiro pela API REST, com o mesmo token.
-- Suspensão que só a tela respeita é uma placa, não uma porta.
--
-- Agora a permissão exige empresa **ativa**. Toda política de dado de negócio
-- passa por `has_permission()`, então a suspensão corta a API junto com a
-- tela. O que continua legível é o que a pessoa precisa para entender o que
-- aconteceu: a linha da própria empresa (nome, situação, motivo) e o vínculo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- As funções
-- ─────────────────────────────────────────────────────────────────────────
--
-- `status` e `plan_id` não têm privilégio de `update` para `authenticated` —
-- nem o Super Admin chega a eles pela API (20260919050000). Por isso as três
-- operações são `SECURITY DEFINER`, e cada uma confere `is_super_admin()`
-- **dentro** dela: a função é a porta, e a conferência é a fechadura. Cada
-- uma grava a auditoria na mesma transação — decisão de plataforma sobre a
-- empresa de alguém não acontece sem rastro.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. O motivo fica na empresa
-- ─────────────────────────────────────────────────────────────────────────
--
-- É o que a empresa lê em `/preparando`. Sem motivo gravado, a tela só podia
-- dizer "fale com alguém" — e a primeira pergunta de quem é suspenso é "por
-- quê". Nenhum privilégio de `update` para `authenticated`: o `grant` de
-- colunas de 20260919050000 lista as que a empresa edita, e estas não estão.

alter table public.tenants
  add column status_reason text,
  add column status_changed_at timestamptz,
  add constraint tenants_status_reason_size
    check (status_reason is null or (btrim(status_reason) <> '' and length(status_reason) <= 500));

comment on column public.tenants.status_reason is
  'Por que a empresa está suspensa — o texto que ela lê. Só a plataforma escreve.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. A permissão exige empresa ativa
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_users tu
    join public.tenants t on t.id = tu.tenant_id
    join public.role_permissions rp on rp.role_id = tu.role_id
    join public.permissions p on p.id = rp.permission_id
    where tu.user_id = (select auth.uid())
      and tu.tenant_id = p_tenant_id
      and tu.status = 'active'
      -- Empresa em provisionamento, suspensa ou cancelada não opera — e
      -- não opera pela API também. É `isOperational()` do Core.
      and t.status = 'active'
      and p.code = p_permission
  );
$$;

comment on function public.has_permission(uuid, text) is
  'Permissão do usuário atual dentro de um tenant ativo, no formato modulo.recurso.acao.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Editar a empresa
-- ─────────────────────────────────────────────────────────────────────────
--
-- `SECURITY INVOKER`: nome, razão social e documento são colunas que
-- `authenticated` já pode escrever, e o Super Admin passa na política. A
-- função existe para a escrita e a auditoria serem uma transação só — com o
-- antes e o depois.

create or replace function public.admin_update_tenant(
  p_tenant_id  uuid,
  p_name       text,
  p_legal_name text,
  p_document   text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_antes public.tenants;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'só o Super Admin edita uma empresa por aqui';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception using errcode = '22023', message = 'a empresa precisa de um nome';
  end if;

  select * into v_antes from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'empresa não encontrada';
  end if;

  update public.tenants
     set name       = btrim(p_name),
         legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
         document   = nullif(btrim(coalesce(p_document, '')), '')
   where id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'tenant.updated', 'tenant', p_tenant_id::text,
    jsonb_build_object(
      'antes', jsonb_build_object('nome', v_antes.name, 'razao_social', v_antes.legal_name, 'documento', v_antes.document),
      'depois', jsonb_build_object(
        'nome', btrim(p_name),
        'razao_social', nullif(btrim(coalesce(p_legal_name, '')), ''),
        'documento', nullif(btrim(coalesce(p_document, '')), '')
      )
    )
  );
end;
$$;

revoke execute on function public.admin_update_tenant(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_tenant(uuid, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Suspender e reativar
-- ─────────────────────────────────────────────────────────────────────────
--
-- Só entre `active` e `suspended`. Empresa em provisionamento tem o caminho
-- dela (retomar ou desfazer, no Admin); cancelar é decisão de outro tamanho e
-- não mora aqui. Suspender pede motivo: é o que a empresa vai ler.

create or replace function public.admin_set_tenant_status(
  p_tenant_id uuid,
  p_status    public.tenant_status,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual  public.tenant_status;
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'só o Super Admin muda a situação de uma empresa';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'por aqui a empresa só é suspensa ou reativada';
  end if;

  select t.status into v_atual from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'empresa não encontrada';
  end if;
  if v_atual = p_status then
    raise exception using errcode = '22023',
      message = case p_status when 'active' then 'a empresa já está ativa' else 'a empresa já está suspensa' end;
  end if;
  if v_atual not in ('active', 'suspended') then
    raise exception using errcode = '22023',
      message = case v_atual
        when 'provisioning' then 'empresa em provisionamento: retome ou desfaça no Admin'
        else 'empresa cancelada não volta por aqui'
      end;
  end if;
  if p_status = 'suspended' and v_motivo is null then
    raise exception using errcode = '22023', message = 'suspender pede o motivo — é o que a empresa vai ler';
  end if;
  if length(v_motivo) > 500 then
    raise exception using errcode = '22023', message = 'o motivo passa de 500 caracteres';
  end if;

  update public.tenants
     set status            = p_status,
         status_reason     = case when p_status = 'suspended' then v_motivo end,
         status_changed_at = now()
   where id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, (select auth.uid()),
    case p_status when 'suspended' then 'tenant.suspended' else 'tenant.reactivated' end,
    'tenant', p_tenant_id::text,
    jsonb_build_object('de', v_atual, 'para', p_status, 'motivo', v_motivo)
  );
end;
$$;

revoke execute on function public.admin_set_tenant_status(uuid, public.tenant_status, text) from public, anon;
grant execute on function public.admin_set_tenant_status(uuid, public.tenant_status, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Trocar o plano
-- ─────────────────────────────────────────────────────────────────────────
--
-- O plano é o padrão de origem; `tenant_modules` é a verdade sobre acesso
-- (20260919020100). Trocar o plano liga o que o plano novo inclui e a
-- empresa ainda não tem. Desligar o que ficou fora é **escolha explícita**
-- de quem troca: pode haver módulo vendido à parte. Desligar não apaga
-- nada — o dado fica, o acesso sai, e religar devolve tudo. O Core nunca
-- desliga.

create or replace function public.admin_change_plan(
  p_tenant_id       uuid,
  p_plan_code       text,
  p_disable_outside boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano      public.plans;
  v_status     public.tenant_status;
  v_antigo     text;
  v_ligados    text[];
  v_desligados text[] := '{}';
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'só o Super Admin troca o plano de uma empresa';
  end if;

  select * into v_plano from public.plans p where p.code = p_plan_code and p.is_active;
  if not found then
    raise exception using errcode = '22023', message = 'plano desconhecido ou fora de venda';
  end if;

  select t.status, pl.code into v_status, v_antigo
  from public.tenants t
  left join public.plans pl on pl.id = t.plan_id
  where t.id = p_tenant_id
  for update of t;
  if not found then
    raise exception using errcode = 'P0002', message = 'empresa não encontrada';
  end if;
  if v_status = 'provisioning' then
    raise exception using errcode = '22023', message = 'empresa em provisionamento: conclua antes de trocar o plano';
  end if;
  if v_antigo is not distinct from p_plan_code then
    raise exception using errcode = '22023', message = 'a empresa já está neste plano';
  end if;

  update public.tenants set plan_id = v_plano.id where id = p_tenant_id;

  -- Liga o que o plano inclui: o que não havia, e o que estava desligado.
  with feito as (
    insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
    select p_tenant_id, pm.module_id, true, now()
    from public.plan_modules pm
    where pm.plan_id = v_plano.id
    on conflict (tenant_id, module_id) do update
      set is_enabled = true, enabled_at = now()
      where not public.tenant_modules.is_enabled
    returning module_id
  )
  select coalesce(array_agg(m.code order by m.sort_order), '{}')
    into v_ligados
  from feito f
  join public.modules m on m.id = f.module_id;

  if p_disable_outside then
    with feito as (
      update public.tenant_modules tm
         set is_enabled = false
        from public.modules m
       where tm.tenant_id = p_tenant_id
         and tm.module_id = m.id
         and tm.is_enabled
         and m.code <> 'core'
         and not exists (
           select 1 from public.plan_modules pm
           where pm.plan_id = v_plano.id and pm.module_id = tm.module_id
         )
      returning m.code, m.sort_order
    )
    select coalesce(array_agg(code order by sort_order), '{}') into v_desligados from feito;
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'tenant.plan_changed', 'tenant', p_tenant_id::text,
    jsonb_build_object(
      'de', v_antigo, 'para', p_plan_code,
      'ligados', to_jsonb(v_ligados), 'desligados', to_jsonb(v_desligados)
    )
  );

  return jsonb_build_object('ligados', to_jsonb(v_ligados), 'desligados', to_jsonb(v_desligados));
end;
$$;

revoke execute on function public.admin_change_plan(uuid, text, boolean) from public, anon;
grant execute on function public.admin_change_plan(uuid, text, boolean) to authenticated;
