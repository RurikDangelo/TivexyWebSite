-- Tivexy Core — tenancy
--
-- O tenant é a unidade de isolamento: a empresa cliente. Plano e módulos
-- definem o que ela contratou e o que está ligado.
--
-- Plano e módulos são coisas diferentes de propósito: o plano é o pacote
-- comercial, os módulos do tenant são o que está de fato habilitado. Um tenant
-- pode ter um módulo ligado fora do plano (cortesia, piloto, migração) sem que
-- isso vire um plano novo.

-- ─────────────────────────────────────────────────────────────────────────
-- Catálogo da plataforma (global, não pertence a nenhum tenant)
-- ─────────────────────────────────────────────────────────────────────────

create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint plans_code_format check (code ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.plans is
  'Pacotes comerciais. Catálogo global da plataforma.';

create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint modules_code_format check (code ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.modules is
  'Módulos da plataforma: crm, erp, inventory, finance, fiscal, etc.';

create table public.plan_modules (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  module_id  uuid not null references public.modules (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, module_id)
);

comment on table public.plan_modules is
  'Quais módulos cada plano inclui por padrão.';

create index plan_modules_module_id_idx on public.plan_modules (module_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Tenants
-- ─────────────────────────────────────────────────────────────────────────

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  legal_name  text,
  -- Só dígitos. A formatação é responsabilidade da interface.
  document    text,
  status      public.tenant_status not null default 'provisioning',
  plan_id     uuid references public.plans (id) on delete restrict,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- O slug vira subdomínio: precisa ser seguro em URL.
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  constraint tenants_slug_length check (char_length(slug) between 2 and 63),
  constraint tenants_document_digits check (document is null or document ~ '^[0-9]+$')
);

comment on table public.tenants is
  'A empresa cliente. Unidade de isolamento de todo o Core.';
comment on column public.tenants.slug is
  'Identificador em URL/subdomínio. Imutável na prática: mudar quebra links.';

create index tenants_status_idx on public.tenants (status);
create index tenants_plan_id_idx on public.tenants (plan_id);

-- Um tenant pode ter módulo ligado fora do plano. Esta tabela é a verdade
-- sobre o que está habilitado; o plano é só o padrão de origem.
create table public.tenant_modules (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  module_id  uuid not null references public.modules (id) on delete restrict,
  is_enabled boolean not null default true,
  enabled_at timestamptz,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_id)
);

comment on table public.tenant_modules is
  'O que está de fato habilitado para o tenant. Fonte de verdade sobre acesso a módulo.';

create index tenant_modules_module_id_idx on public.tenant_modules (module_id);
create index tenant_modules_enabled_idx on public.tenant_modules (tenant_id) where is_enabled;

select public.attach_updated_at('public.plans');
select public.attach_updated_at('public.modules');
select public.attach_updated_at('public.tenants');
select public.attach_updated_at('public.tenant_modules');
