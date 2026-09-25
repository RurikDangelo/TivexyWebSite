-- Tivexy ERP — a venda
--
-- ─────────────────────────────────────────────────────────────────────────
-- Quem escreve o quê
-- ─────────────────────────────────────────────────────────────────────────
--
-- Venda, itens e pagamentos só fazem sentido juntos, e o PostgREST não tem
-- transação. Então a venda é registrada por uma função, `erp_register_sale()`,
-- **SECURITY INVOKER** — a mesma decisão de `crm_convert_lead()`: cada
-- `insert` lá dentro passa pelo RLS como se a aplicação o tivesse escrito.
--
-- O que a venda **provoca fora dela** — baixa de estoque, conta a receber —
-- não é escrito pela função. É derivado por gatilho, no módulo a que pertence:
-- o estoque reage em 20260925090000, o financeiro em 20260925100000. Por dois
-- motivos:
--
--   1. Quem vende não tem, e não deve ter, permissão de escrever no
--      financeiro. O caixa do mercado registra venda; não lança conta.
--      Com INVOKER, a função não conseguiria criar a conta a receber — e com
--      DEFINER, seria um buraco com nome amigável.
--   2. A venda não sabe que o financeiro existe. Um tenant sem o módulo de
--      estoque vende do mesmo jeito; o gatilho do estoque é que não age.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Venda registrada não muda
-- ─────────────────────────────────────────────────────────────────────────
--
-- Itens, preços e pagamentos são o que aconteceu no balcão. Errou: cancela e
-- registra de novo — o cancelamento fica na história, com motivo e com quem.
-- Isso não depende de a aplicação se comportar:
--
--   - `authenticated` não tem `update` em item nem em pagamento, e na venda
--     só nas colunas do cancelamento;
--   - item e pagamento só entram na venda na transação em que ela nasce;
--   - no commit, gatilhos adiados conferem que os itens somam o subtotal e
--     que os pagamentos somam o total. Uma venda escrita à mão pelo PostgREST,
--     sem a função, não fecha.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Cancelar é permissão própria
-- ─────────────────────────────────────────────────────────────────────────
--
-- Registrar e cancelar são riscos diferentes. O golpe clássico de caixa é
-- registrar, receber, cancelar e ficar com o dinheiro — por isso todo PDV
-- separa as duas coisas. Administrador e gestor cancelam; colaborador não.

insert into public.permissions (code, module_id, name)
select 'erp.sales.cancel', m.id, 'Cancelar vendas'
from public.modules m
where m.code = 'erp'
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.tenant_id is null
  and r.code in ('tenant_admin', 'manager')
  and p.code = 'erp.sales.cancel'
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Numeração por tenant
-- ─────────────────────────────────────────────────────────────────────────
--
-- "Venda nº 42" é o que o cliente guarda no recibo e o que se fala no
-- telefone. Um uuid não serve para isso, e `max(number) + 1` dá o mesmo
-- número a duas vendas simultâneas. O contador trava a linha do tenant até o
-- fim da transação: duas vendas ao mesmo tempo esperam uma pela outra, e
-- recebem números diferentes.

create table public.erp_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key       text not null,
  value     bigint not null default 0,
  primary key (tenant_id, key)
);

comment on table public.erp_counters is
  'Próximo número de cada sequência do tenant. Só as funções do banco leem e escrevem.';

alter table public.erp_counters enable row level security;
-- Sem política, e sem privilégio: ninguém de fora lê nem escreve.
revoke all on public.erp_counters from anon, authenticated;

create or replace function public.erp_next_number(p_tenant_id uuid, p_key text)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.erp_counters as c (tenant_id, key, value)
  values (p_tenant_id, p_key, 1)
  on conflict (tenant_id, key) do update set value = c.value + 1
  returning c.value;
$$;

