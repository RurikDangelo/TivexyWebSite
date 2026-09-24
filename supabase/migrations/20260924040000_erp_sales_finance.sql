-- Tivexy ERP — vendas e financeiro
--
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠️ O que este arquivo NÃO faz, e não deve fazer
-- ─────────────────────────────────────────────────────────────────────────
--
-- Nada aqui emite nota fiscal, cobra cartão, gera boleto ou fala com banco.
-- `erp_payment_methods` é catálogo — registra **como o cliente disse que
-- pagou** — e `finance_entries` é um livro de contas a pagar e a receber.
--
-- Registrar que alguém pagou não é receber. Apresentar qualquer uma dessas
-- tabelas como emissão fiscal ou como cobrança é o que o CLAUDE.md proíbe, e
-- é proibido porque tem consequência legal, não estética.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A decisão estrutural: total é derivado, venda tem rascunho
-- ─────────────────────────────────────────────────────────────────────────
--
-- `erp_sales.total_cents` **não é digitado**. Ele é a soma dos itens menos o
-- desconto, mantida por gatilho. Guardar um total que alguém digita ao lado de
-- itens que alguém edita é manter duas verdades, e elas divergem no primeiro
-- item corrigido — sem erro, só relatório errado. Mesma família do estoque.
--
-- E a venda nasce `draft`. Confirmar é o que baixa estoque e gera o
-- recebimento: enquanto é rascunho, nada aconteceu no mundo. Sem esse estado,
-- montar uma venda item a item mexeria no estoque a cada linha, e desistir no
-- meio deixaria o inventário errado.

create type public.erp_sale_status as enum ('draft', 'confirmed', 'cancelled');

create type public.finance_entry_kind as enum ('payable', 'receivable');

-- ─────────────────────────────────────────────────────────────────────────
-- Vendas
-- ─────────────────────────────────────────────────────────────────────────

create table public.erp_sales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,

  -- Número sequencial **por tenant**, atribuído na confirmação. Rascunho não
  -- gasta número: desistir de uma venda deixaria um buraco na sequência, e
  -- buraco em sequência de venda é a primeira coisa que um contador pergunta.
  number     integer,

  status     public.erp_sale_status not null default 'draft',

  -- O cliente. Vem do CRM — não há cadastro paralelo de cliente no ERP, que
  -- seria exatamente a duplicação que o CLAUDE.md proíbe entre módulos.
  company_id uuid,
  contact_id uuid,

  discount_cents bigint not null default 0,
  total_cents    bigint not null default 0,

  sold_at    timestamptz,
  notes      text,
  owner_id   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_sales_discount_not_negative check (discount_cents >= 0),
  constraint erp_sales_total_not_negative check (total_cents >= 0),
  -- Confirmada tem número e data; rascunho não. Cancelada preserva as duas:
  -- ela aconteceu e foi desfeita, e apagar o número reabriria o buraco.
  constraint erp_sales_number_consistency
    check ((status = 'draft') = (number is null)),
  constraint erp_sales_number_unique unique (tenant_id, number),
  constraint erp_sales_tenant_id_key unique (tenant_id, id),
  constraint erp_sales_company_do_tenant
    foreign key (tenant_id, company_id) references public.crm_companies (tenant_id, id)
    on delete set null (company_id),
  constraint erp_sales_contact_do_tenant
    foreign key (tenant_id, contact_id) references public.crm_contacts (tenant_id, id)
    on delete set null (contact_id),
  constraint erp_sales_owner_do_tenant
    foreign key (tenant_id, owner_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (owner_id)
);

comment on table public.erp_sales is
  'Venda. Nasce rascunho; confirmar é o que baixa estoque e gera recebimento.';
comment on column public.erp_sales.total_cents is
  'Derivado dos itens menos o desconto, por gatilho. Nunca digitado.';
comment on column public.erp_sales.number is
  'Sequencial por tenant, atribuído na confirmação. Rascunho não gasta número.';

create index erp_sales_tenant_idx on public.erp_sales (tenant_id, created_at desc);
create index erp_sales_company_idx on public.erp_sales (tenant_id, company_id);
create index erp_sales_open_idx on public.erp_sales (tenant_id) where status = 'draft';

