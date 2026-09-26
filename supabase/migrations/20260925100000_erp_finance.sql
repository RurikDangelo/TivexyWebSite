-- Tivexy Financeiro — contas a receber, contas a pagar
--
-- ─────────────────────────────────────────────────────────────────────────
-- Regime de caixa, e o lançamento não guarda situação
-- ─────────────────────────────────────────────────────────────────────────
--
-- Um lançamento é uma promessa de dinheiro: entra (`receivable`) ou sai
-- (`payable`), tem valor e vencimento. Quando o dinheiro de fato se move,
-- ganha `paid_on` — o dia, no calendário do tenant. O fluxo de caixa
-- *realizado* soma `paid_on`; o *previsto* soma o vencimento do que está em
-- aberto. É o que um dono de loja pergunta: quanto entrou, quanto vai entrar.
--
-- "Vencido" não é coluna: é `due_date < hoje` num lançamento em aberto, lido
-- na hora — ver `financeStatus()` no Core. Coluna de situação precisaria de
-- alguém atualizando à meia-noite, e no dia em que o processo falhasse a tela
-- mostraria em dia o que venceu.
--
-- **Nada aqui cobra, paga, emite boleto ou fala com banco.** É o registro do
-- que a empresa tem a receber e a pagar, e de quando o dinheiro se moveu.
-- Conciliação bancária e boleto dependem de banco (🔒 externo) e não existem.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A venda vira dinheiro sozinha
-- ─────────────────────────────────────────────────────────────────────────
--
-- Cada pagamento de venda vira um lançamento a receber, pelo gatilho — quem
-- vende não precisa, nem pode, escrever no financeiro. O prazo da forma de
-- pagamento decide: zero dia (dinheiro, Pix) já nasce recebido no dia da
-- venda; trinta dias (crédito) nasce em aberto, vencendo em trinta dias.
--
-- O lançamento que nasceu da venda **segue a venda**: valor, vencimento e
-- descrição não se editam, e ele não se cancela sozinho — cancela-se a venda.
-- O que se faz nele é registrar que o dinheiro chegou.

create type public.finance_direction as enum ('receivable', 'payable');

create table public.finance_entries (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  direction         public.finance_direction not null,
  description       text not null,
  -- De quem se recebe ou a quem se paga, quando não é cliente cadastrado.
  -- Fornecedor ainda não tem cadastro — `erp.suppliers` é permissão, não
  -- tabela —, e texto livre é o honesto até lá.
  counterparty      text,
  customer_id       uuid,
  category          text,
  amount_cents      bigint not null,
  due_date          date not null,
  paid_on           date,
  cancelled_at      timestamptz,
  cancel_reason     text,
  sale_id           uuid,
  sale_payment_id   uuid,
  payment_method_id uuid,
  notes             text,
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint finance_entries_description_not_blank check (btrim(description) <> ''),
  constraint finance_entries_amount_positive check (amount_cents > 0),
  -- Pago e cancelado ao mesmo tempo seria dinheiro que se moveu e não conta.
  constraint finance_entries_paid_or_cancelled check (paid_on is null or cancelled_at is null),
  constraint finance_entries_cancel_reason check (
    cancelled_at is null or nullif(btrim(cancel_reason), '') is not null
  ),
  constraint finance_entries_sale_link check (sale_payment_id is null or sale_id is not null),
  constraint finance_entries_tenant_id_key unique (tenant_id, id),
  constraint finance_entries_customer_do_tenant
    foreign key (tenant_id, customer_id) references public.erp_customers (tenant_id, id)
    on delete set null (customer_id),
  constraint finance_entries_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id),
  constraint finance_entries_sale_payment_do_tenant
    foreign key (tenant_id, sale_payment_id) references public.erp_sale_payments (tenant_id, id),
  constraint finance_entries_method_do_tenant
    foreign key (tenant_id, payment_method_id) references public.erp_payment_methods (tenant_id, id)
    on delete set null (payment_method_id)
);

comment on table public.finance_entries is
  'Conta a receber ou a pagar. Situação vem das datas; nunca se apaga — cancela-se, com motivo.';

create index finance_entries_open_idx
  on public.finance_entries (tenant_id, direction, due_date)
  where paid_on is null and cancelled_at is null;
create index finance_entries_paid_idx
  on public.finance_entries (tenant_id, paid_on)
  where paid_on is not null;
create index finance_entries_sale_idx on public.finance_entries (tenant_id, sale_id);

-- Um lançamento por pagamento de venda, e uma devolução por venda.
create unique index finance_entries_one_per_sale_payment
  on public.finance_entries (tenant_id, sale_payment_id)
  where sale_payment_id is not null;
