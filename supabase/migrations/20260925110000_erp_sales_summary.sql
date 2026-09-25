-- Tivexy ERP — o resumo das vendas de um período
--
-- "Hoje: 42 vendas, R$ 1.873,40" é a primeira linha da tela de vendas e o
-- primeiro número do painel. O PostgREST não soma — agregação vem desligada
-- no Supabase —, e somar na aplicação exigiria trazer todas as vendas do
-- período para contar. Uma função, então.
--
-- SECURITY INVOKER: a soma passa pelo RLS de `erp_sales`. Quem não vê venda
-- recebe zero, e o tenant alheio também — pedir o resumo de outra empresa não
-- é erro, é nada. O período é meio aberto, [de, até): o fim de um dia é o
-- começo do outro, e nenhuma venda conta duas vezes.

create or replace function public.erp_sales_summary(
  p_tenant_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns table (
  sales_count     bigint,
  total_cents     bigint,
  discount_cents  bigint,
  cancelled_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where s.status = 'completed'),
    coalesce(sum(s.total_cents) filter (where s.status = 'completed'), 0)::bigint,
    coalesce(sum(s.discount_cents) filter (where s.status = 'completed'), 0)::bigint,
    count(*) filter (where s.status = 'cancelled')
  from public.erp_sales s
  where s.tenant_id = p_tenant_id
    and s.sold_at >= p_from
    and s.sold_at < p_to;
$$;

comment on function public.erp_sales_summary(uuid, timestamptz, timestamptz) is
  'Vendas concluídas, total, desconto e canceladas no período [de, até). INVOKER: passa pelo RLS.';
