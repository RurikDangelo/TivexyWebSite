-- Tivexy Core — contexto do usuário da requisição
--
-- Monta, numa consulta só, tudo que a aplicação precisa para decidir acesso:
-- quem é, em que tenant está, com que vínculo, que permissões tem e que módulos
-- estão habilitados.
--
-- O formato do retorno é exatamente o `Viewer` de `@tivexy/core`, e a função
-- `decideAccess()` consome isso. Um teste compara os dois lados.
--
-- Por que uma função e não cinco consultas: a decisão de acesso acontece em
-- toda requisição. Cinco idas ao banco por página, mais a latência de cada uma,
-- é o tipo de custo que ninguém nota até estar em produção.
--
-- SECURITY DEFINER com search_path fixo, pelos mesmos motivos das outras
-- funções auxiliares. A segurança aqui não vem do RLS e sim do filtro: **tudo**
-- é filtrado por `auth.uid()`, e nada é devolvido sobre um tenant de que a
-- pessoa não participa. Há teste para isso.

create or replace function public.current_viewer(p_tenant_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select u.id, u.is_super_admin
    from public.users u
    where u.id = (select auth.uid())
  ),
  vinculo as (
    select tu.status, tu.role_id
    from public.tenant_users tu
    cross join eu
    where tu.user_id = eu.id
      and tu.tenant_id = p_tenant_id
  ),
  -- O tenant só aparece para quem tem algum vínculo com ele — inclusive
  -- convite pendente, porque a tela de convite precisa nomear a empresa.
  -- Para um estranho, devolve nulo: nem confirma que o tenant existe.
  empresa as (
    select t.id, t.status
    from public.tenants t
    cross join eu
    where t.id = p_tenant_id
      and (eu.is_super_admin or exists (select 1 from vinculo))
  ),
  -- Permissões só valem com vínculo ATIVO. É o mesmo corte de
  -- `user_tenant_ids()`: convite pendente não carrega permissão nenhuma.
  permissoes as (
    select coalesce(jsonb_agg(distinct p.code), '[]'::jsonb) as codes
    from vinculo v
    join public.role_permissions rp on rp.role_id = v.role_id
    join public.permissions p on p.id = rp.permission_id
    where v.status = 'active'
  ),
  -- Módulos habilitados, também só para membro ativo. Sem esse corte, qualquer
  -- pessoa autenticada descobriria o que outra empresa contratou.
  modulos as (
    select coalesce(jsonb_agg(distinct m.code), '[]'::jsonb) as codes
    from public.tenant_modules tm
    join public.modules m on m.id = tm.module_id
    where tm.tenant_id = p_tenant_id
      and tm.is_enabled
      and exists (select 1 from vinculo v where v.status = 'active')
  )
  -- Subconsulta escalar sobre zero linhas devolve NULL, que é exatamente o
  -- que `tenant: null` e `membershipStatus: null` significam no Viewer.
  select jsonb_build_object(
    'userId',           eu.id,
    'isSuperAdmin',     eu.is_super_admin,
    'tenant',           (select jsonb_build_object('id', e.id, 'status', e.status::text)
                         from empresa e),
    'membershipStatus', (select v.status::text from vinculo v),
    'permissions',      (select codes from permissoes),
    'enabledModules',   (select codes from modulos)
  )
  from eu;
$$;

comment on function public.current_viewer(uuid) is
  'Contexto de acesso do usuário da requisição, no formato Viewer de @tivexy/core. Devolve NULL quando não há sessão.';

-- A aplicação chama isto a cada requisição: precisa ser barato.
grant execute on function public.current_viewer(uuid) to authenticated;

-- Os tenants em que a pessoa pode entrar, para a tela de escolha de empresa.
-- Inclui convites pendentes: é ali que a pessoa aceita.
create or replace function public.my_tenants()
returns table (id uuid, slug text, name text, status public.tenant_status, membership public.membership_status)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name, t.status, tu.status
  from public.tenant_users tu
  join public.tenants t on t.id = tu.tenant_id
  where tu.user_id = (select auth.uid())
  order by t.name;
$$;

comment on function public.my_tenants() is
  'Tenants a que o usuário pertence, incluindo convites pendentes.';

grant execute on function public.my_tenants() to authenticated;
