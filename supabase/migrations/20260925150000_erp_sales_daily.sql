-- Tivexy ERP — vendas por dia, no dia da empresa
--
-- O painel mostra as vendas dos últimos quatorze dias, uma barra por dia. Um
-- dia sem venda é uma barra zerada — dado, não buraco: `generate_series`
-- devolve todo dia do período, com ou sem venda.
--
-- "Dia" é o do fuso da empresa. Uma venda às 23h30 de São Paulo é do dia em
-- que aconteceu, embora já seja o dia seguinte em UTC. O fuso vem como
-- parâmetro, e não de `tenant_setting()`, porque aquela função é interna —
-- revogada de `authenticated` — e esta é `SECURITY INVOKER`: a soma passa
-- pelo RLS de `erp_sales`, como `erp_sales_summary`. Quem não vê venda recebe
-- zeros; a empresa alheia também.

create or replace function public.erp_sales_daily(
  p_tenant_id uuid,
  p_from      date,
  p_to        date,
  p_time_zone text
)
returns table (
  day         date,
  sales_count bigint,
  total_cents bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_to < p_from or p_to - p_from > 92 then
    raise exception using
      errcode = '22023',
      message = 'o período de vendas por dia vai de um dia a três meses';
  end if;

  return query
  with dias as (
    select generate_series(p_from, p_to, interval '1 day')::date as dia
  )
  select
    d.dia,
    count(s.id),
    coalesce(sum(s.total_cents), 0)::bigint
  from dias d
  left join public.erp_sales s
    on s.tenant_id = p_tenant_id
   and s.status = 'completed'
   and s.sold_at >= (d.dia::timestamp at time zone p_time_zone)
   and s.sold_at < ((d.dia + 1)::timestamp at time zone p_time_zone)
  group by d.dia
  order by d.dia;
end;
$$;

comment on function public.erp_sales_daily(uuid, date, date, text) is
  'Vendas concluídas por dia do fuso informado, com os dias sem venda. INVOKER: passa pelo RLS.';