revoke execute on function public.erp_next_number(uuid, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tabelas
-- ─────────────────────────────────────────────────────────────────────────

create type public.erp_sale_status as enum ('completed', 'cancelled');

create table public.erp_sales (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  number         bigint not null,
  customer_id    uuid,
  status         public.erp_sale_status not null default 'completed',
  sold_at        timestamptz not null default now(),
  subtotal_cents bigint not null,
  discount_cents bigint not null default 0,
  total_cents    bigint not null,
  notes          text,
  -- `users`, e não `tenant_users`: quem vendeu continua sendo quem vendeu
  -- depois de sair da equipe.
  created_by     uuid references public.users (id) on delete set null,
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.users (id) on delete set null,
  cancel_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint erp_sales_number_positive check (number > 0),
  constraint erp_sales_number_unique unique (tenant_id, number),
  constraint erp_sales_amounts check (
    subtotal_cents >= 0
    and discount_cents >= 0
    and discount_cents <= subtotal_cents
    and total_cents = subtotal_cents - discount_cents
  ),
  constraint erp_sales_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint erp_sales_cancel_reason check (
    status <> 'cancelled' or nullif(btrim(cancel_reason), '') is not null
  ),
  constraint erp_sales_tenant_id_key unique (tenant_id, id),
  -- Cliente com venda não se apaga: a venda é história, e o cliente dela
  -- também. Sem `on delete`: a checagem é no fim do comando, o que deixa o
  -- tenant inteiro ser apagado em cascata.
  constraint erp_sales_customer_do_tenant
    foreign key (tenant_id, customer_id) references public.erp_customers (tenant_id, id)
);

comment on table public.erp_sales is
  'Venda registrada. Não muda depois de registrada: cancela-se, com motivo.';

create index erp_sales_tenant_sold_idx on public.erp_sales (tenant_id, sold_at desc);
create index erp_sales_customer_idx on public.erp_sales (tenant_id, customer_id);

create table public.erp_sale_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  sale_id          uuid not null,
  product_id       uuid not null,
  -- Retrato do produto no momento da venda. O nome muda, o preço muda; o que
  -- foi vendido, não.
  description      text not null,
  unit             text not null,
  quantity         numeric(14, 3) not null,
  unit_price_cents bigint not null,
  total_cents      bigint not null,
  position         integer not null default 0,

  constraint erp_sale_items_quantity_positive check (quantity > 0),
  constraint erp_sale_items_price_not_negative check (unit_price_cents >= 0),
  -- O mesmo arredondamento de `lineTotalCents()` no Core. O teste de
  -- contratos confere que os dois lados dão o mesmo número.
  constraint erp_sale_items_total check (total_cents = round(quantity * unit_price_cents)),
  constraint erp_sale_items_unit_known check (unit in ('un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct')),
  constraint erp_sale_items_fraction check (
    public.erp_unit_is_fractional(unit) or quantity = trunc(quantity)
  ),
  constraint erp_sale_items_tenant_id_key unique (tenant_id, id),
  constraint erp_sale_items_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id) on delete cascade,
  -- Produto vendido não se apaga; desativa-se.
  constraint erp_sale_items_product_do_tenant
    foreign key (tenant_id, product_id) references public.erp_products (tenant_id, id)
);

create index erp_sale_items_sale_idx on public.erp_sale_items (tenant_id, sale_id, position);
create index erp_sale_items_product_idx on public.erp_sale_items (tenant_id, product_id);

create table public.erp_sale_payments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  sale_id           uuid not null,
  payment_method_id uuid not null,
  -- Retrato da forma de pagamento: renomear "Crédito" ou mudar o prazo dele
  -- amanhã não reescreve quando o dinheiro de hoje chega.
  method_name       text not null,
  settlement_days   integer not null,
  amount_cents      bigint not null,
  position          integer not null default 0,

  constraint erp_sale_payments_amount_positive check (amount_cents > 0),
  constraint erp_sale_payments_settlement check (settlement_days between 0 and 365),
  constraint erp_sale_payments_tenant_id_key unique (tenant_id, id),
  constraint erp_sale_payments_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id) on delete cascade,
  constraint erp_sale_payments_method_do_tenant
    foreign key (tenant_id, payment_method_id) references public.erp_payment_methods (tenant_id, id)
);

