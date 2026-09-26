-- Tivexy ERP — o cadastro: categorias, produtos, clientes e formas de pagamento
--
-- O segundo módulo de negócio, com as decisões do CRM: toda tabela tem
-- `unique (tenant_id, id)` e toda referência leva o `tenant_id` junto, então
-- apontar para outro tenant é impossível de escrever. Dinheiro em centavos,
-- inteiro. Quantidade em `numeric(14,3)`: o mercado vende 0,350 kg.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 0. O banco passa a saber o padrão das configurações
-- ─────────────────────────────────────────────────────────────────────────
--
-- `tenants.settings` guarda só o que a empresa mudou (ver `overridesFrom`).
-- Até aqui só a aplicação lia configuração, e ela sabe os padrões pelo Core.
-- A venda é registrada por função no banco, e precisa saber se "venda exige
-- cliente" e se "baixa estoque na venda" — inclusive quando a empresa nunca
-- mexeu nelas. O padrão passa a existir aqui também, e o teste de contratos
-- compara esta tabela com `TENANT_SETTINGS`, nos dois sentidos.

create table public.setting_defaults (
  key           text primary key,
  module        text not null references public.modules (code),
  default_value jsonb not null
);

comment on table public.setting_defaults is
  'Padrão de cada configuração, para as funções do banco. Espelha TENANT_SETTINGS; o teste de contratos compara.';

insert into public.setting_defaults (key, module, default_value) values
  ('core.currency',                 'core',      '"BRL"'),
  ('core.timezone',                 'core',      '"America/Sao_Paulo"'),
  ('crm.contact_requires_document', 'crm',       'false'),
  ('erp.sales_requires_customer',   'erp',       'true'),
  ('inventory.deduct_on_sale',      'inventory', 'true');

alter table public.setting_defaults enable row level security;
create policy setting_defaults_read on public.setting_defaults
  for select to authenticated using (true);
create policy setting_defaults_write on public.setting_defaults
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- O valor efetivo: o que a empresa escolheu, ou o padrão.
--
-- Interna: só as funções do banco chamam. Quem está do lado de fora lê
-- `tenants.settings` pelo RLS, como sempre leu.
create or replace function public.tenant_setting(p_tenant_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select t.settings -> p_key from public.tenants t where t.id = p_tenant_id),
    (select d.default_value from public.setting_defaults d where d.key = p_key)
  );
$$;

create or replace function public.tenant_module_enabled(p_tenant_id uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_modules tm
    join public.modules m on m.id = tm.module_id
    where tm.tenant_id = p_tenant_id and m.code = p_module and tm.is_enabled
  );
$$;

