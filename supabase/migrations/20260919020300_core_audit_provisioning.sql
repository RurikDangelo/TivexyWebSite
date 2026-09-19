-- Tivexy Core — auditoria e provisionamento
--
-- O provisionamento é prioridade zero do produto (ADR-002). Ele precisa ser
-- idempotente, retentável e auditável — e essas três propriedades se sustentam
-- no esquema, não na aplicação:
--
--   * idempotência  → `idempotency_key` único: repetir a chamada devolve a
--                     mesma execução em vez de criar um segundo tenant
--   * retry seguro  → uma linha por etapa; retomar pula o que já concluiu
--   * exclusividade → índice parcial impede duas execuções vivas no mesmo tenant
--   * compensação   → etapa concluída sabe se já foi desfeita

-- ─────────────────────────────────────────────────────────────────────────
-- Auditoria
-- ─────────────────────────────────────────────────────────────────────────

create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  -- Nulo em ação de plataforma (Super Admin criando tenant, por exemplo):
  -- o registro existe antes de haver tenant.
  tenant_id     uuid references public.tenants (id) on delete set null,
  -- Nulo quando a ação foi automática (job, webhook, automação).
  actor_user_id uuid references public.users (id) on delete set null,
  action        text not null,
  resource_type text not null,
  resource_id   text,
  -- Contexto da operação. Nunca credenciais, token ou senha.
  metadata      jsonb not null default '{}'::jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  constraint audit_logs_action_format check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$')
);

comment on table public.audit_logs is
  'Quem fez o quê, quando. Somente inserção: nunca editar nem apagar.';
comment on column public.audit_logs.metadata is
  'Contexto da operação. Proibido guardar credencial, token ou senha.';

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Provisionamento
-- ─────────────────────────────────────────────────────────────────────────

create table public.provisioning_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- É isto que torna o fluxo idempotente. O chamador gera a chave; repetir a
  -- chamada com a mesma chave devolve esta execução em vez de criar outra.
  idempotency_key text not null unique,
  status          public.provisioning_status not null default 'pending',
  current_step    text,
  attempts        integer not null default 0,
  last_error      text,
  -- Entrada do fluxo: plano, módulos, dados do administrador. Sem senha.
  payload         jsonb not null default '{}'::jsonb,
  requested_by    uuid references public.users (id) on delete set null,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint provisioning_runs_attempts_positive check (attempts >= 0),
  -- Execução terminada tem fim; execução viva, não.
  constraint provisioning_runs_finished_consistency check (
    (status in ('succeeded', 'failed', 'compensated')) = (finished_at is not null)
  )
);

comment on table public.provisioning_runs is
  'Uma execução do fluxo de provisionamento de um tenant.';
comment on column public.provisioning_runs.idempotency_key is
  'Chave do chamador. UNIQUE é o que impede criar dois tenants pela mesma requisição.';

-- Duas execuções vivas no mesmo tenant se atropelariam. Uma por vez.
create unique index provisioning_runs_one_active_per_tenant
  on public.provisioning_runs (tenant_id)
  where status in ('pending', 'running', 'compensating');

create index provisioning_runs_status_idx on public.provisioning_runs (status, created_at desc);

create table public.provisioning_steps (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.provisioning_runs (id) on delete cascade,
  step         text not null,
  position     integer not null,
  status       public.provisioning_step_status not null default 'pending',
  attempts     integer not null default 0,
  error        text,
  -- Saída da etapa: ids criados, o que precisa ser desfeito na compensação.
  result       jsonb not null default '{}'::jsonb,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Retomar uma execução não pode duplicar etapa.
  constraint provisioning_steps_unique unique (run_id, step),
  constraint provisioning_steps_position_unique unique (run_id, position),
  constraint provisioning_steps_attempts_positive check (attempts >= 0)
);

comment on table public.provisioning_steps is
  'Uma linha por etapa. É o que permite retomar de onde parou e compensar o que já teve efeito.';
comment on column public.provisioning_steps.result is
  'Saída da etapa, incluindo o que a compensação precisa desfazer.';

create index provisioning_steps_run_idx on public.provisioning_steps (run_id, position);
create index provisioning_steps_status_idx on public.provisioning_steps (status);

select public.attach_updated_at('public.provisioning_runs');
select public.attach_updated_at('public.provisioning_steps');