create index erp_sale_payments_sale_idx on public.erp_sale_payments (tenant_id, sale_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. O que o banco carimba, e o que ele recusa
-- ─────────────────────────────────────────────────────────────────────────

-- A venda nasce concluída, agora, com número do banco e com quem registrou.
-- O que vier de fora nessas colunas é ignorado — inclusive `sold_at`: venda
-- com data passada é a porta para mexer no caixa de um dia já fechado.
create or replace function public.erp_sales_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.number := public.erp_next_number(new.tenant_id, 'erp.sales');
  new.status := 'completed';
  new.sold_at := now();
  new.created_at := now();
  new.created_by := auth.uid();
  new.cancelled_at := null;
  new.cancelled_by := null;
  new.cancel_reason := null;
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  if new.customer_id is null
     and public.tenant_setting(new.tenant_id, 'erp.sales_requires_customer') = 'true'::jsonb then
    raise exception using
      errcode = '23514',
      message = 'esta empresa exige cliente identificado em toda venda';
  end if;

  return new;
end;
$$;

create trigger erp_sales_before_insert
  before insert on public.erp_sales
  for each row execute function public.erp_sales_before_insert();

-- Item e pagamento entram só na transação em que a venda nasce.
--
-- `created_at` da venda é `now()`, que no Postgres é o início da transação:
-- só é igual ao `now()` de agora se a venda foi criada nesta mesma transação.
-- Sem isso, um item de preço zero pendurado numa venda de ontem passaria na
-- conferência de totais — e baixaria estoque sem venda nenhuma.
create or replace function public.erp_sale_child_check(p_tenant_id uuid, p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.erp_sales;
begin
  select * into v_venda
  from public.erp_sales s
  where s.id = p_sale_id and s.tenant_id = p_tenant_id;

  if v_venda.id is null then
    raise exception using errcode = 'no_data_found', message = 'venda não encontrada';
  end if;

  if v_venda.created_at <> now() then
    raise exception using
      errcode = '55000',
      message = format(
        'a venda nº %s já foi registrada; item e pagamento não mudam depois — cancele e registre de novo',
        v_venda.number
      );
  end if;
end;
$$;

revoke execute on function public.erp_sale_child_check(uuid, uuid) from public, anon, authenticated;

-- O item é o retrato do produto: nome, unidade e **preço vêm do cadastro**.
--
-- Preço digitado no balcão é a porta mais comum de erro e de fraude de caixa,
-- e desconto é outra coisa — tem coluna própria, aparece na venda e na
-- auditoria. Quem quer vender por outro preço muda o cadastro, com a
-- permissão de quem cuida do cadastro.
create or replace function public.erp_sale_items_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto public.erp_products;
begin
  perform public.erp_sale_child_check(new.tenant_id, new.sale_id);

  select * into v_produto
  from public.erp_products p
  where p.id = new.product_id and p.tenant_id = new.tenant_id;

  if v_produto.id is null then
    raise exception using errcode = 'no_data_found', message = 'produto não encontrado';
  end if;

  if not v_produto.active then
    raise exception using
      errcode = '55000',
      message = format('"%s" está desativado e não entra em venda', v_produto.name);
  end if;

  if not public.erp_unit_is_fractional(v_produto.unit) and new.quantity <> trunc(new.quantity) then
    raise exception using
      errcode = '23514',
      message = format('"%s" se vende por %s, sem fração', v_produto.name, v_produto.unit);
  end if;

  new.description := v_produto.name;
  new.unit := v_produto.unit;
  new.unit_price_cents := v_produto.price_cents;
  new.total_cents := round(new.quantity * v_produto.price_cents);
  return new;
end;
$$;

create trigger erp_sale_items_before_insert
  before insert on public.erp_sale_items
  for each row execute function public.erp_sale_items_before_insert();

create or replace function public.erp_sale_payments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forma public.erp_payment_methods;
begin
  perform public.erp_sale_child_check(new.tenant_id, new.sale_id);

  select * into v_forma
  from public.erp_payment_methods f
  where f.id = new.payment_method_id and f.tenant_id = new.tenant_id;

  if v_forma.id is null then
    raise exception using errcode = 'no_data_found', message = 'forma de pagamento não encontrada';
  end if;

  if not v_forma.active then
    raise exception using
      errcode = '55000',
      message = format('"%s" está desativada e não recebe venda', v_forma.name);
  end if;

  new.method_name := v_forma.name;
  new.settlement_days := v_forma.settlement_days;
  return new;
end;
$$;

create trigger erp_sale_payments_before_insert
  before insert on public.erp_sale_payments
  for each row execute function public.erp_sale_payments_before_insert();

-- A conferência no commit.
--
-- Adiada porque a venda nasce antes dos itens: conferir linha a linha
-- recusaria a primeira inserção. No fim da transação, o que existe precisa
-- fechar — tenha vindo da função ou de três chamadas avulsas ao PostgREST.
create or replace function public.erp_assert_sale_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_venda  public.erp_sales;
  v_itens  integer;
  v_soma   bigint;
  v_pago   bigint;
begin
  if tg_table_name = 'erp_sales' then
    v_id := new.id;
  else
    v_id := new.sale_id;
  end if;

  select * into v_venda from public.erp_sales s where s.id = v_id;
  -- Apagada na mesma transação (a cascata do tenant): nada a conferir.
  if v_venda.id is null then
    return null;
  end if;

  select count(*), coalesce(sum(i.total_cents), 0)
  into v_itens, v_soma
  from public.erp_sale_items i
  where i.sale_id = v_id;

  if v_itens = 0 then
    raise exception using errcode = '23514', message = 'a venda precisa de pelo menos um item';
  end if;

  if v_soma <> v_venda.subtotal_cents then
    raise exception using
      errcode = '23514',
      message = format(
        'os itens da venda nº %s somam %s centavos, e o subtotal diz %s',
        v_venda.number, v_soma, v_venda.subtotal_cents
      );
  end if;

  select coalesce(sum(p.amount_cents), 0) into v_pago
  from public.erp_sale_payments p
  where p.sale_id = v_id;

  if v_pago <> v_venda.total_cents then
    raise exception using
      errcode = '23514',
      message = format(
        'os pagamentos da venda nº %s somam %s centavos, e o total é %s',
        v_venda.number, v_pago, v_venda.total_cents
      );
  end if;

  return null;
end;
$$;

create constraint trigger erp_sales_consistent
  after insert on public.erp_sales
  deferrable initially deferred
  for each row execute function public.erp_assert_sale_consistent();

create constraint trigger erp_sale_items_consistent
  after insert on public.erp_sale_items
  deferrable initially deferred
  for each row execute function public.erp_assert_sale_consistent();

create constraint trigger erp_sale_payments_consistent
  after insert on public.erp_sale_payments
  deferrable initially deferred
  for each row execute function public.erp_assert_sale_consistent();

-- Cancelar: a única mudança que uma venda aceita.
--
-- Carimba quando e quem, exige o motivo, e não volta atrás. O que o
-- cancelamento desfaz fora da venda — devolver ao estoque, cancelar a conta a
-- receber — é dos gatilhos de cada módulo, que olham esta mesma transição.
create or replace function public.erp_sales_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' then
    raise exception using
      errcode = '55000',
      message = format('a venda nº %s já está cancelada', old.number);
  end if;

  if new.status = 'cancelled' then
    if nullif(btrim(coalesce(new.cancel_reason, '')), '') is null then
      raise exception using errcode = '23514', message = 'diga o motivo do cancelamento';
    end if;
    new.cancel_reason := btrim(new.cancel_reason);
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  else
    new.cancel_reason := old.cancel_reason;
  end if;

  return new;
end;
$$;

create trigger erp_sales_before_update
  before update on public.erp_sales
  for each row execute function public.erp_sales_before_update();

create or replace function public.erp_sales_audit_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    new.tenant_id,
    auth.uid(),
    'sale.cancelled',
    'erp_sale',
    new.id::text,
    jsonb_build_object('number', new.number, 'total_cents', new.total_cents, 'reason', new.cancel_reason)
  );
  return null;
end;
$$;

create trigger erp_sales_audit_cancel
  after update of status on public.erp_sales
  for each row
  when (old.status = 'completed' and new.status = 'cancelled')
  execute function public.erp_sales_audit_cancel();

select public.attach_updated_at('public.erp_sales');

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Registrar
-- ─────────────────────────────────────────────────────────────────────────
--
--   p_items     [{"product_id": uuid, "quantity": número}]
--   p_payments  [{"payment_method_id": uuid, "amount_cents": inteiro}]
--
-- Devolve {"id", "number", "total_cents"}.

create or replace function public.erp_register_sale(
  p_tenant_id      uuid,
  p_items          jsonb,
  p_payments       jsonb default '[]'::jsonb,
  p_customer_id    uuid default null,
  p_discount_cents bigint default 0,
  p_notes          text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venda    uuid;
  v_numero   bigint;
  v_linhas   integer;
  v_achados  integer;
  v_subtotal bigint;
  v_total    bigint;
  v_pago     bigint;
begin
  -- A mensagem, não a garantia: quem garante é o RLS de cada `insert`.
  if not public.has_permission(p_tenant_id, 'erp.sales.write') then
    raise exception using
      errcode = '42501',
      message = 'você não tem permissão para registrar venda';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '23514', message = 'a venda precisa de pelo menos um item';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception using errcode = '22023', message = 'pagamentos em formato inválido';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where (e ->> 'quantity') is null
       or (e ->> 'quantity')::numeric <= 0
       or (e ->> 'quantity')::numeric <> round((e ->> 'quantity')::numeric, 3)
  ) then
    raise exception using
      errcode = '22023',
      message = 'quantidade precisa ser maior que zero, com até três casas decimais';
  end if;

  -- O subtotal com o preço do cadastro — o mesmo que o gatilho do item vai
  -- gravar. Se o preço mudar entre esta leitura e a do gatilho, a conferência
  -- do commit recusa, e a venda é registrada de novo com o preço novo.
  select count(*), count(p.id), coalesce(sum(round((e ->> 'quantity')::numeric * p.price_cents)), 0)
  into v_linhas, v_achados, v_subtotal
  from jsonb_array_elements(p_items) e
  left join public.erp_products p
    on p.id = (e ->> 'product_id')::uuid and p.tenant_id = p_tenant_id;

  if v_achados < v_linhas then
    raise exception using errcode = 'no_data_found', message = 'produto não encontrado';
  end if;

  if p_discount_cents is null or p_discount_cents < 0 or p_discount_cents > v_subtotal then
    raise exception using
      errcode = '23514',
      message = 'o desconto precisa ficar entre zero e o valor dos itens';
  end if;
  v_total := v_subtotal - p_discount_cents;

  select coalesce(sum((e ->> 'amount_cents')::bigint), 0) into v_pago
  from jsonb_array_elements(p_payments) e;

  if v_pago <> v_total then
    raise exception using
      errcode = '23514',
      message = format('os pagamentos somam %s centavos, e a venda é de %s', v_pago, v_total);
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.erp_customers c where c.id = p_customer_id and c.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = 'no_data_found', message = 'cliente não encontrado';
  end if;

  insert into public.erp_sales (tenant_id, customer_id, subtotal_cents, discount_cents, total_cents, notes)
  values (p_tenant_id, p_customer_id, v_subtotal, p_discount_cents, v_total, p_notes)
  returning id, number into v_venda, v_numero;

  insert into public.erp_sale_items (tenant_id, sale_id, product_id, quantity, position)
  select p_tenant_id, v_venda, (e ->> 'product_id')::uuid, (e ->> 'quantity')::numeric, (o - 1)::integer
  from jsonb_array_elements(p_items) with ordinality as t(e, o);

  insert into public.erp_sale_payments (tenant_id, sale_id, payment_method_id, amount_cents, position)
  select p_tenant_id, v_venda, (e ->> 'payment_method_id')::uuid, (e ->> 'amount_cents')::bigint,
         (o - 1)::integer
  from jsonb_array_elements(p_payments) with ordinality as t(e, o);

  -- A conferência agora, e não no commit: o erro aparece como erro desta
  -- chamada, com a mensagem certa, em vez de estourar depois.
  set constraints public.erp_sales_consistent, public.erp_sale_items_consistent,
    public.erp_sale_payments_consistent immediate;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id,
    auth.uid(),
    'sale.registered',
    'erp_sale',
    v_venda::text,
    jsonb_build_object('number', v_numero, 'total_cents', v_total)
  );

  return jsonb_build_object('id', v_venda, 'number', v_numero, 'total_cents', v_total);
