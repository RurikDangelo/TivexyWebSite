-- Tivexy Core — Row Level Security
--
-- O isolamento entre tenants é garantido AQUI, no banco. Não em filtro de
-- frontend, nem em `where tenant_id = ?` espalhado pelo código da aplicação.
-- Basta esquecer o filtro uma vez para vazar dado entre clientes.
--
-- Duas notas sobre as funções auxiliares abaixo:
--
--   SECURITY DEFINER é obrigatório. Uma política em `tenant_users` que
--   consultasse `tenant_users` sob RLS entraria em recursão infinita. A função
--   roda com os privilégios do dono e lê a tabela sem passar pela política.
--
--   `set search_path = ''` também é obrigatório. Sem isso, quem controlar o
--   search_path da sessão consegue apontar os nomes não qualificados para
--   tabelas próprias e escalar privilégio. Por isso todo nome aqui é completo.
--
-- `auth.uid()` é embutido no Supabase. Fora dele (os testes em PGlite), o
-- harness cria um equivalente antes de rodar as migrations.

-- ─────────────────────────────────────────────────────────────────────────
-- Funções auxiliares
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.is_super_admin from public.users u where u.id = (select auth.uid())),
    false
  );
$$;

comment on function public.is_super_admin() is
  'Equipe Tivexy: escopo de plataforma. SECURITY DEFINER para não recorrer no RLS de users.';

-- Os tenants em que a pessoa é membro ATIVO. Convite pendente não dá acesso
-- a dado: só depois do primeiro acesso o vínculo vira 'active'.
create or replace function public.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tu.tenant_id
  from public.tenant_users tu
  where tu.user_id = (select auth.uid())
    and tu.status = 'active';
$$;

comment on function public.user_tenant_ids() is
  'Tenants em que auth.uid() é membro ativo. Base de quase toda política.';

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.user_id = (select auth.uid())
      and tu.tenant_id = p_tenant_id
      and tu.status = 'active'
  );
$$;

-- RBAC de verdade, verificado no banco. A aplicação também checa, mas se ela
-- esquecer, o banco não deixa passar.
create or replace function public.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_users tu
    join public.role_permissions rp on rp.role_id = tu.role_id
    join public.permissions p on p.id = rp.permission_id
    where tu.user_id = (select auth.uid())
      and tu.tenant_id = p_tenant_id
      and tu.status = 'active'
      and p.code = p_permission
  );
$$;

comment on function public.has_permission(uuid, text) is
  'Permissão do usuário atual dentro de um tenant, no formato modulo.recurso.acao.';

-- ─────────────────────────────────────────────────────────────────────────
-- Habilitar RLS — em TODAS as tabelas
-- ─────────────────────────────────────────────────────────────────────────
-- Tabela sem RLS habilitado fica totalmente aberta. Não existe exceção aqui.

alter table public.plans              enable row level security;
alter table public.modules            enable row level security;
alter table public.plan_modules       enable row level security;
alter table public.tenants            enable row level security;
alter table public.tenant_modules     enable row level security;
alter table public.users              enable row level security;
alter table public.roles              enable row level security;
alter table public.permissions        enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.tenant_users       enable row level security;
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.provisioning_runs  enable row level security;
alter table public.provisioning_steps enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Catálogo global: leitura para quem está autenticado, escrita só Super Admin
-- ─────────────────────────────────────────────────────────────────────────

create policy plans_read on public.plans
  for select to authenticated using (true);
create policy plans_write on public.plans
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy modules_read on public.modules
  for select to authenticated using (true);
create policy modules_write on public.modules
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy plan_modules_read on public.plan_modules
  for select to authenticated using (true);
create policy plan_modules_write on public.plan_modules
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy permissions_read on public.permissions
  for select to authenticated using (true);
create policy permissions_write on public.permissions
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- Tenants
-- ─────────────────────────────────────────────────────────────────────────

create policy tenants_read on public.tenants
  for select to authenticated
  using (public.is_super_admin() or id in (select public.user_tenant_ids()));

-- Criar e apagar tenant é operação de plataforma.
create policy tenants_insert on public.tenants
  for insert to authenticated with check (public.is_super_admin());

create policy tenants_delete on public.tenants
  for delete to authenticated using (public.is_super_admin());

-- O administrador do tenant edita o próprio tenant (nome, configurações).
-- Plano e status continuam sendo decisão da plataforma — a aplicação não expõe
-- essas colunas ao tenant, e o Super Admin passa pelo mesmo caminho.
create policy tenants_update on public.tenants
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(id, 'core.tenant.write'))
  with check (public.is_super_admin() or public.has_permission(id, 'core.tenant.write'));

