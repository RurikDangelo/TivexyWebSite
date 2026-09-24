-- Tivexy ERP — catálogo, produtos e estoque
--
-- O segundo módulo de negócio. Como o CRM, ele **não** reimplementa nada do
-- Core: tenant, usuário, papel e permissão continuam vindo de lá, e toda
-- política abaixo consulta as mesmas funções.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A decisão estrutural: estoque é razão, não coluna
-- ─────────────────────────────────────────────────────────────────────────
--
-- A tentação é uma coluna `quantidade` em `erp_products`. Ela é rápida de ler
-- e produz o pior tipo de defeito: no dia em que alguém corrigir o estoque por
-- SQL, por importação, ou em que uma venda falhar no meio, a coluna passa a
-- discordar do que de fato entrou e saiu — **sem erro nenhum**. O sintoma é o
-- inventário do mês não fechar, meses depois, sem ninguém saber desde quando.
--
-- É a mesma família de erro que o CRM já evitou com "a oportunidade não guarda
-- situação própria, ela é a da etapa".
--
-- Aqui a verdade é `erp_stock_movements`: toda entrada, saída e ajuste, para
-- sempre. E como somar o razão inteiro a cada listagem seria caro, existe
-- `erp_stock_balances` — um saldo **mantido por gatilho**, nunca escrito pela
-- aplicação.
--
-- Não são duas verdades. É uma verdade e um índice dela, e o gatilho é o que
-- torna a divergência impossível de escrever em vez de improvável.

-- ─────────────────────────────────────────────────────────────────────────
-- Vocabulário
-- ─────────────────────────────────────────────────────────────────────────

-- Unidade de medida. Enum e não texto livre: `KG`, `Kg`, `kg` e `quilo` na
-- mesma base tornam qualquer relatório por unidade uma adivinhação.
create type public.erp_unit as enum ('un', 'kg', 'g', 'l', 'ml', 'm', 'm2', 'h', 'cx');

-- O que move estoque. `adjustment` existe separado de `in`/`out` de propósito:
-- inventário e correção não são compra nem venda, e misturá-los faz o
-- relatório de giro contar ajuste como movimento comercial.
create type public.erp_movement_kind as enum ('in', 'out', 'adjustment');

-- ─────────────────────────────────────────────────────────────────────────
-- Categorias de produto
-- ─────────────────────────────────────────────────────────────────────────
--
-- É uma das sementes que o Blueprint já declarava e que ficavam registradas
-- como pendentes, porque a tabela não existia. A partir daqui ela aplica.

create table public.erp_product_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_product_categories_name_not_blank check (btrim(name) <> ''),
  constraint erp_product_categories_unique unique (tenant_id, name),
  constraint erp_product_categories_tenant_id_key unique (tenant_id, id)
);

comment on table public.erp_product_categories is
  'Categoria de produto. Semeada pelo Blueprint do nicho.';

create index erp_product_categories_tenant_idx
  on public.erp_product_categories (tenant_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- Produtos
-- ─────────────────────────────────────────────────────────────────────────

create table public.erp_products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  category_id uuid,

  -- Código interno. Único por tenant **quando existe**: nem todo negócio usa,
  -- e exigir faria a pessoa inventar. O índice parcial permite muitos nulos.
  sku         text,
  name        text not null,
  description text,
  unit        public.erp_unit not null default 'un',

  -- Dinheiro em centavos, inteiro. Nunca ponto flutuante — é o engano que só
  -- aparece quando a soma do relatório fecha um centavo fora do extrato.
  price_cents bigint not null default 0,
  cost_cents  bigint not null default 0,

  -- Serviço não tem estoque. Sem esta coluna, "hora de consultoria" apareceria
  -- no inventário com saldo negativo eterno.
  track_stock boolean not null default true,
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint erp_products_name_not_blank check (btrim(name) <> ''),
  constraint erp_products_price_not_negative check (price_cents >= 0),
  constraint erp_products_cost_not_negative check (cost_cents >= 0),
  constraint erp_products_tenant_id_key unique (tenant_id, id),
  constraint erp_products_category_do_tenant
    foreign key (tenant_id, category_id) references public.erp_product_categories (tenant_id, id)
    on delete set null (category_id)
);