end;
$$;

comment on function public.erp_register_sale(uuid, jsonb, jsonb, uuid, bigint, text) is
  'Registra venda, itens e pagamentos numa transação. INVOKER: cada escrita passa pelo RLS.';

-- Cancelar é um `update` de duas colunas, e o RLS já decide quem pode. A
-- função existe pela mensagem: sem ela, quem não pode cancelar atualizaria
-- zero linhas, e a tela diria "cancelado" sem ter cancelado nada.
create or replace function public.erp_cancel_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venda public.erp_sales;
begin
  select * into v_venda from public.erp_sales s where s.id = p_sale_id;

  if v_venda.id is null then
    raise exception using errcode = 'no_data_found', message = 'venda não encontrada';
  end if;

  if not public.has_permission(v_venda.tenant_id, 'erp.sales.cancel') then
    raise exception using
      errcode = '42501',
      message = 'você não tem permissão para cancelar venda';
  end if;

  update public.erp_sales
  set status = 'cancelled', cancel_reason = p_reason
  where id = v_venda.id and tenant_id = v_venda.tenant_id;

  return jsonb_build_object('id', v_venda.id, 'number', v_venda.number);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS e privilégios
-- ─────────────────────────────────────────────────────────────────────────

alter table public.erp_sales         enable row level security;
alter table public.erp_sale_items    enable row level security;
alter table public.erp_sale_payments enable row level security;

-- Quem registra precisa ler o que acabou de registrar: `insert ... returning`
-- passa pela política de leitura.
create policy erp_sales_read on public.erp_sales
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'erp.sales.read')
    or public.has_permission(tenant_id, 'erp.sales.write')
  );
create policy erp_sales_insert on public.erp_sales
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));
create policy erp_sales_cancel on public.erp_sales
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.cancel'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.cancel'));

create policy erp_sale_items_read on public.erp_sale_items
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'erp.sales.read')
    or public.has_permission(tenant_id, 'erp.sales.write')
  );
create policy erp_sale_items_insert on public.erp_sale_items
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));

create policy erp_sale_payments_read on public.erp_sale_payments
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'erp.sales.read')
    or public.has_permission(tenant_id, 'erp.sales.write')
  );
create policy erp_sale_payments_insert on public.erp_sale_payments
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));

-- Venda: só as colunas do cancelamento. Item e pagamento: nada. Apagar:
-- nada, em nenhuma das três.
revoke update, delete on public.erp_sales from anon, authenticated;
grant update (status, cancel_reason) on public.erp_sales to authenticated;
revoke update, delete on public.erp_sale_items from anon, authenticated;
revoke update, delete on public.erp_sale_payments from anon, authenticated;
