-- Tivexy Automações — gatilho, condição, ação, dentro do banco
--
-- ─────────────────────────────────────────────────────────────────────────
-- O que é, e o que não é
-- ─────────────────────────────────────────────────────────────────────────
--
-- Um motor **interno**: um evento do próprio sistema (lead criado, venda
-- registrada, saldo no mínimo) passa por condições simples e dispara uma ação
-- do próprio sistema (avisar alguém dentro do Tivexy, criar uma atividade no
-- CRM). Nada sai para fora: não há e-mail, WhatsApp nem webhook aqui — esses
-- dependem de credencial e de provedor (🔒), e não existem nem simulados.
--
-- ─────────────────────────────────────────────────────────────────────────
-- As três decisões
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1. **O evento nasce no banco.** Gatilhos nas tabelas de domínio chamam
--    `automation_emit()`. Assim a automação dispara por qualquer caminho — a
--    tela, a API, a conversão de um lead — e não só quando a aplicação lembra.
--
-- 2. **Automação nunca derruba o negócio.** Cada regra roda num bloco próprio
--    (`begin … exception`): se a ação falha, o erro vai para
--    `automation_runs` e a venda continua registrada. O contrário — uma venda
--    recusada porque um aviso falhou — seria o motor valendo mais que o
--    negócio.
--
-- 3. **Quem escreve a regra precisa poder fazer o que ela faz.** A ação roda
--    como o banco (é gatilho), então a permissão é conferida ao **escrever** a
--    regra: criar atividade no CRM por automação pede `crm.activities.write`
--    de quem cria a regra. Sem isso, `automation.rules.write` seria uma porta
--    lateral para escrever onde a pessoa não pode.
--
-- E um freio: automação não dispara automação. Uma variável de transação
-- marca que o motor está rodando, e eventos nascidos dentro dele são
-- ignorados — laço infinito é o defeito clássico de todo motor de regras.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Avisos no sistema — Core
-- ─────────────────────────────────────────────────────────────────────────
--
-- O aviso é da pessoa: só ela lê, e só ela marca como lido. Nasce apenas de
-- função do banco. Não é e-mail — aparece no sino, dentro do Tivexy.

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  title      text not null,
  body       text,
  -- Só caminho interno: um aviso não leva ninguém para fora do sistema.
  link       text,
  rule_id    uuid,
  created_at timestamptz not null default now(),
  read_at    timestamptz,

  constraint notifications_title_not_blank check (btrim(title) <> '' and length(title) <= 200),
  constraint notifications_body_size check (body is null or length(body) <= 1000),
  constraint notifications_link_internal check (link is null or link ~ '^/[A-Za-z0-9/_-]*$'),
  constraint notifications_tenant_id_key unique (tenant_id, id)
);

comment on table public.notifications is
  'Aviso no sistema para uma pessoa. Não é e-mail. Nasce só de função do banco.';

create index notifications_unread_idx
  on public.notifications (user_id, tenant_id, created_at desc)
  where read_at is null;
create index notifications_user_idx on public.notifications (user_id, tenant_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_read_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
create policy notifications_mark_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id))
  with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));

-- Marcar como lido é a única escrita de fora.
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Regras
-- ─────────────────────────────────────────────────────────────────────────

create table public.automation_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  name          text not null,
  -- As listas são as de `AUTOMATION_TRIGGERS` e `AUTOMATION_ACTIONS` no Core;
  -- o teste de contratos compara.
  trigger       text not null,
  -- [{"campo": "total", "operador": "gte", "valor": 10000}] — todas valem (E).
  conditions    jsonb not null default '[]'::jsonb,
  action        text not null,
  action_params jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint automation_rules_name_not_blank check (btrim(name) <> ''),
  constraint automation_rules_trigger_known check (
    trigger in ('crm.lead.created', 'crm.deal.stage_changed', 'erp.sale.registered', 'inventory.stock.low')
  ),
  constraint automation_rules_action_known check (action in ('core.notify', 'crm.activity.create')),
  constraint automation_rules_conditions_list check (
    jsonb_typeof(conditions) = 'array' and jsonb_array_length(conditions) <= 10
  ),
  constraint automation_rules_params_object check (jsonb_typeof(action_params) = 'object'),
  -- Atividade do CRM precisa de um lead ou de uma oportunidade a que se ligar.
  constraint automation_rules_activity_needs_crm_event check (
    action <> 'crm.activity.create' or trigger in ('crm.lead.created', 'crm.deal.stage_changed')
  ),
  constraint automation_rules_tenant_id_key unique (tenant_id, id)
);

