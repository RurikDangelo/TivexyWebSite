-- Tivexy Financeiro — o resumo e o fluxo de caixa
--
-- As duas perguntas do dono: "quanto tenho a receber e a pagar, e quanto
-- disso venceu?", e "como o dinheiro entrou e vai entrar, dia a dia?". O
-- PostgREST não soma; as duas somas são funções.
--
-- SECURITY INVOKER nas duas: a soma passa pelo RLS de `finance_entries`. Quem
-- vê só o que se paga soma só o que se paga — o que faz sentido para a tela
-- que ele consegue abrir —, e o tenant alheio soma zero.
--
-- "Hoje" chega como parâmetro, e não de `now()`: é o dia do **tenant**, e a
-- aplicação já sabe o fuso (`todayIn`). Assim a função não depende do fuso
-- do servidor, e o teste escolhe o dia.

create or replace function public.finance_summary(
  p_tenant_id   uuid,
  p_today       date,
  p_month_start date
)
returns table (
  receivable_open_cents    bigint,
  receivable_overdue_cents bigint,
  receivable_open_count    bigint,
  payable_open_cents       bigint,
  payable_overdue_cents    bigint,
  payable_open_count       bigint,
  received_month_cents     bigint,
  paid_month_cents         bigint,
  receivable_next30_cents  bigint,
  payable_next30_cents     bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with abertos as (
    select * from public.finance_entries e
    where e.tenant_id = p_tenant_id and e.paid_on is null and e.cancelled_at is null
  ), pagos as (
    select * from public.finance_entries e
    where e.tenant_id = p_tenant_id and e.paid_on between p_month_start and p_today
  )
  select
    (select coalesce(sum(amount_cents), 0) from abertos where direction = 'receivable')::bigint,
    (select coalesce(sum(amount_cents), 0) from abertos where direction = 'receivable' and due_date < p_today)::bigint,
    (select count(*) from abertos where direction = 'receivable'),
    (select coalesce(sum(amount_cents), 0) from abertos where direction = 'payable')::bigint,
    (select coalesce(sum(amount_cents), 0) from abertos where direction = 'payable' and due_date < p_today)::bigint,
    (select count(*) from abertos where direction = 'payable'),
    (select coalesce(sum(amount_cents), 0) from pagos where direction = 'receivable')::bigint,
    (select coalesce(sum(amount_cents), 0) from pagos where direction = 'payable')::bigint,
    (select coalesce(sum(amount_cents), 0) from abertos
      where direction = 'receivable' and due_date between p_today and p_today + 30)::bigint,
    (select coalesce(sum(amount_cents), 0) from abertos
      where direction = 'payable' and due_date between p_today and p_today + 30)::bigint;
$$;

comment on function public.finance_summary(uuid, date, date) is
  'Em aberto, vencido, realizado no mês e previsto em 30 dias, por direção. INVOKER: passa pelo RLS.';

-- O fluxo de caixa, um dia por linha, de `p_from` a `p_to` inclusive.
--
-- Realizado é o que se moveu naquele dia (`paid_on`); previsto é o que está
-- em aberto e vence naquele dia. O atrasado — em aberto, vencido antes de
-- `p_from` — não entra em dia nenhum: não se sabe quando vai entrar, e pôr no
-- dia do vencimento seria prever o passado. O resumo o mostra à parte.
create or replace function public.finance_cashflow(
  p_tenant_id uuid,
  p_from      date,
  p_to        date
)
returns table (
  day              date,
  received_cents   bigint,
  paid_cents       bigint,
  to_receive_cents bigint,
  to_pay_cents     bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception using
      errcode = '22023',
      message = 'o período do fluxo de caixa vai de um dia a pouco mais de um ano';
  end if;

  return query
  with dias as (
    select generate_series(p_from, p_to, interval '1 day')::date as dia
  )
  select
    d.dia,
    coalesce(sum(e.amount_cents) filter (where e.direction = 'receivable' and e.paid_on = d.dia), 0)::bigint,
    coalesce(sum(e.amount_cents) filter (where e.direction = 'payable' and e.paid_on = d.dia), 0)::bigint,
    coalesce(sum(e.amount_cents) filter (
      where e.direction = 'receivable' and e.paid_on is null and e.cancelled_at is null and e.due_date = d.dia
    ), 0)::bigint,
    coalesce(sum(e.amount_cents) filter (
      where e.direction = 'payable' and e.paid_on is null and e.cancelled_at is null and e.due_date = d.dia
    ), 0)::bigint
  from dias d
  left join public.finance_entries e
    on e.tenant_id = p_tenant_id
   and (e.paid_on = d.dia or (e.paid_on is null and e.cancelled_at is null and e.due_date = d.dia))
  group by d.dia
  order by d.dia;
end;
$$;

comment on function public.finance_cashflow(uuid, date, date) is
  'Realizado (paid_on) e previsto (vencimento em aberto) por dia. INVOKER: passa pelo RLS.';
