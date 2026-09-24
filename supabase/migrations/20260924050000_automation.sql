-- Motor de automações — as regras e o que elas fizeram
--
-- ─────────────────────────────────────────────────────────────────────────
-- Por que a decisão NÃO mora aqui
-- ─────────────────────────────────────────────────────────────────────────
--
-- Estas duas tabelas guardam a regra e o registro do que aconteceu. **Quem
-- decide se uma regra casa com um evento é `packages/core/src/automation.ts`**,
-- puro, sem I/O.
--
-- A alternativa — um motor em plpgsql, avaliando condições dentro do banco —
-- é tentadora porque garante atomicidade. E cobra caro: cada combinação de
-- operador e valor passa a custar uma transação para testar, e o que custa
-- caro não é testado. Um motor de automação com os casos raros sem teste
-- dispara errado em produção, e "às vezes não funciona" é o pior relato que
-- um cliente pode trazer.
--
-- A mesma divisão de `planProvisioning()` e `executeProvisioning()`: decidir é
-- do Core, escrever é da aplicação.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠️ Só ação interna
-- ─────────────────────────────────────────────────────────────────────────
--
-- Nenhuma ação manda e-mail, mensagem de WhatsApp ou chamada de webhook, e a
-- ausência é fronteira, não atraso: o projeto não tem SMTP próprio nem
-- credencial da Meta, e uma automação que diz "notifiquei o cliente" sem
-- notificar ninguém é pior do que automação nenhuma — ela faz a pessoa parar
-- de conferir.

create table public.automation_rules (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,

  name       text not null,
  -- O código do gatilho, espelhado em `AUTOMATION_EVENTS`. Texto e não enum:
  -- gatilho novo é mudança de aplicação, e um enum obrigaria uma migration
  -- para cada um — com a lista de códigos já conferida contra o TypeScript
  -- pelo teste de contratos.
  event      text not null,

  -- `[{field, operator, value}]` e `[{kind, params}]`. Validados por
  -- `checkRule()` antes de gravar; aqui o banco só garante a forma.
  conditions jsonb not null default '[]'::jsonb,
  actions    jsonb not null default '[]'::jsonb,

  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automation_rules_name_not_blank check (btrim(name) <> ''),
  constraint automation_rules_event_format check (event ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  -- Array, sempre. `{}` ou `null` em `conditions` quebraria o laço da
  -- aplicação num lugar que não tem como se defender sem desconfiar do banco.
  constraint automation_rules_conditions_array check (jsonb_typeof(conditions) = 'array'),
  constraint automation_rules_actions_array check (jsonb_typeof(actions) = 'array'),
  -- Regra sem ação não faz nada. Deixar salvar seria oferecer a ilusão de
  -- automação — o pior defeito possível neste módulo.
  constraint automation_rules_has_action check (jsonb_array_length(actions) > 0),
  constraint automation_rules_name_unique unique (tenant_id, name),
  constraint automation_rules_tenant_id_key unique (tenant_id, id)
);

comment on table public.automation_rules is
  'Regra de automação. A decisão de casar evento com regra é do Core, não daqui.';
comment on column public.automation_rules.event is
  'Código do gatilho, espelhado em AUTOMATION_EVENTS e conferido pelo teste de contratos.';

create index automation_rules_tenant_idx on public.automation_rules (tenant_id);
create index automation_rules_event_idx on public.automation_rules (tenant_id, event)
  where is_active;

-- ─────────────────────────────────────────────────────────────────────────
-- O que cada disparo fez
-- ─────────────────────────────────────────────────────────────────────────
--
-- Sem este registro, automação é mágica: o cliente vê uma atividade que
-- ninguém criou e não tem como descobrir de onde veio. Com ele, a pergunta
-- "por que isso apareceu na minha agenda?" tem resposta.
--
-- Guarda **também as falhas**. Uma automação que falhou em silêncio é pior
-- que uma que não existe, porque a pessoa parou de fazer à mão.

create table public.automation_runs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  -- `set null` e não `cascade`: apagar a regra não pode apagar o histórico do
  -- que ela fez. O nome fica gravado abaixo justamente para o registro
  -- continuar legível depois disso.
  rule_id    uuid,
  rule_name  text not null,

  event      text not null,
  -- O evento como ele chegou. É o que permite responder "por que a regra
  -- casou?" meses depois, quando o lead já mudou de estado três vezes.
  payload    jsonb not null default '{}'::jsonb,

  succeeded  boolean not null,
  -- Nulo quando deu certo; a mensagem quando não deu.
  error      text,
  -- O que foi criado, para a tela poder levar até lá.
  result     jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint automation_runs_error_consistency check (succeeded = (error is null)),
  constraint automation_runs_tenant_id_key unique (tenant_id, id),
  constraint automation_runs_rule_do_tenant
    foreign key (tenant_id, rule_id) references public.automation_rules (tenant_id, id)
    on delete set null (rule_id)
);

comment on table public.automation_runs is
  'O que cada disparo fez, inclusive as falhas. Append-only: histórico não se edita.';
comment on column public.automation_runs.rule_name is
  'O nome no momento do disparo. Guardado porque a regra pode ser apagada ou renomeada.';

create index automation_runs_tenant_idx on public.automation_runs (tenant_id, created_at desc);
create index automation_runs_rule_idx on public.automation_runs (tenant_id, rule_id);
create index automation_runs_failed_idx on public.automation_runs (tenant_id, created_at desc)
  where not succeeded;

-- Histórico não se edita nem se apaga, pelo mesmo motivo da auditoria: log
-- editável não é log.
--
-- **Privilégio revogado, e não gatilho.** A primeira versão usava um gatilho
-- `before update or delete` que levantava exceção, e um teste derrubou a
-- ideia: o gatilho bloqueia também as ações referenciais do próprio Postgres.
-- `on delete set null (rule_id)` é um `update`, e o `on delete cascade` de
-- `tenants` é um `delete` — com o gatilho, **apagar um cliente falharia**, e
-- a mensagem falaria de histórico de automação.
--
-- Revogar de `authenticated` protege exatamente o que precisa ser protegido —
-- a aplicação — e deixa as ações referenciais, que rodam como dona da tabela,
-- funcionarem. É a mesma escolha de `erp_stock_balances`.
revoke update, delete on public.automation_runs from authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table public.automation_rules enable row level security;
alter table public.automation_runs  enable row level security;

create policy automation_rules_read on public.automation_rules
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.read'));
create policy automation_rules_write on public.automation_rules
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.write'));

create policy automation_runs_read on public.automation_runs
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'automation.rules.read'));

-- Escrever no histórico é da aplicação, ao executar a automação — e quem
-- executa é quem provocou o evento, que pode não ter permissão de automação.
-- Daí `insert` liberado a membro ativo, e `update`/`delete` revogados.
create policy automation_runs_insert on public.automation_runs
  for insert to authenticated
  with check (public.is_super_admin() or tenant_id in (select public.user_tenant_ids()));

revoke update (tenant_id) on public.automation_rules from authenticated;

select public.attach_updated_at('public.automation_rules');
