-- Tivexy Core — `tenant_id` deixa de ser editável de verdade
--
-- ─────────────────────────────────────────────────────────────────────────
-- O que estava errado
-- ─────────────────────────────────────────────────────────────────────────
--
-- A migration do CRM terminava com
--
--   revoke update (tenant_id) on public.crm_leads from authenticated;
--
-- e isso **não fazia nada**. O Supabase concede `update` na tabela inteira, e
-- no Postgres o privilégio de tabela cobre todas as colunas: revogar uma
-- coluna não subtrai dele. A documentação avisa ("the table-level grant is
-- unaffected by a column-level operation"). Em 25/09/2026:
--
--   has_column_privilege('authenticated', 'public.crm_leads', 'tenant_id', 'UPDATE')
--   → true
--
-- O teste que dizia cobrar isso aceitava `/permission denied|row-level security/`
-- — e o RLS recusava pelo `with check`. Passava com o privilégio aberto: era
-- exatamente o encadeamento de que o comentário da migration dizia não querer
-- depender.
--
-- Nas tabelas do Core ninguém tinha nem tentado: `tenant_users`, `roles`,
-- `teams`, `tenant_modules` — todas com `tenant_id` editável.
--
-- ─────────────────────────────────────────────────────────────────────────
-- O jeito que funciona
-- ─────────────────────────────────────────────────────────────────────────
--
-- O mesmo de `tenants` e `users` desde 19/09: revogar o `update` da tabela e
-- conceder coluna por coluna. `lock_tenant_id()` faz isso lendo o catálogo, e
-- concede todas as colunas menos `id` e `tenant_id`.
--
-- > **Coluna nova precisa de `grant update`.** Depois disto, uma coluna
-- > adicionada por `alter table ... add column` nasce **sem** privilégio de
-- > edição para `authenticated`. É o lado seguro do erro — a tela recusa em vez
-- > de abrir —, e o teste `tenant_id não se edita em tabela nenhuma` não pega;
-- > quem pega é o teste da tela. Chame `lock_tenant_id()` de novo depois do
-- > `add column`: ela é idempotente.

create or replace function public.lock_tenant_id(target regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_colunas text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
  into v_colunas
  from pg_catalog.pg_attribute a
  where a.attrelid = target
    and a.attnum > 0
    and not a.attisdropped
    and a.attgenerated = ''
    and a.attname not in ('id', 'tenant_id');

  execute format('revoke update on %s from anon, authenticated', target);
  if v_colunas is not null then
    execute format('grant update (%s) on %s to authenticated', v_colunas, target);
  end if;
end;
$$;

comment on function public.lock_tenant_id(regclass) is
  'Revoga o update da tabela e concede coluna por coluna, menos id e tenant_id. Idempotente.';

revoke execute on function public.lock_tenant_id(regclass) from public, anon, authenticated;

select public.lock_tenant_id('public.crm_companies');
select public.lock_tenant_id('public.crm_contacts');
select public.lock_tenant_id('public.crm_pipelines');
select public.lock_tenant_id('public.crm_pipeline_stages');
select public.lock_tenant_id('public.crm_deals');
select public.lock_tenant_id('public.crm_leads');
select public.lock_tenant_id('public.crm_activity_types');
select public.lock_tenant_id('public.crm_activities');

select public.lock_tenant_id('public.tenant_modules');
select public.lock_tenant_id('public.tenant_users');
select public.lock_tenant_id('public.roles');
select public.lock_tenant_id('public.teams');
select public.lock_tenant_id('public.provisioning_runs');

-- Auditoria não se edita, nem coluna nenhuma. Já não havia política de
-- `update` nem de `delete` — ausência de política é negação —, e agora também
-- não há privilégio: são duas regras independentes para a mesma garantia.
revoke update, delete on public.audit_logs from anon, authenticated;