create table public.erp_sale_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sale_id     uuid not null,
  product_id  uuid not null,

  quantity    numeric(14, 3) not null,
  -- O preço **no momento da venda**, copiado do produto. Não é redundância:
  -- ler o preço atual do produto num relatório de seis meses atrás mostraria
  -- o faturamento de então com os preços de hoje.
  unit_price_cents bigint not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint erp_sale_items_quantity_positive check (quantity > 0),
  constraint erp_sale_items_price_not_negative check (unit_price_cents >= 0),
  constraint erp_sale_items_tenant_id_key unique (tenant_id, id),
  constraint erp_sale_items_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id)
    on delete cascade,
  constraint erp_sale_items_product_do_tenant
    foreign key (tenant_id, product_id) references public.erp_products (tenant_id, id)
    on delete restrict
);

comment on column public.erp_sale_items.unit_price_cents is
  'Preço no momento da venda. Ler o preço atual num relatório antigo mostraria o passado com os preços de hoje.';

create index erp_sale_items_sale_idx on public.erp_sale_items (tenant_id, sale_id);
create index erp_sale_items_product_idx on public.erp_sale_items (tenant_id, product_id);

create table public.erp_sale_payments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  sale_id           uuid not null,
  payment_method_id uuid not null,
  amount_cents      bigint not null,
  created_at        timestamptz not null default now(),

  constraint erp_sale_payments_amount_positive check (amount_cents > 0),
  constraint erp_sale_payments_tenant_id_key unique (tenant_id, id),
  constraint erp_sale_payments_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id)
    on delete cascade,
  constraint erp_sale_payments_method_do_tenant
    foreign key (tenant_id, payment_method_id)
    references public.erp_payment_methods (tenant_id, id)
    on delete restrict
);

comment on table public.erp_sale_payments is
  'Como a venda foi paga. REGISTRO — nada aqui cobra nem confirma pagamento de verdade.';

create index erp_sale_payments_sale_idx on public.erp_sale_payments (tenant_id, sale_id);

-- ─────────────────────────────────────────────────────────────────────────
-- O total é derivado
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.erp_recalc_sale_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo uuid := coalesce(new.sale_id, old.sale_id);
  soma bigint;
begin
  select coalesce(sum(round(i.quantity * i.unit_price_cents)), 0)::bigint into soma
  from public.erp_sale_items i
  where i.sale_id = alvo;

  update public.erp_sales s
  -- `greatest(..., 0)`: desconto maior que a soma dos itens não vira total
  -- negativo, que a constraint recusaria — e a recusa apareceria como erro
  -- de constraint ao editar um item, longe de onde o desconto foi digitado.
  set total_cents = greatest(soma - s.discount_cents, 0), updated_at = now()
  where s.id = alvo;

  return null;
end;
$$;

create trigger erp_sale_items_recalc
  after insert or update or delete on public.erp_sale_items
  for each row execute function public.erp_recalc_sale_total();

-- Mudar o desconto também recalcula. Sem isto, o total ficaria com o desconto
-- antigo até alguém mexer num item — e ninguém mexe depois de fechar.
create or replace function public.erp_recalc_sale_on_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  soma bigint;
begin
  select coalesce(sum(round(i.quantity * i.unit_price_cents)), 0)::bigint into soma
  from public.erp_sale_items i
  where i.sale_id = new.id;

  new.total_cents := greatest(soma - new.discount_cents, 0);
  return new;
end;
$$;

create trigger erp_sales_recalc_discount
  before update of discount_cents on public.erp_sales
  for each row execute function public.erp_recalc_sale_on_discount();

-- ─────────────────────────────────────────────────────────────────────────
-- Financeiro
-- ─────────────────────────────────────────────────────────────────────────
--
-- Um livro só para pagar e receber, separado por `kind`. Duas tabelas quase
-- iguais dobrariam toda consulta de fluxo de caixa e fariam a soma de saldo
-- precisar de `union` — e `union` esquecido de um lado é relatório errado que
-- parece certo.