create policy tenant_modules_read on public.tenant_modules
  for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.user_tenant_ids()));

-- Habilitar módulo é decisão comercial, não do tenant.
create policy tenant_modules_write on public.tenant_modules
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- Usuários
-- ─────────────────────────────────────────────────────────────────────────

-- Cada pessoa vê a si mesma e a quem divide tenant com ela — necessário para
-- exibir responsável, equipe e histórico. Fora disso, ninguém.
create policy users_read on public.users
  for select to authenticated
  using (
    public.is_super_admin()
    or id = (select auth.uid())
    or exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = public.users.id
        and tu.tenant_id in (select public.user_tenant_ids())
    )
  );

-- Cada um edita o próprio perfil. `is_super_admin` não entra aqui: elevar
-- privilégio é operação de plataforma, feita pelo backend com service role.
create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy users_admin_write on public.users
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- Papéis e permissões
-- ─────────────────────────────────────────────────────────────────────────

-- Papéis de sistema são visíveis a todos; os próprios, só ao tenant dono.
create policy roles_read on public.roles
  for select to authenticated
  using (
    public.is_super_admin()
    or tenant_id is null
    or tenant_id in (select public.user_tenant_ids())
  );

create policy roles_write on public.roles
  for all to authenticated
  using (
    public.is_super_admin()
    or (tenant_id is not null and not is_system and public.has_permission(tenant_id, 'core.roles.write'))
  )
  with check (
    public.is_super_admin()
    or (tenant_id is not null and not is_system and public.has_permission(tenant_id, 'core.roles.write'))
  );

create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.roles r
      where r.id = role_id
        and (r.tenant_id is null or r.tenant_id in (select public.user_tenant_ids()))
    )
  );

-- Mexer nas permissões de um papel de sistema mudaria o comportamento de todos
-- os tenants de uma vez. Só plataforma.
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.tenant_id is not null
        and not r.is_system
        and public.has_permission(r.tenant_id, 'core.roles.write')
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.tenant_id is not null
        and not r.is_system
        and public.has_permission(r.tenant_id, 'core.roles.write')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Vínculos e equipes
-- ─────────────────────────────────────────────────────────────────────────

create policy tenant_users_read on public.tenant_users
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = (select auth.uid())
    or tenant_id in (select public.user_tenant_ids())
  );

create policy tenant_users_write on public.tenant_users
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'core.users.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'core.users.write'));

create policy teams_read on public.teams
  for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.user_tenant_ids()));

create policy teams_write on public.teams
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'core.teams.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'core.teams.write'));

create policy team_members_read on public.team_members
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.teams t
      where t.id = team_id and t.tenant_id in (select public.user_tenant_ids())
    )
  );

create policy team_members_write on public.team_members
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.teams t
      where t.id = team_id and public.has_permission(t.tenant_id, 'core.teams.write')
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.teams t
      where t.id = team_id and public.has_permission(t.tenant_id, 'core.teams.write')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Auditoria — append-only
-- ─────────────────────────────────────────────────────────────────────────

create policy audit_logs_read on public.audit_logs
  for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id is not null and public.has_permission(tenant_id, 'core.audit.read'))
  );

-- Membro do tenant registra a própria ação. Não pode forjar autor nem escrever
-- no log de outro tenant.
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      tenant_id in (select public.user_tenant_ids())
      and (actor_user_id is null or actor_user_id = (select auth.uid()))
    )
  );

-- Sem política de UPDATE e de DELETE: com RLS habilitado, ausência de política
-- é negação. Log de auditoria que pode ser editado não é auditoria.

-- ─────────────────────────────────────────────────────────────────────────
-- Provisionamento — operação de plataforma
-- ─────────────────────────────────────────────────────────────────────────

-- O tenant enxerga o próprio estado de provisionamento (o painel mostra),
-- mas quem escreve é sempre a plataforma.
create policy provisioning_runs_read on public.provisioning_runs
  for select to authenticated
  using (public.is_super_admin() or tenant_id in (select public.user_tenant_ids()));

create policy provisioning_runs_write on public.provisioning_runs
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy provisioning_steps_read on public.provisioning_steps
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.provisioning_runs r
      where r.id = run_id and r.tenant_id in (select public.user_tenant_ids())
    )
  );

create policy provisioning_steps_write on public.provisioning_steps
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