-- O dia do tenant — de um instante, ou de agora.
--
-- "Hoje" depende de onde a empresa está: às 22h de Manaus já é amanhã em UTC.
-- O vencimento de uma venda a prazo e a data de um recebimento são dias do
-- tenant, não do servidor. Fuso inválido não derruba a venda: cai no padrão,
-- que é o que a tela de configurações mostraria.
create or replace function public.tenant_date(p_tenant_id uuid, p_at timestamptz default now())
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fuso text := public.tenant_setting(p_tenant_id, 'core.timezone') #>> '{}';
begin
  return (p_at at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
exception
  when invalid_parameter_value then
    return (p_at at time zone 'America/Sao_Paulo')::date;
end;
$$;

revoke execute on function public.tenant_setting(uuid, text) from public, anon, authenticated;
revoke execute on function public.tenant_module_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function public.tenant_date(uuid, timestamptz) from public, anon, authenticated;

-- A unidade decide se a quantidade tem fração: o mercado vende 0,350 kg; a
-- cafeteria não vende 1,5 café. Uma função, e não a lista repetida: a
-- constraint do item e os gatilhos de venda e de estoque chamam esta mesma,
-- e o teste de contratos compara com `UNIT_INFO` do Core.
create or replace function public.erp_unit_is_fractional(p_unit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_unit in ('kg', 'g', 'l', 'ml', 'm');
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Categorias de produto
-- ─────────────────────────────────────────────────────────────────────────

create table public.erp_product_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_product_categories_name_not_blank check (btrim(name) <> ''),
  constraint erp_product_categories_name_unique unique (tenant_id, name),
  constraint erp_product_categories_tenant_id_key unique (tenant_id, id)
);

comment on table public.erp_product_categories is
  'Categoria de produto. Semeada pelo Blueprint: "Cafés" na cafeteria, "Hortifruti" no mercado.';

create index erp_product_categories_tenant_idx
  on public.erp_product_categories (tenant_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Produtos
-- ─────────────────────────────────────────────────────────────────────────

create table public.erp_products (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  category_id  uuid,
  name         text not null,
  description  text,
  -- Código interno e código de barras. Os dois opcionais, os dois únicos por
  -- tenant quando existem: dois produtos com o mesmo código de barras fazem
  -- o leitor do caixa escolher um — o errado, metade das vezes.
  sku          text,
  barcode      text,
  -- A lista é a de `PRODUCT_UNITS`, no Core. O teste de contratos compara.
  unit         text not null default 'un',
  price_cents  bigint not null default 0,
  cost_cents   bigint,
  -- Serviço e item preparado na hora não têm estoque. Quem não controla não
  -- é baixado na venda, e não aparece com saldo negativo para sempre.
  track_stock  boolean not null default true,
  min_stock    numeric(14, 3),
  -- Produto com venda não se apaga — a venda aponta para ele. Desativar tira
  -- da tela de venda e mantém o histórico.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint erp_products_name_not_blank check (btrim(name) <> ''),
  constraint erp_products_unit_known check (unit in ('un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct')),
  constraint erp_products_price_not_negative check (price_cents >= 0),
  constraint erp_products_cost_not_negative check (cost_cents is null or cost_cents >= 0),
  constraint erp_products_min_stock_not_negative check (min_stock is null or min_stock >= 0),
  constraint erp_products_tenant_id_key unique (tenant_id, id),
  constraint erp_products_category_do_tenant
    foreign key (tenant_id, category_id) references public.erp_product_categories (tenant_id, id)
    on delete set null (category_id)
);

comment on table public.erp_products is
  'Produto ou serviço vendável. Preço e custo em centavos; unidade decide se a quantidade tem fração.';

create unique index erp_products_sku_per_tenant
  on public.erp_products (tenant_id, lower(sku)) where sku is not null;
create unique index erp_products_barcode_per_tenant
  on public.erp_products (tenant_id, barcode) where barcode is not null;
create index erp_products_tenant_idx on public.erp_products (tenant_id, lower(name));
create index erp_products_category_idx on public.erp_products (tenant_id, category_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Clientes do ERP
-- ─────────────────────────────────────────────────────────────────────────
--
-- Cadastro próprio, e não a pessoa do CRM: a cafeteria não tem CRM, e a venda
-- dela precisa de cliente mesmo assim. Ligar os dois fica para quando um
-- tenant tiver os dois módulos e pedir — ver
-- docs/16-DECISIONS/ADR-004-cliente-do-erp-nao-e-pessoa-do-crm.md.

create table public.erp_customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  document   text,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_customers_name_not_blank check (btrim(name) <> ''),
  constraint erp_customers_document_format
    check (document is null or document ~ '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$'),
  constraint erp_customers_tenant_id_key unique (tenant_id, id)
);

comment on table public.erp_customers is
  'Cliente de venda. Cadastro do ERP — não é a pessoa do CRM (ADR-004).';

create unique index erp_customers_document_per_tenant
  on public.erp_customers (tenant_id, document) where document is not null;
create index erp_customers_tenant_idx on public.erp_customers (tenant_id, lower(name));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Formas de pagamento
-- ─────────────────────────────────────────────────────────────────────────
--
-- `settlement_days` é quando o dinheiro chega. Zero é à vista — dinheiro,
-- Pix, débito —, e a venda já entra no caixa como recebida. Mais que zero é a
-- prazo — crédito cai em 30 dias —, e a venda gera conta a receber. É o que
-- separa o fluxo de caixa realizado do previsto sem ninguém lançar à mão.
--
-- **Nada aqui cobra, recebe ou fala com banco.** É o nome de como o cliente
-- pagou, e quando o dinheiro deve chegar. Boleto e maquininha integrados são
-- externos (🔒) e não existem.

create table public.erp_payment_methods (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  name            text not null,
  code            text,
  settlement_days integer not null default 0,
  active          boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint erp_payment_methods_name_not_blank check (btrim(name) <> ''),
  constraint erp_payment_methods_code_format check (code is null or code ~ '^[a-z][a-z0-9_]*$'),
  constraint erp_payment_methods_settlement check (settlement_days between 0 and 365),
  constraint erp_payment_methods_name_unique unique (tenant_id, name),
  constraint erp_payment_methods_tenant_id_key unique (tenant_id, id)
);

comment on table public.erp_payment_methods is
  'Como o cliente pagou, e em quantos dias o dinheiro chega. Não cobra nem recebe nada.';

create index erp_payment_methods_tenant_idx on public.erp_payment_methods (tenant_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at e RLS
-- ─────────────────────────────────────────────────────────────────────────

select public.attach_updated_at('public.erp_product_categories');
select public.attach_updated_at('public.erp_products');
select public.attach_updated_at('public.erp_customers');
select public.attach_updated_at('public.erp_payment_methods');

alter table public.erp_product_categories enable row level security;
alter table public.erp_products           enable row level security;
alter table public.erp_customers          enable row level security;
alter table public.erp_payment_methods    enable row level security;

create policy erp_product_categories_read on public.erp_product_categories
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.read'));
create policy erp_product_categories_write on public.erp_product_categories
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'));

-- Produto tem permissão de exclusão própria no catálogo: a política de
-- `delete` é separada (ver AUTHORIZATION.md, "`for all` inclui `delete`").
create policy erp_products_read on public.erp_products
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'erp.products.read')
    -- Quem vende precisa ver o que vende, mesmo sem cuidar do cadastro.
    or public.has_permission(tenant_id, 'erp.sales.write')
  );
create policy erp_products_insert on public.erp_products
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'));
create policy erp_products_update on public.erp_products
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'));
create policy erp_products_delete on public.erp_products
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.delete'));

create policy erp_customers_read on public.erp_customers
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'erp.customers.read')
    or public.has_permission(tenant_id, 'erp.sales.write')
  );
create policy erp_customers_write on public.erp_customers
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.customers.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.customers.write'));

-- Forma de pagamento é configuração: quem vende lê, quem configura escreve.
-- Configura quem tem `core.settings.write` — o prazo de cada forma decide
-- quando a venda vira dinheiro no caixa, e isso não é decisão de balcão.
create policy erp_payment_methods_read on public.erp_payment_methods
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'erp.sales.read')
    or public.has_permission(tenant_id, 'erp.sales.write')
    or public.has_permission(tenant_id, 'finance.receivables.read')
  );
create policy erp_payment_methods_write on public.erp_payment_methods
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'core.settings.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'core.settings.write'));

-- `tenant_id` não se edita — do jeito que funciona; ver 20260925065000.
select public.lock_tenant_id('public.erp_product_categories');
select public.lock_tenant_id('public.erp_products');
select public.lock_tenant_id('public.erp_customers');
select public.lock_tenant_id('public.erp_payment_methods');