create table public.finance_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  kind        public.finance_entry_kind not null,

  description text not null,
  amount_cents bigint not null,

  -- Dia, não instante: vencimento é uma data no calendário do cliente, e
  -- `timestamptz` faria "vence dia 10" mudar de dia conforme o fuso de quem
  -- olha. Ver `packages/core/src/tempo.ts`.
  due_date    date not null,
  paid_at     timestamptz,

  company_id  uuid,
  sale_id     uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint finance_entries_description_not_blank check (btrim(description) <> ''),
  constraint finance_entries_amount_positive check (amount_cents > 0),
  constraint finance_entries_tenant_id_key unique (tenant_id, id),
  constraint finance_entries_company_do_tenant
    foreign key (tenant_id, company_id) references public.crm_companies (tenant_id, id)
    on delete set null (company_id),
  constraint finance_entries_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id)
    on delete set null (sale_id)
);

comment on table public.finance_entries is
  'Contas a pagar e a receber. REGISTRO — não emite boleto, não cobra, não fala com banco.';
comment on column public.finance_entries.due_date is
  'Data no calendário do cliente. `date` e não `timestamptz`: "vence dia 10" não muda com o fuso.';

create index finance_entries_tenant_idx on public.finance_entries (tenant_id, due_date);
create index finance_entries_open_idx on public.finance_entries (tenant_id, kind, due_date)
  where paid_at is null;
create index finance_entries_sale_idx on public.finance_entries (tenant_id, sale_id)
  where sale_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- Confirmar a venda: a transação que faz tudo acontecer
-- ─────────────────────────────────────────────────────────────────────────
--
-- Quatro escritas que só fazem sentido juntas — número, estado, baixa de
-- estoque e recebimento. O cliente PostgREST não tem transação, então daqui
-- seriam quatro chamadas, com quatro pontos onde a rede pode cair. O pior
-- desfecho parcial não parece defeito: o estoque baixa e a venda continua
-- rascunho, ou o recebimento entra sem venda confirmada do outro lado.
--
-- `SECURITY INVOKER`: cada escrita passa pelo RLS como se tivesse partido da
-- aplicação. Isto **não** é atalho para escrever o que a pessoa não poderia.
--
-- As duas configurações que ela respeita já existiam no catálogo do Core e
-- **nada as consumia** — `inventory.deduct_on_sale` e
-- `erp.sales_requires_customer`. Configuração que ninguém lê é o defeito sem
-- sintoma que o próprio catálogo existe para evitar.