comment on table public.automation_rules is
  'Quando <gatilho>, se <condições>, então <ação>. Tudo interno: nenhuma ação fala com serviço externo.';

create index automation_rules_trigger_idx
  on public.automation_rules (tenant_id, trigger) where active;

alter table public.notifications
  add constraint notifications_rule_do_tenant
  foreign key (tenant_id, rule_id) references public.automation_rules (tenant_id, id)
  on delete set null (rule_id);

create table public.automation_runs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  rule_id    uuid not null,
  trigger    text not null,
  outcome    text not null,
  detail     text,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint automation_runs_outcome check (outcome in ('executed', 'failed')),
  constraint automation_runs_tenant_id_key unique (tenant_id, id),
  constraint automation_runs_rule_do_tenant
    foreign key (tenant_id, rule_id) references public.automation_rules (tenant_id, id)
    on delete cascade
);

comment on table public.automation_runs is
  'Cada vez que uma regra rodou — e, quando falhou, o motivo. Só o motor escreve.';

create index automation_runs_tenant_idx on public.automation_runs (tenant_id, created_at desc);
create index automation_runs_rule_idx on public.automation_runs (tenant_id, rule_id, created_at desc);

select public.attach_updated_at('public.automation_rules');

alter table public.automation_rules enable row level security;
alter table public.automation_runs  enable row level security;

create policy automation_rules_read on public.automation_rules
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.read'));

-- Escrever pede `automation.rules.write` e, para criar atividade, também
-- `crm.activities.write`: quem escreve a regra precisa poder fazer o que ela faz.
create policy automation_rules_insert on public.automation_rules
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.has_permission(tenant_id, 'automation.rules.write')
      and (action <> 'crm.activity.create' or public.has_permission(tenant_id, 'crm.activities.write'))
    )
  );
create policy automation_rules_update on public.automation_rules
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.write'))
  with check (
    public.is_super_admin()
    or (
      public.has_permission(tenant_id, 'automation.rules.write')
      and (action <> 'crm.activity.create' or public.has_permission(tenant_id, 'crm.activities.write'))
    )
  );
create policy automation_rules_delete on public.automation_rules
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.write'));

create policy automation_runs_read on public.automation_runs
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.read'));

select public.lock_tenant_id('public.automation_rules');
revoke update (created_by, created_at) on public.automation_rules from authenticated;
revoke insert, update, delete on public.automation_runs from anon, authenticated;

create or replace function public.automation_rules_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger automation_rules_before_write
  before insert or update on public.automation_rules
  for each row execute function public.automation_rules_before_write();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. O motor
-- ─────────────────────────────────────────────────────────────────────────