comment on table public.erp_products is
  'Produto ou serviço. `track_stock` distingue os dois para o estoque.';
comment on column public.erp_products.price_cents is
  'Centavos, inteiro. Nunca ponto flutuante — a soma precisa fechar com o extrato.';

create index erp_products_tenant_idx on public.erp_products (tenant_id);
create index erp_products_category_idx on public.erp_products (tenant_id, category_id);
create index erp_products_name_idx on public.erp_products (tenant_id, lower(name));
create unique index erp_products_sku_unique
  on public.erp_products (tenant_id, lower(sku)) where sku is not null;
create index erp_products_active_idx on public.erp_products (tenant_id) where is_active;

-- ─────────────────────────────────────────────────────────────────────────
-- Formas de pagamento
-- ─────────────────────────────────────────────────────────────────────────
--
-- A outra semente do Blueprint que ficava pendente.
--
-- ⚠️ Isto é **catálogo**, não integração. Uma linha chamada "Cartão de
-- crédito" não cobra cartão nenhum: ela registra como o cliente disse que
-- pagou. Cobrança de verdade depende de adquirente e credencial, e não existe
-- neste sistema. Ver CLAUDE.md.

create table public.erp_payment_methods (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_payment_methods_name_not_blank check (btrim(name) <> ''),
  constraint erp_payment_methods_unique unique (tenant_id, name),
  constraint erp_payment_methods_tenant_id_key unique (tenant_id, id)
);

comment on table public.erp_payment_methods is
  'Como o cliente disse que pagou. CATÁLOGO — não cobra nada, não integra com adquirente.';