create or replace function public.erp_confirm_sale(p_sale_id uuid)
returns table (sale_id uuid, number integer, total_cents bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_status public.erp_sale_status;
  v_company uuid;
  v_contact uuid;
  v_total bigint;
  v_numero integer;
  v_config jsonb;
  v_baixa boolean;
  v_exige_cliente boolean;
  v_itens integer;
begin
  select s.tenant_id, s.status, s.company_id, s.contact_id, s.total_cents
    into v_tenant, v_status, v_company, v_contact, v_total
  from public.erp_sales s
  where s.id = p_sale_id;

  -- Nulo aqui significa "o RLS não devolveu" tanto quanto "não existe". A
  -- mesma mensagem para os dois: distinguir contaria a quem tentasse que
  -- aquela venda existe em algum tenant.
  if v_tenant is null then
    raise exception using errcode = 'P0002', message = 'Venda não encontrada.';
  end if;

  if v_status <> 'draft' then
    raise exception using
      errcode = '23514',
      message = 'Esta venda já saiu do rascunho.';
  end if;

  select count(*)::integer into v_itens
  from public.erp_sale_items i where i.sale_id = p_sale_id;

  if v_itens = 0 then
    raise exception using
      errcode = '23514',
      message = 'Uma venda sem itens não tem o que confirmar.';
  end if;

  select t.settings into v_config from public.tenants t where t.id = v_tenant;

  -- O padrão vale quando a chave não está gravada: `resolveSettings()` no Core
  -- só grava o que o nicho mudou, de propósito — assim um padrão novo alcança
  -- todo tenant que já existe, sem migração.
  v_baixa := coalesce((v_config ->> 'inventory.deduct_on_sale')::boolean, true);
  v_exige_cliente := coalesce((v_config ->> 'erp.sales_requires_customer')::boolean, true);

  if v_exige_cliente and v_company is null and v_contact is null then
    raise exception using
      errcode = '23514',
      message = 'Este cliente exige identificar quem comprou. Balcão costuma desligar em Configurações.';
  end if;

  -- O número sai agora, e não no rascunho: desistir de uma venda deixaria um
  -- buraco na sequência, e buraco em sequência de venda é a primeira coisa
  -- que um contador pergunta.
  select coalesce(max(s.number), 0) + 1 into v_numero
  from public.erp_sales s where s.tenant_id = v_tenant;

  update public.erp_sales s
  set status = 'confirmed', number = v_numero, sold_at = coalesce(s.sold_at, now()), updated_at = now()
  where s.id = p_sale_id;

  if v_baixa then
    -- Só o que controla estoque. Serviço não baixa nada, e sem o filtro
    -- "hora de consultoria" apareceria no inventário com saldo negativo
    -- eterno.
    insert into public.erp_stock_movements (tenant_id, product_id, kind, quantity, reason, sale_id, actor_id)
    select v_tenant, i.product_id, 'out', i.quantity, 'Venda', p_sale_id, (select auth.uid())
    from public.erp_sale_items i
    join public.erp_products p on p.id = i.product_id
    where i.sale_id = p_sale_id and p.track_stock;
  end if;

  -- O recebimento. Vence hoje por padrão: quem vende a prazo edita a data, e
  -- quem vende à vista já marca como pago na tela.
  if v_total > 0 then
    insert into public.finance_entries (tenant_id, kind, description, amount_cents, due_date, company_id, sale_id)
    values (
      v_tenant, 'receivable',
      format('Venda #%s', v_numero),
      v_total,
      current_date,
      v_company,
      p_sale_id
    );
  end if;

  return query select p_sale_id, v_numero, v_total;
end;
$$;

comment on function public.erp_confirm_sale(uuid) is
  'Confirma a venda: número, estado, baixa de estoque e recebimento, numa transação.';

revoke all on function public.erp_confirm_sale(uuid) from public;
grant execute on function public.erp_confirm_sale(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table public.erp_sales         enable row level security;
alter table public.erp_sale_items    enable row level security;
alter table public.erp_sale_payments enable row level security;
alter table public.finance_entries   enable row level security;

create policy erp_sales_read on public.erp_sales
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.read'));
create policy erp_sales_write on public.erp_sales
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));

create policy erp_sale_items_read on public.erp_sale_items
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.read'));
create policy erp_sale_items_write on public.erp_sale_items
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));

create policy erp_sale_payments_read on public.erp_sale_payments
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.read'));
create policy erp_sale_payments_write on public.erp_sale_payments
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'erp.sales.write'));

-- Pagar e receber são permissões diferentes, e a política separa por `kind`.
-- Quem cuida de contas a pagar não precisa ver o faturamento.
create policy finance_entries_read on public.finance_entries
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'finance.cashflow.read')
    or (kind = 'payable' and public.has_permission(tenant_id, 'finance.payables.read'))
    or (kind = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.read'))
  );
create policy finance_entries_write on public.finance_entries
  for all to authenticated
  using (
    public.is_super_admin()
    or (kind = 'payable' and public.has_permission(tenant_id, 'finance.payables.write'))
    or (kind = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.write'))
  )
  with check (
    public.is_super_admin()
    or (kind = 'payable' and public.has_permission(tenant_id, 'finance.payables.write'))
    or (kind = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.write'))
  );

revoke update (tenant_id) on public.erp_sales       from authenticated;
revoke update (tenant_id) on public.erp_sale_items  from authenticated;
revoke update (tenant_id) on public.finance_entries from authenticated;

select public.attach_updated_at('public.erp_sales');
select public.attach_updated_at('public.erp_sale_items');
select public.attach_updated_at('public.finance_entries');
