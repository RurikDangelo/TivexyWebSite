-- Tivexy Core — identidade e RBAC
--
-- Perfis: SUPER ADMIN (Tivexy) · TENANT ADMIN · GESTOR · COLABORADOR.
--
-- Decisão: Super Admin **não é um papel dentro de um tenant**. É um sinalizador
-- de plataforma em `users`. Um papel de tenant que conseguisse "ver tudo" seria
-- uma escalada de privilégio esperando acontecer — bastaria alguém atribuí-lo.
--
-- Permissão é dado, não código: `permissions` é catálogo e `role_permissions`
-- é a ligação. Assim um tenant pode ter papel próprio sem deploy.

-- ─────────────────────────────────────────────────────────────────────────
-- Usuários
-- ─────────────────────────────────────────────────────────────────────────

-- Espelha auth.users, que é gerenciada pelo Supabase e não deve receber
-- colunas nossas. `id` é a mesma chave dos dois lados.
create table public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  -- Equipe Tivexy. Não pertence a tenant nenhum e enxerga a plataforma toda.
  is_super_admin  boolean not null default false,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.users is
  'Perfil da pessoa. Espelha auth.users; o vínculo com tenant vive em tenant_users.';
comment on column public.users.is_super_admin is
  'Equipe Tivexy. Concede escopo de plataforma — conceder é operação auditada.';

create unique index users_email_lower_idx on public.users (lower(email));
create index users_super_admin_idx on public.users (id) where is_super_admin;

-- ─────────────────────────────────────────────────────────────────────────
-- Papéis e permissões
-- ─────────────────────────────────────────────────────────────────────────

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  -- NULL = papel de sistema, disponível para todo tenant.
  -- Preenchido = papel criado por um tenant específico.
  tenant_id   uuid references public.tenants (id) on delete cascade,
  code        text not null,
  name        text not null,
  description text,
  -- Papel de sistema não pode ser apagado nem ter o código alterado.
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint roles_code_format check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint roles_system_has_no_tenant check (not is_system or tenant_id is null)
);

comment on table public.roles is
  'Papéis de sistema (tenant_id nulo) e papéis próprios de cada tenant.';

-- NULL não colide com NULL em UNIQUE, então a unicidade precisa de dois
-- índices parciais em vez de uma constraint só.
create unique index roles_system_code_idx on public.roles (code) where tenant_id is null;
create unique index roles_tenant_code_idx on public.roles (tenant_id, code) where tenant_id is not null;

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  module_id   uuid references public.modules (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  -- Formato `modulo.recurso.acao`, ex.: crm.leads.write
  constraint permissions_code_format check (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$')
);

comment on table public.permissions is
  'Catálogo global de permissões, no formato modulo.recurso.acao.';

create index permissions_module_id_idx on public.permissions (module_id);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Vínculo pessoa ↔ tenant
-- ─────────────────────────────────────────────────────────────────────────

create table public.tenant_users (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  role_id      uuid not null references public.roles (id) on delete restrict,
  status       public.membership_status not null default 'invited',
  invited_by   uuid references public.users (id) on delete set null,
  invited_at   timestamptz not null default now(),
  joined_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Uma pessoa entra uma vez em cada tenant. Trocar de papel é UPDATE.
  constraint tenant_users_unique unique (tenant_id, user_id),
  -- Quem entrou tem data de entrada; quem só foi convidado, não.
  constraint tenant_users_joined_consistency
    check ((status = 'invited') = (joined_at is null))
);

comment on table public.tenant_users is
  'Pertencimento a um tenant, com papel. É esta tabela que o RLS consulta.';

create index tenant_users_user_id_idx on public.tenant_users (user_id);
create index tenant_users_tenant_id_idx on public.tenant_users (tenant_id);
create index tenant_users_role_id_idx on public.tenant_users (role_id);
create index tenant_users_active_idx on public.tenant_users (user_id, tenant_id)
  where status = 'active';

-- ─────────────────────────────────────────────────────────────────────────
-- Equipes
-- ─────────────────────────────────────────────────────────────────────────

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint teams_name_unique unique (tenant_id, name)
);

create index teams_tenant_id_idx on public.teams (tenant_id);

create table public.team_members (
  team_id         uuid not null references public.teams (id) on delete cascade,
  -- Aponta para o vínculo, não para o usuário: sair do tenant tira das equipes
  -- automaticamente, sem membro órfão de outro tenant.
  tenant_user_id  uuid not null references public.tenant_users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (team_id, tenant_user_id)
);

comment on column public.team_members.tenant_user_id is
  'Referencia o vínculo, não o usuário: impede membro de equipe de outro tenant.';

create index team_members_tenant_user_id_idx on public.team_members (tenant_user_id);

select public.attach_updated_at('public.users');
select public.attach_updated_at('public.roles');
select public.attach_updated_at('public.tenant_users');
select public.attach_updated_at('public.teams');