-- As condições, todas (E). Texto compara sem caixa; número compara número.
-- Campo ausente ou nulo não satisfaz nada: "valor ≥ 100" não vale para quem
-- não tem valor. É a mesma regra de `automationMatches()` no Core, e o teste
-- de contratos roda os dois lados nos mesmos casos.
create or replace function public.automation_matches(p_conditions jsonb, p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_c        jsonb;
  v_op       text;
  v_atual    jsonb;
  v_esperado jsonb;
begin
  for v_c in select value from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) loop
    v_op := v_c ->> 'operador';
    v_atual := p_payload -> (v_c ->> 'campo');
    v_esperado := v_c -> 'valor';

    if v_atual is null or v_atual = 'null'::jsonb or v_esperado is null or v_esperado = 'null'::jsonb then
      return false;
    end if;

    if v_op = 'eq' then
      if lower(v_atual #>> '{}') <> lower(v_esperado #>> '{}') then return false; end if;
    elsif v_op = 'neq' then
      if lower(v_atual #>> '{}') = lower(v_esperado #>> '{}') then return false; end if;
    elsif v_op in ('gte', 'lte') then
      if jsonb_typeof(v_atual) <> 'number' or jsonb_typeof(v_esperado) <> 'number' then
        return false;
      end if;
      if v_op = 'gte' and v_atual::numeric < v_esperado::numeric then return false; end if;
      if v_op = 'lte' and v_atual::numeric > v_esperado::numeric then return false; end if;
    elsif v_op = 'contains' then
      if strpos(lower(v_atual #>> '{}'), lower(v_esperado #>> '{}')) = 0 then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- R$ 1.234,56 — sem depender do `lc_numeric` do servidor.
create or replace function public.format_brl(p_centavos bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || translate(to_char(p_centavos / 100.0, 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- O modelo com as variáveis do evento: "{{nome}} chegou por {{origem}}".
-- Dinheiro sai formatado; número sai com vírgula; variável ausente vira vazio.
--
-- Uma passada só, da esquerda para a direita: o que entra no lugar de uma
-- variável não é relido. Um lead chamado "{{origem}}" aparece como
-- "{{origem}}" — o dado de quem preenche não vira modelo.
create or replace function public.automation_render(p_template text, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_resto text := coalesce(p_template, '');
  v_saida text := '';
  v_chave text;
  v_valor jsonb;
  v_pos   integer;
begin
  loop
    v_chave := (regexp_match(v_resto, '\{\{([a-z_]+)\}\}'))[1];
    exit when v_chave is null;
    v_pos := strpos(v_resto, '{{' || v_chave || '}}');
    v_valor := p_payload -> v_chave;
    v_saida := v_saida || left(v_resto, v_pos - 1) || case
      when v_valor is null or v_valor = 'null'::jsonb then ''
      when v_chave in ('valor', 'total') and jsonb_typeof(v_valor) = 'number'
        then public.format_brl(round(v_valor::numeric)::bigint)
      -- "4." vira "4": o FM tira os zeros, e a vírgula que sobra sai junto.
      when jsonb_typeof(v_valor) = 'number'
        then rtrim(replace(to_char(v_valor::numeric, 'FM999999999990.999'), '.', ','), ',')
      else v_valor #>> '{}'
    end;
    v_resto := substr(v_resto, v_pos + length(v_chave) + 4);
  end loop;
  return v_saida || v_resto;
end;
$$;

-- A ação de uma regra. Devolve o que fez, em uma frase, para o registro.
create or replace function public.automation_run_action(
  p_regra   public.automation_rules,
  p_payload jsonb,
  p_link    text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo  text;
  v_texto   text;
  v_destino text := p_regra.action_params ->> 'destino';
  v_dono    uuid;
  v_n       integer := 0;
  v_fuso    text;
  v_prazo   integer;
begin
  if p_regra.action = 'core.notify' then
    v_titulo := left(btrim(public.automation_render(p_regra.action_params ->> 'titulo', p_payload)), 200);
    v_texto := nullif(left(btrim(public.automation_render(p_regra.action_params ->> 'texto', p_payload)), 1000), '');
    if v_titulo is null or v_titulo = '' then
      raise exception 'o aviso ficou sem título';
    end if;

    insert into public.notifications (tenant_id, user_id, title, body, link, rule_id)
    select distinct p_regra.tenant_id, tu.user_id, v_titulo, v_texto, p_link, p_regra.id
    from public.tenant_users tu
    where tu.tenant_id = p_regra.tenant_id
      and tu.status = 'active'
      and (
        (v_destino = 'usuario' and tu.user_id = (p_regra.action_params ->> 'usuario')::uuid)
        or (v_destino = 'responsavel' and tu.user_id = (p_payload ->> 'responsavel_id')::uuid)
        or (
          v_destino = 'permissao'
          and exists (
            select 1
            from public.role_permissions rp
            join public.permissions p on p.id = rp.permission_id
            where rp.role_id = tu.role_id and p.code = p_regra.action_params ->> 'permissao'
          )
        )
      );
    get diagnostics v_n = row_count;
    return case v_n when 0 then 'ninguém para avisar' when 1 then '1 aviso' else v_n || ' avisos' end;
  end if;

  if p_regra.action = 'crm.activity.create' then
    v_fuso := coalesce(public.tenant_setting(p_regra.tenant_id, 'core.timezone') #>> '{}', 'America/Sao_Paulo');
    v_prazo := coalesce((p_regra.action_params ->> 'dias')::integer, 0);
    v_dono := case
      when p_regra.action_params ->> 'responsavel' = 'responsavel' then (p_payload ->> 'responsavel_id')::uuid
      else (p_regra.action_params ->> 'responsavel')::uuid
    end;

    insert into public.crm_activities (tenant_id, subject, due_at, owner_id, lead_id, deal_id)
    values (
      p_regra.tenant_id,
      left(btrim(public.automation_render(p_regra.action_params ->> 'titulo', p_payload)), 200),
      ((public.tenant_date(p_regra.tenant_id) + v_prazo)::timestamp + time '23:59') at time zone v_fuso,
      v_dono,
      case when p_regra.trigger = 'crm.lead.created' then (p_payload ->> 'id')::uuid end,
      case when p_regra.trigger = 'crm.deal.stage_changed' then (p_payload ->> 'id')::uuid end
    );
    return 'atividade criada';
  end if;

  raise exception 'ação desconhecida: %', p_regra.action;
end;
$$;

-- Emitir um evento: cada regra ativa do gatilho, se as condições valem, roda
-- a ação — num bloco próprio, que falha sozinho.
create or replace function public.automation_emit(
  p_tenant_id uuid,
  p_trigger   text,
  p_payload   jsonb,
  p_link      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regra   public.automation_rules;
  v_detalhe text;
begin
  -- Automação não dispara automação.
  if coalesce(current_setting('tivexy.automation_running', true), '') = 'on' then
    return;
  end if;
  if not public.tenant_module_enabled(p_tenant_id, 'automation') then
    return;
  end if;

  perform set_config('tivexy.automation_running', 'on', true);

  for v_regra in
    select * from public.automation_rules r
    where r.tenant_id = p_tenant_id and r.trigger = p_trigger and r.active
    order by r.created_at, r.id
  loop
    if not public.automation_matches(v_regra.conditions, p_payload) then
      continue;
    end if;
    begin
      v_detalhe := public.automation_run_action(v_regra, p_payload, p_link);
      insert into public.automation_runs (tenant_id, rule_id, trigger, outcome, detail, payload)
      values (p_tenant_id, v_regra.id, p_trigger, 'executed', v_detalhe, p_payload);
    exception when others then
      insert into public.automation_runs (tenant_id, rule_id, trigger, outcome, detail, payload)
      values (p_tenant_id, v_regra.id, p_trigger, 'failed', left(sqlerrm, 500), p_payload);
    end;
  end loop;

  perform set_config('tivexy.automation_running', '', true);
end;
$$;

revoke execute on function public.automation_run_action(public.automation_rules, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.automation_emit(uuid, text, jsonb, text)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Os eventos
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.automation_on_lead_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.automation_emit(
    new.tenant_id,
    'crm.lead.created',
    jsonb_build_object('id', new.id, 'nome', new.name, 'origem', new.source, 'responsavel_id', new.owner_id),
    '/crm/leads'
  );
  return null;
end;
$$;

create trigger automation_on_lead_created
  after insert on public.crm_leads
  for each row execute function public.automation_on_lead_created();

create or replace function public.automation_on_deal_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etapa public.crm_pipeline_stages;
begin
  select * into v_etapa from public.crm_pipeline_stages s where s.id = new.stage_id;
  perform public.automation_emit(
    new.tenant_id,
    'crm.deal.stage_changed',
    jsonb_build_object(
      'id', new.id,
      'titulo', new.title,
      'valor', new.value_cents,
      'etapa', v_etapa.name,
      'situacao', v_etapa.kind::text,
      'responsavel_id', new.owner_id
    ),
    '/crm/oportunidades/' || new.id
  );
  return null;
end;
$$;

create trigger automation_on_deal_stage
  after update of stage_id on public.crm_deals
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function public.automation_on_deal_stage();

create or replace function public.automation_on_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.automation_emit(
    new.tenant_id,
    'erp.sale.registered',
    jsonb_build_object(
      'id', new.id,
      'numero', new.number,
      'total', new.total_cents,
      'cliente', (select c.name from public.erp_customers c where c.id = new.customer_id),
      'responsavel_id', new.created_by
    ),
    '/erp/vendas/' || new.id
  );
  return null;
end;
$$;

create trigger automation_on_sale
  after insert on public.erp_sales
  for each row execute function public.automation_on_sale();

-- Saldo no mínimo: só na **travessia** — de acima para no mínimo ou abaixo.
-- Avisar a cada venda de um produto já no mínimo seria ruído, e ruído é o
-- que faz as pessoas desligarem os avisos.
create or replace function public.automation_on_stock_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto public.erp_products;
begin
  select * into v_produto from public.erp_products p where p.id = new.product_id;
  if v_produto.min_stock is null or v_produto.min_stock <= 0 then
    return null;
  end if;
  if new.quantity > v_produto.min_stock then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.quantity <= v_produto.min_stock then
    return null;
  end if;

  perform public.automation_emit(
    new.tenant_id,
    'inventory.stock.low',
    jsonb_build_object(
      'id', v_produto.id,
      'produto', v_produto.name,
      'saldo', new.quantity,
      'minimo', v_produto.min_stock,
      'unidade', v_produto.unit
    ),
    '/erp/produtos/' || v_produto.id
  );
  return null;
end;
$$;

create trigger automation_on_stock_level
  after insert or update of quantity on public.inventory_stock_levels
  for each row execute function public.automation_on_stock_level();