create index erp_payment_methods_tenant_idx
  on public.erp_payment_methods (tenant_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- Estoque: o razão
-- ─────────────────────────────────────────────────────────────────────────

create table public.erp_stock_movements (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null,
  kind       public.erp_movement_kind not null,

  -- Sempre **positiva**. O sinal é do `kind`, não do número: quantidade
  -- negativa com kind `in` seria uma saída disfarçada de entrada, e nenhuma
  -- soma perceberia.
  quantity   numeric(14, 3) not null,

  reason     text,
  -- De onde veio o movimento, quando veio de uma venda. Preenchido pelo
  -- gatilho da venda; nulo em entrada manual e em ajuste.
  sale_id    uuid,
  actor_id   uuid,
  created_at timestamptz not null default now(),

  constraint erp_stock_movements_quantity_positive check (quantity > 0),
  constraint erp_stock_movements_tenant_id_key unique (tenant_id, id),
  constraint erp_stock_movements_product_do_tenant
    foreign key (tenant_id, product_id) references public.erp_products (tenant_id, id)
    on delete cascade,
  constraint erp_stock_movements_actor_do_tenant
    foreign key (tenant_id, actor_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (actor_id)
);

comment on table public.erp_stock_movements is
  'O razão do estoque. Append-only: corrigir é lançar ajuste, nunca editar.';
comment on column public.erp_stock_movements.quantity is
  'Sempre positiva. O sinal vem do kind — negativa aqui seria saída disfarçada de entrada.';

create index erp_stock_movements_product_idx
  on public.erp_stock_movements (tenant_id, product_id, created_at desc);
create index erp_stock_movements_sale_idx
  on public.erp_stock_movements (tenant_id, sale_id) where sale_id is not null;

-- O razão não se reescreve. Corrigir é lançar ajuste, e o ajuste aparece no
-- histórico — que é justamente o que se quer poder auditar depois.
create or replace function public.erp_stock_movements_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'O razão do estoque não se altera. Lance um ajuste.';
end;
$$;

create trigger erp_stock_movements_no_update
  before update or delete on public.erp_stock_movements
  for each row execute function public.erp_stock_movements_append_only();

-- ─────────────────────────────────────────────────────────────────────────
-- Estoque: o saldo
-- ─────────────────────────────────────────────────────────────────────────
--
-- Mantido por gatilho, **nunca escrito pela aplicação**. Não é uma segunda
-- verdade: é um índice da primeira, e o gatilho é o que torna a divergência
-- impossível de escrever em vez de improvável.

create table public.erp_stock_balances (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null,
  quantity   numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),

  primary key (tenant_id, product_id),
  constraint erp_stock_balances_product_do_tenant
    foreign key (tenant_id, product_id) references public.erp_products (tenant_id, id)
    on delete cascade
);

comment on table public.erp_stock_balances is
  'Saldo por produto. Mantido por gatilho a partir do razão — a aplicação nunca escreve aqui.';

create or replace function public.erp_apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta numeric(14, 3);
begin
  -- O sinal vem do tipo. `adjustment` soma o que veio: um ajuste para menos
  -- entra como `out`, e é por isso que `quantity` pode ser sempre positiva.
  delta := case new.kind
             when 'in' then new.quantity
             when 'out' then -new.quantity
             else new.quantity
           end;

  insert into public.erp_stock_balances (tenant_id, product_id, quantity, updated_at)
  values (new.tenant_id, new.product_id, delta, now())
  on conflict (tenant_id, product_id) do update
    set quantity = public.erp_stock_balances.quantity + delta,
        updated_at = now();

  return new;
end;
$$;

create trigger erp_stock_movements_apply
  after insert on public.erp_stock_movements
  for each row execute function public.erp_apply_stock_movement();

comment on function public.erp_apply_stock_movement() is
  'Mantém erp_stock_balances a partir do razão. Único caminho de escrita do saldo.';

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────
--
-- Mesma forma do CRM: membro ativo do tenant **com** a permissão. Super Admin
-- entra em tudo, como no resto do Core — ele não pertence a tenant nenhum.
--
-- As políticas **não** checam `tenant_modules.is_enabled`, pela mesma razão
-- registrada no CRM: desabilitar um módulo é evento comercial, não de
-- segurança. O dado continua sendo do cliente e precisa continuar alcançável
-- para exportação, suporte e reativação.

alter table public.erp_product_categories enable row level security;
alter table public.erp_products           enable row level security;
alter table public.erp_payment_methods    enable row level security;
alter table public.erp_stock_movements    enable row level security;
alter table public.erp_stock_balances     enable row level security;

create policy erp_product_categories_read on public.erp_product_categories
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.read'));
create policy erp_product_categories_write on public.erp_product_categories
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'));

create policy erp_products_read on public.erp_products
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.read'));
create policy erp_products_write on public.erp_products
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.products.write'));

-- Forma de pagamento é catálogo de quem vende: quem registra venda precisa ler.
create policy erp_payment_methods_read on public.erp_payment_methods
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.read'));
create policy erp_payment_methods_write on public.erp_payment_methods
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));

create policy erp_stock_movements_read on public.erp_stock_movements
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'inventory.movements.read'));
create policy erp_stock_movements_write on public.erp_stock_movements
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'inventory.movements.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'inventory.movements.write'));

-- O saldo é só leitura para todo mundo: quem escreve é o gatilho, que roda
-- como dono da função e não passa por aqui.
create policy erp_stock_balances_read on public.erp_stock_balances
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'inventory.stock.read'));

-- E nem privilégio de escrita existe. Uma política ausente negaria de
-- qualquer jeito, mas revogar é a regra direta: quem tentar escrever o saldo
-- à mão recebe "permission denied", não "nenhuma linha afetada".
revoke insert, update, delete on public.erp_stock_balances from authenticated;

-- `tenant_id` não é editável, como no resto do sistema: o RLS decide quais
-- linhas alguém enxerga, não se os valores de uma linha fazem sentido juntos.
revoke update (tenant_id) on public.erp_product_categories from authenticated;
revoke update (tenant_id) on public.erp_products           from authenticated;
revoke update (tenant_id) on public.erp_payment_methods    from authenticated;

select public.attach_updated_at('public.erp_product_categories');
select public.attach_updated_at('public.erp_products');
select public.attach_updated_at('public.erp_payment_methods');