create unique index finance_entries_one_refund_per_sale
  on public.finance_entries (tenant_id, sale_id)
  where sale_id is not null and sale_payment_id is null;

-- ─────────────────────────────────────────────────────────────────────────
-- O que o banco confere
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.finance_entries_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.description := btrim(new.description);
  new.counterparty := nullif(btrim(coalesce(new.counterparty, '')), '');
  new.category := nullif(btrim(coalesce(new.category, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  if new.cancelled_at is not null then
    raise exception using
      errcode = '23514',
      message = 'lançamento nasce em aberto ou pago, nunca cancelado';
  end if;

  if new.paid_on is not null and new.paid_on > public.tenant_date(new.tenant_id) then
    raise exception using
      errcode = '23514',
      message = 'a data do pagamento não pode estar no futuro';
  end if;

  return new;
end;
$$;

create trigger finance_entries_before_insert
  before insert on public.finance_entries
  for each row execute function public.finance_entries_before_insert();

create or replace function public.finance_entries_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero bigint;
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if old.cancelled_at is not null then
    raise exception using errcode = '55000', message = 'lançamento cancelado não muda';
  end if;

  /*
   * O lançamento da venda, mexido direto por alguém.
   *
   * `pg_trigger_depth() = 1` é "esta atualização veio de um comando, não de
   * outro gatilho". O cancelamento da venda chega aqui com profundidade 2 —
   * é o gatilho do financeiro reagindo à venda — e passa. Quem atualiza pelo
   * PostgREST chega com 1, e só registra a baixa.
   */
  if old.sale_id is not null and pg_trigger_depth() = 1 then
    select s.number into v_numero from public.erp_sales s where s.id = old.sale_id;

    if new.amount_cents <> old.amount_cents
       or new.due_date <> old.due_date
       or new.description <> old.description
       or new.customer_id is distinct from old.customer_id
       or new.counterparty is distinct from old.counterparty
       or new.payment_method_id is distinct from old.payment_method_id then
      raise exception using
        errcode = '55000',
        message = format(
          'este lançamento veio da venda nº %s: valor, vencimento e descrição seguem a venda',
          v_numero
        );
    end if;

    if new.cancelled_at is not null then
      raise exception using
        errcode = '55000',
        message = format('este lançamento veio da venda nº %s; para cancelar, cancele a venda', v_numero);
    end if;
  end if;

  if new.cancelled_at is not null then
    if old.paid_on is not null or new.paid_on is not null then
      raise exception using
        errcode = '55000',
        message = 'lançamento pago não se cancela; desfaça a baixa antes';
    end if;
    if nullif(btrim(coalesce(new.cancel_reason, '')), '') is null then
      raise exception using errcode = '23514', message = 'diga o motivo do cancelamento';
    end if;
    new.cancel_reason := btrim(new.cancel_reason);
    new.cancelled_at := now();
  end if;

  if new.paid_on is not null
     and new.paid_on is distinct from old.paid_on
     and new.paid_on > public.tenant_date(new.tenant_id) then
    raise exception using
      errcode = '23514',
      message = 'a data do pagamento não pode estar no futuro';
  end if;

  return new;
end;
$$;

create trigger finance_entries_before_update
  before update on public.finance_entries
  for each row execute function public.finance_entries_before_update();

select public.attach_updated_at('public.finance_entries');

-- ─────────────────────────────────────────────────────────────────────────
-- A venda, vista pelo financeiro
-- ─────────────────────────────────────────────────────────────────────────

-- O rótulo da venda no vocabulário do tenant: "Venda nº 12", ou o que o nicho
-- chama de venda.
create or replace function public.erp_sale_label(p_tenant_id uuid, p_number bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select format(
    '%s nº %s',
    upper(left(t.rotulo, 1)) || substr(t.rotulo, 2),
    p_number
  )
  from (
    select coalesce(
      nullif(btrim((select te.terms -> 'erp.sales' ->> 'singular'
                    from public.tenants te where te.id = p_tenant_id)), ''),
      'venda'
    ) as rotulo
  ) t;
$$;

revoke execute on function public.erp_sale_label(uuid, bigint) from public, anon, authenticated;

create or replace function public.finance_on_sale_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.erp_sales;
  v_dia   date;
begin
  if not public.tenant_module_enabled(new.tenant_id, 'finance') then
    return null;
  end if;

  select * into v_venda
  from public.erp_sales s
  where s.id = new.sale_id and s.tenant_id = new.tenant_id;

  v_dia := public.tenant_date(new.tenant_id, v_venda.sold_at);

  insert into public.finance_entries (
    tenant_id, direction, description, customer_id, amount_cents, due_date, paid_on,
    sale_id, sale_payment_id, payment_method_id
  )
  values (
    new.tenant_id,
    'receivable',
    format('%s — %s', public.erp_sale_label(new.tenant_id, v_venda.number), new.method_name),
    v_venda.customer_id,
    new.amount_cents,
    v_dia + new.settlement_days,
    case when new.settlement_days = 0 then v_dia end,
    new.sale_id,
    new.id,
    new.payment_method_id
  );
  return null;
end;
$$;

create trigger finance_on_sale_payment
  after insert on public.erp_sale_payments
  for each row execute function public.finance_on_sale_payment();

/*
 * Venda cancelada, vista pelo financeiro.
 *
 * O que ainda não entrou deixa de ser esperado: o lançamento em aberto é
 * cancelado. O que **já entrou** não some — o dinheiro se moveu, e apagar
 * isso reescreveria o caixa de um dia já fechado. Nasce, no lugar, uma conta
 * a pagar: a devolução ao cliente, em aberto, vencendo hoje. Quem devolver o
 * dinheiro registra a baixa dela; se foi trocado por outro produto, cancela
 * com esse motivo. Os dois lados ficam visíveis, que é o que um contador
 * pediria.
 */
create or replace function public.finance_on_sale_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recebido bigint;
  v_rotulo   text := public.erp_sale_label(new.tenant_id, new.number);
begin
  update public.finance_entries e
  set cancelled_at = now(), cancel_reason = format('%s cancelada', v_rotulo)
  where e.tenant_id = new.tenant_id
    and e.sale_id = new.id
    and e.direction = 'receivable'
    and e.paid_on is null
    and e.cancelled_at is null;

  select coalesce(sum(e.amount_cents), 0) into v_recebido
  from public.finance_entries e
  where e.tenant_id = new.tenant_id
    and e.sale_id = new.id
    and e.direction = 'receivable'
    and e.paid_on is not null;

  if v_recebido > 0 then
    insert into public.finance_entries (
      tenant_id, direction, description, customer_id, amount_cents, due_date, sale_id, notes
    )
    values (
      new.tenant_id,
      'payable',
      format('Devolução — %s', v_rotulo),
      new.customer_id,
      v_recebido,
      public.tenant_date(new.tenant_id),
      new.id,
      'Cancelada depois de recebida. Registre a baixa quando o dinheiro for devolvido.'
    )
    on conflict do nothing;
  end if;

  return null;
end;
$$;

create trigger finance_on_sale_cancelled
  after update of status on public.erp_sales
  for each row
  when (old.status = 'completed' and new.status = 'cancelled')
  execute function public.finance_on_sale_cancelled();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS e privilégios
-- ─────────────────────────────────────────────────────────────────────────
--
-- A receber e a pagar têm permissões separadas — o encarregado do mercado vê
-- o que a loja deve, e não o que ela tem a receber. Quem vê o fluxo de caixa
-- vê os dois: o fluxo é a soma deles.

alter table public.finance_entries enable row level security;

create policy finance_entries_read on public.finance_entries
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'finance.cashflow.read')
    or (direction = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.read'))
    or (direction = 'payable' and public.has_permission(tenant_id, 'finance.payables.read'))
  );

-- À mão, só lançamento avulso. O da venda nasce da venda.
create policy finance_entries_insert on public.finance_entries
  for insert to authenticated
  with check (
    sale_id is null
    and sale_payment_id is null
    and (
      public.is_super_admin()
      or (direction = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.write'))
      or (direction = 'payable' and public.has_permission(tenant_id, 'finance.payables.write'))
    )
  );

create policy finance_entries_update on public.finance_entries
  for update to authenticated
  using (
    public.is_super_admin()
    or (direction = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.write'))
    or (direction = 'payable' and public.has_permission(tenant_id, 'finance.payables.write'))
  )
  with check (
    public.is_super_admin()
    or (direction = 'receivable' and public.has_permission(tenant_id, 'finance.receivables.write'))
    or (direction = 'payable' and public.has_permission(tenant_id, 'finance.payables.write'))
  );

-- Sem `delete`: lançamento errado se cancela, com motivo. A origem e o tipo
-- não se editam.
select public.lock_tenant_id('public.finance_entries');
revoke update (direction, sale_id, sale_payment_id, created_by, created_at)
  on public.finance_entries from authenticated;
revoke delete on public.finance_entries from anon, authenticated;
