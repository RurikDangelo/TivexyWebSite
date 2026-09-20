-- Tivexy CRM — funil, contas, pessoas e atividades
--
-- O primeiro módulo de negócio. Ele **não** reimplementa nada do Core: tenant,
-- usuário, papel e permissão continuam vindo de lá, e toda política abaixo
-- consulta as mesmas funções que as tabelas do Core consultam.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A decisão estrutural deste arquivo: chave estrangeira composta
-- ─────────────────────────────────────────────────────────────────────────
--
-- A revisão adversarial do Core encontrou três defeitos da **mesma família**:
-- uma linha apontando para outra de um tenant diferente. Vínculo com papel de
-- outro tenant, equipe com membro de outro tenant. O RLS não pega isso — ele
-- decide quais linhas alguém enxerga, não se os valores de uma linha fazem
-- sentido juntos.
--
-- No Core aquilo foi resolvido com gatilho, porque papel de sistema tem
-- `tenant_id` nulo e a chave composta não fecharia. Aqui **toda** linha
-- pertence a exatamente um tenant, então dá para fazer melhor: cada tabela
-- ganha `unique (tenant_id, id)`, e cada referência entre tabelas do CRM leva
-- o `tenant_id` junto.
--
--   foreign key (tenant_id, pipeline_id)
--     references public.crm_pipelines (tenant_id, id)
--
-- Com isso, apontar para outro tenant deixa de ser um defeito a testar e passa
-- a ser **impossível de escrever**. Não há gatilho para esquecer de criar, nem
-- ordem de execução para dar errado. É o próprio Postgres recusando.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Módulo desabilitado não é fronteira de segurança
-- ─────────────────────────────────────────────────────────────────────────
--
-- As políticas abaixo checam pertencimento e permissão, e **não** checam
-- `tenant_modules.is_enabled`. É deliberado: desabilitar um módulo é evento
-- comercial, não de segurança. O dado continua sendo do cliente, e precisa
-- continuar alcançável para exportação, suporte e reativação.
--
-- Quem esconde o módulo é a aplicação — `decideAccess()` já nega por
-- `module-disabled`, com texto que manda falar com o comercial em vez de com o
-- administrador. Ver `docs/12-SECURITY/AUTHORIZATION.md`.

-- ─────────────────────────────────────────────────────────────────────────
-- Estados
-- ─────────────────────────────────────────────────────────────────────────

-- O que uma etapa significa para o negócio.
--
-- É daqui que sai a situação de uma oportunidade: **a oportunidade não guarda
-- status próprio**. Guardar os dois seria manter duas verdades que divergem no
-- dia em que alguém mover a etapa por SQL — e a divergência não daria erro,
-- só relatório errado.
create type public.crm_stage_kind as enum (
  'open',
  'won',
  'lost'
);

-- O ciclo de um lead, antes de virar cliente.
--
-- `converted` é terminal e não se desfaz: o lead vira conta, pessoa e
-- oportunidade, e o registro dele fica como histórico de origem.
create type public.crm_lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'disqualified',
  'converted'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Contas — as empresas com quem se negocia
-- ─────────────────────────────────────────────────────────────────────────
--
-- Nome no plural em inglês, como o resto do esquema. O **rótulo** que o
-- cliente vê vem do Blueprint (`crm.companies`), e é por isso que uma clínica
-- lê "convênio" onde uma consultoria lê "empresa" sem que a tabela mude.

create table public.crm_companies (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  legal_name text,
  -- Só dígitos, como em `tenants.document`. Formatar é da interface.
  document   text,
  email      text,
  phone      text,
  website    text,
  notes      text,
  -- Quem responde por esta conta. A chave composta exige que seja membro
  -- **deste** tenant: `tenant_users` é único por (tenant_id, user_id).
  owner_id   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_companies_name_not_blank check (btrim(name) <> ''),
  constraint crm_companies_document_digits check (document is null or document ~ '^[0-9]+$'),
  -- O par existe para as filhas apontarem levando o tenant junto.
  constraint crm_companies_tenant_id_key unique (tenant_id, id),
  constraint crm_companies_owner_do_tenant
    foreign key (tenant_id, owner_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (owner_id)
);

comment on table public.crm_companies is
  'Conta: a empresa com quem o cliente negocia. Rótulo vem do Blueprint.';
comment on column public.crm_companies.owner_id is
  'Responsável. A FK composta garante que é membro deste tenant, não de outro.';

create index crm_companies_tenant_idx on public.crm_companies (tenant_id);
create index crm_companies_owner_idx on public.crm_companies (tenant_id, owner_id);
-- Busca por nome é o caminho mais usado da tela. `text_pattern_ops` serve ao
-- prefixo; busca por trecho no meio vira trabalho para full-text, depois.
create index crm_companies_name_idx on public.crm_companies (tenant_id, lower(name));

-- ─────────────────────────────────────────────────────────────────────────
-- Pessoas
-- ─────────────────────────────────────────────────────────────────────────

create table public.crm_contacts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  -- Pessoa sem conta é comum e legítimo: consumidor final, indicação.
  company_id uuid,
  name       text not null,
  email      text,
  phone      text,
  -- Cargo, função, especialidade. Texto livre de propósito: cada nicho usa o
  -- seu, e transformar isso em catálogo seria decidir pelo cliente.
  title      text,
  notes      text,
  owner_id   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_contacts_name_not_blank check (btrim(name) <> ''),
  constraint crm_contacts_tenant_id_key unique (tenant_id, id),
  constraint crm_contacts_company_do_tenant
    foreign key (tenant_id, company_id) references public.crm_companies (tenant_id, id)
    on delete set null (company_id),
  constraint crm_contacts_owner_do_tenant
    foreign key (tenant_id, owner_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (owner_id)
);

comment on table public.crm_contacts is
  'Pessoa. Pode pertencer a uma conta ou existir sozinha.';

create index crm_contacts_tenant_idx on public.crm_contacts (tenant_id);
create index crm_contacts_company_idx on public.crm_contacts (tenant_id, company_id);
create index crm_contacts_owner_idx on public.crm_contacts (tenant_id, owner_id);
create index crm_contacts_name_idx on public.crm_contacts (tenant_id, lower(name));
create index crm_contacts_email_idx on public.crm_contacts (tenant_id, lower(email))
  where email is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- Funis e etapas
-- ─────────────────────────────────────────────────────────────────────────
--
-- É o que o Blueprint semeia: `crm.pipelines` e `crm.pipeline_stages` estão
-- declarados na clínica odontológica desde antes destas tabelas existirem, e
-- ficavam registrados como pendentes. A partir daqui, semeiam de verdade.

create table public.crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  -- O funil que a tela abre quando ninguém escolheu. Um por tenant, no
  -- máximo — garantido pelo índice parcial abaixo, não por código.
  is_default boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_pipelines_name_not_blank check (btrim(name) <> ''),
  constraint crm_pipelines_name_unique unique (tenant_id, name),
  constraint crm_pipelines_tenant_id_key unique (tenant_id, id)
);

comment on table public.crm_pipelines is
  'Funil de vendas. Semeado pelo Blueprint do nicho.';

-- Um padrão por tenant. Índice parcial, como `provisioning_runs`: a regra é do
-- banco, então não depende de nenhuma escrita lembrar dela.
create unique index crm_pipelines_one_default_per_tenant
  on public.crm_pipelines (tenant_id) where is_default;

create index crm_pipelines_tenant_idx on public.crm_pipelines (tenant_id, position);

create table public.crm_pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  pipeline_id uuid not null,
  name        text not null,
  -- `open`, `won` ou `lost`. É daqui que sai a situação da oportunidade.
  kind        public.crm_stage_kind not null default 'open',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint crm_pipeline_stages_name_not_blank check (btrim(name) <> ''),
  constraint crm_pipeline_stages_position_positive check (position >= 0),
  constraint crm_pipeline_stages_unique unique (pipeline_id, name),
  constraint crm_pipeline_stages_tenant_id_key unique (tenant_id, id),
  constraint crm_pipeline_stages_pipeline_do_tenant
    foreign key (tenant_id, pipeline_id) references public.crm_pipelines (tenant_id, id)
    on delete cascade
);

comment on table public.crm_pipeline_stages is
  'Etapa de um funil. `kind` define o que a etapa significa: aberta, ganha ou perdida.';

create index crm_pipeline_stages_pipeline_idx
  on public.crm_pipeline_stages (tenant_id, pipeline_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- Oportunidades
-- ─────────────────────────────────────────────────────────────────────────

create table public.crm_deals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  pipeline_id         uuid not null,
  stage_id            uuid not null,
  company_id          uuid,
  contact_id          uuid,
  title               text not null,
  -- Dinheiro em centavos, inteiro. `numeric` também serviria; ponto flutuante
  -- não serve, e é o engano que só aparece quando a soma do relatório fecha
  -- um centavo fora do extrato.
  value_cents         bigint not null default 0,
  expected_close_date date,
  -- Preenchido quando a oportunidade entra em etapa terminal, e limpo quando
  -- sai. Quem mantém é o gatilho abaixo — não a aplicação.
  closed_at           timestamptz,
  notes               text,
  owner_id            uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint crm_deals_title_not_blank check (btrim(title) <> ''),
  constraint crm_deals_value_not_negative check (value_cents >= 0),
  constraint crm_deals_tenant_id_key unique (tenant_id, id),
  constraint crm_deals_pipeline_do_tenant
    foreign key (tenant_id, pipeline_id) references public.crm_pipelines (tenant_id, id)
    on delete restrict,
  constraint crm_deals_stage_do_tenant
    foreign key (tenant_id, stage_id) references public.crm_pipeline_stages (tenant_id, id)
    on delete restrict,
  constraint crm_deals_company_do_tenant
    foreign key (tenant_id, company_id) references public.crm_companies (tenant_id, id)
    on delete set null (company_id),
  constraint crm_deals_contact_do_tenant
    foreign key (tenant_id, contact_id) references public.crm_contacts (tenant_id, id)
    on delete set null (contact_id),
  constraint crm_deals_owner_do_tenant
    foreign key (tenant_id, owner_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (owner_id)
);

comment on table public.crm_deals is
  'Oportunidade. A situação (aberta/ganha/perdida) é a da etapa, não uma coluna própria.';
comment on column public.crm_deals.value_cents is
  'Centavos, inteiro. Nunca ponto flutuante — a soma precisa fechar com o extrato.';

create index crm_deals_tenant_idx on public.crm_deals (tenant_id);
create index crm_deals_stage_idx on public.crm_deals (tenant_id, stage_id);
create index crm_deals_pipeline_idx on public.crm_deals (tenant_id, pipeline_id);
create index crm_deals_company_idx on public.crm_deals (tenant_id, company_id);
create index crm_deals_contact_idx on public.crm_deals (tenant_id, contact_id);
create index crm_deals_owner_idx on public.crm_deals (tenant_id, owner_id);
-- As abertas são o que a tela do funil pede o tempo todo.
create index crm_deals_open_idx on public.crm_deals (tenant_id, pipeline_id)
  where closed_at is null;

-- A etapa precisa ser **deste** funil.
--
-- A chave composta garante que etapa e oportunidade são do mesmo tenant, e
-- isso não basta: dentro de um tenant há vários funis, e nada impediria a
-- oportunidade do funil A parar numa etapa do funil B. O sintoma seria uma
-- oportunidade que some da tela do funil dela e aparece na de outro.
create or replace function public.assert_deal_stage_in_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  funil_da_etapa uuid;
begin
  select s.pipeline_id into funil_da_etapa
  from public.crm_pipeline_stages s
  where s.id = new.stage_id;

  if funil_da_etapa is distinct from new.pipeline_id then
    raise exception using
      errcode = '23514',
      message = format(
        'crm_deals_stage_do_pipeline: a etapa %s não pertence ao funil %s',
        new.stage_id, new.pipeline_id
      );
  end if;

  return new;
end;
$$;

comment on function public.assert_deal_stage_in_pipeline() is
  'A etapa de uma oportunidade precisa ser do funil dela. A FK composta não alcança isso.';

create trigger crm_deals_stage_do_pipeline
  before insert or update of stage_id, pipeline_id on public.crm_deals
  for each row execute function public.assert_deal_stage_in_pipeline();

-- `closed_at` acompanha a etapa, e ninguém precisa lembrar disso.
--
-- Deixar a data a cargo de quem escreve significa que uma oportunidade movida
-- para "Perdido" por importação, por automação ou por SQL fica sem data de
-- fechamento — e o relatório de ciclo de venda passa a mentir, sem erro.
create or replace function public.sync_deal_closed_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  terminal boolean;
begin
  select s.kind <> 'open' into terminal
  from public.crm_pipeline_stages s
  where s.id = new.stage_id;

  if terminal then
    -- Reabrir e fechar de novo carimba a data nova; permanecer fechada preserva.
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;

  return new;
end;
$$;

comment on function public.sync_deal_closed_at() is
  'Carimba closed_at ao entrar em etapa terminal e limpa ao voltar para aberta.';

create trigger crm_deals_closed_at
  before insert or update of stage_id on public.crm_deals
  for each row execute function public.sync_deal_closed_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Leads
-- ─────────────────────────────────────────────────────────────────────────
--
-- Um lead **não é** uma pessoa cadastrada. É um contato de origem incerta que
-- ainda não foi qualificado: nome e telefone escritos à mão, um formulário do
-- site, uma indicação. Misturá-lo com `crm_contacts` sujaria a agenda de quem
-- trabalha com ela todo dia.
--
-- Converter é o momento em que ele vira conta, pessoa e oportunidade. O lead
-- fica, com `converted`, porque a origem é informação — é o que responde "de
-- onde vêm os clientes que fecham".

create table public.crm_leads (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  name         text not null,
  email        text,
  phone        text,
  -- Texto livre: aqui ainda não existe conta, e criar uma no cadastro do lead
  -- encheria a base de empresas que nunca viraram nada.
  company_name text,
  -- De onde veio. Texto livre pelo mesmo motivo de `crm_contacts.title`.
  source       text,
  status       public.crm_lead_status not null default 'new',
  notes        text,
  owner_id     uuid,
  -- O que ele virou. Preenchido só na conversão.
  converted_at         timestamptz,
  converted_company_id uuid,
  converted_contact_id uuid,
  converted_deal_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint crm_leads_name_not_blank check (btrim(name) <> ''),
  -- Data de conversão e estado não podem discordar.
  constraint crm_leads_converted_consistency
    check ((status = 'converted') = (converted_at is not null)),
  constraint crm_leads_tenant_id_key unique (tenant_id, id),
  constraint crm_leads_owner_do_tenant
    foreign key (tenant_id, owner_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (owner_id),
  constraint crm_leads_company_do_tenant
    foreign key (tenant_id, converted_company_id) references public.crm_companies (tenant_id, id)
    on delete set null (converted_company_id),
  constraint crm_leads_contact_do_tenant
    foreign key (tenant_id, converted_contact_id) references public.crm_contacts (tenant_id, id)
    on delete set null (converted_contact_id),
  constraint crm_leads_deal_do_tenant
    foreign key (tenant_id, converted_deal_id) references public.crm_deals (tenant_id, id)
    on delete set null (converted_deal_id)
);

comment on table public.crm_leads is
  'Contato ainda não qualificado. Vira conta, pessoa e oportunidade ao converter.';

create index crm_leads_tenant_idx on public.crm_leads (tenant_id);
create index crm_leads_status_idx on public.crm_leads (tenant_id, status);
create index crm_leads_owner_idx on public.crm_leads (tenant_id, owner_id);
create index crm_leads_name_idx on public.crm_leads (tenant_id, lower(name));
-- A fila de trabalho: quem ainda não foi tratado, mais recente primeiro.
create index crm_leads_aberto_idx on public.crm_leads (tenant_id, created_at desc)
  where status in ('new', 'contacted');

-- ─────────────────────────────────────────────────────────────────────────
-- Atividades
-- ─────────────────────────────────────────────────────────────────────────

create table public.crm_activity_types (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_activity_types_name_not_blank check (btrim(name) <> ''),
  constraint crm_activity_types_unique unique (tenant_id, name),
  constraint crm_activity_types_tenant_id_key unique (tenant_id, id)
);

comment on table public.crm_activity_types is
  'Tipo de atividade — ligação, visita, retorno. Semeado pelo Blueprint do nicho.';

create index crm_activity_types_tenant_idx on public.crm_activity_types (tenant_id, position);

-- Uma atividade fala de **uma** coisa.
--
-- A alternativa comum é um par `(subject_type, subject_id)` polimórfico, que
-- nenhuma chave estrangeira consegue conferir: a referência quebra em silêncio
-- quando o alvo é apagado. Aqui são quatro colunas, cada uma com FK composta,
-- e um check exigindo exatamente uma preenchida.
create table public.crm_activities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  type_id     uuid,
  subject     text not null,
  notes       text,
  due_at      timestamptz,
  done_at     timestamptz,
  owner_id    uuid,

  lead_id     uuid,
  contact_id  uuid,
  company_id  uuid,
  deal_id     uuid,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint crm_activities_subject_not_blank check (btrim(subject) <> ''),
  constraint crm_activities_one_target check (
    (lead_id is not null)::int
      + (contact_id is not null)::int
      + (company_id is not null)::int
      + (deal_id is not null)::int
    = 1
  ),
  constraint crm_activities_tenant_id_key unique (tenant_id, id),
  constraint crm_activities_type_do_tenant
    foreign key (tenant_id, type_id) references public.crm_activity_types (tenant_id, id)
    on delete set null (type_id),
  constraint crm_activities_owner_do_tenant
    foreign key (tenant_id, owner_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (owner_id),
  constraint crm_activities_lead_do_tenant
    foreign key (tenant_id, lead_id) references public.crm_leads (tenant_id, id)
    on delete cascade,
  constraint crm_activities_contact_do_tenant
    foreign key (tenant_id, contact_id) references public.crm_contacts (tenant_id, id)
    on delete cascade,
  constraint crm_activities_company_do_tenant
    foreign key (tenant_id, company_id) references public.crm_companies (tenant_id, id)
    on delete cascade,
  constraint crm_activities_deal_do_tenant
    foreign key (tenant_id, deal_id) references public.crm_deals (tenant_id, id)
    on delete cascade
);

comment on table public.crm_activities is
  'Ligação, visita, retorno. Aponta para exatamente um alvo, com FK de verdade.';
comment on constraint crm_activities_one_target on public.crm_activities is
  'Exatamente um alvo. Zero seria atividade órfã; dois, ambiguidade na agenda.';

create index crm_activities_tenant_idx on public.crm_activities (tenant_id);
create index crm_activities_lead_idx on public.crm_activities (tenant_id, lead_id)
  where lead_id is not null;
create index crm_activities_contact_idx on public.crm_activities (tenant_id, contact_id)
  where contact_id is not null;
create index crm_activities_company_idx on public.crm_activities (tenant_id, company_id)
  where company_id is not null;
create index crm_activities_deal_idx on public.crm_activities (tenant_id, deal_id)
  where deal_id is not null;
-- A agenda: o que está para vencer e ainda não foi feito.
create index crm_activities_pendentes_idx on public.crm_activities (tenant_id, due_at)
  where done_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────

select public.attach_updated_at('public.crm_companies');
select public.attach_updated_at('public.crm_contacts');
select public.attach_updated_at('public.crm_pipelines');
select public.attach_updated_at('public.crm_pipeline_stages');
select public.attach_updated_at('public.crm_deals');
select public.attach_updated_at('public.crm_leads');
select public.attach_updated_at('public.crm_activity_types');
select public.attach_updated_at('public.crm_activities');

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
--
-- No mesmo arquivo das tabelas, de propósito. O Core separou em dois, e ali
-- faz sentido — são cinco arquivos de esquema para uma política de cada. Aqui
-- é um módulo: tabela e política nascem juntas, e quem adicionar a nona tabela
-- vê as oito políticas logo abaixo. O teste "nenhuma tabela sem RLS" continua
-- sendo a garantia de verdade; isto é só o que torna o esquecimento menos
-- provável.

alter table public.crm_companies       enable row level security;
alter table public.crm_contacts        enable row level security;
alter table public.crm_pipelines       enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_deals           enable row level security;
alter table public.crm_leads           enable row level security;
alter table public.crm_activity_types  enable row level security;
alter table public.crm_activities      enable row level security;

-- Leitura: membro ativo do tenant **com** a permissão de leitura.
-- Escrita: a mesma coisa, com a permissão de escrita.
--
-- Super Admin entra em tudo, como no resto do Core — ele não pertence a tenant
-- nenhum, e as checagens de pertencimento não se aplicam a ele.

create policy crm_companies_read on public.crm_companies
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.read'));
create policy crm_companies_write on public.crm_companies
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.write'));

create policy crm_contacts_read on public.crm_contacts
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.read'));
create policy crm_contacts_write on public.crm_contacts
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.write'));

-- Funil e etapas são estrutura, não dado do dia a dia: quem lê oportunidade
-- precisa enxergá-los, senão a tela do funil não desenha as colunas. Escrever
-- exige a permissão de oportunidade — mexer em etapa mexe no funil de todos.
create policy crm_pipelines_read on public.crm_pipelines
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.read'));
create policy crm_pipelines_write on public.crm_pipelines
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'));

create policy crm_pipeline_stages_read on public.crm_pipeline_stages
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.read'));
create policy crm_pipeline_stages_write on public.crm_pipeline_stages
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'));

create policy crm_deals_read on public.crm_deals
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.read'));
create policy crm_deals_write on public.crm_deals
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'));

create policy crm_leads_read on public.crm_leads
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.read'));
create policy crm_leads_write on public.crm_leads
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'));

-- Tipo de atividade é catálogo do tenant: quem registra atividade precisa ler.
create policy crm_activity_types_read on public.crm_activity_types
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.activities.read'));
create policy crm_activity_types_write on public.crm_activity_types
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.activities.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.activities.write'));

create policy crm_activities_read on public.crm_activities
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.activities.read'));
create policy crm_activities_write on public.crm_activities
  for all to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.activities.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.activities.write'));

-- ─────────────────────────────────────────────────────────────────────────
-- Privilégios de coluna
-- ─────────────────────────────────────────────────────────────────────────
--
-- `tenant_id` não se edita. O RLS impede escrever numa linha de outro tenant,
-- e **não** impede mover a própria linha para outro tenant: o `with check`
-- olha o valor novo, que seria de um tenant onde a pessoa não tem permissão —
-- então na prática recusa. Mas depender desse encadeamento é depender de uma
-- política continuar escrita do jeito certo.
--
-- Revogar o privilégio da coluna é a regra direta, e é a mesma primitiva já
-- usada em `users.is_super_admin`. Ver `docs/12-SECURITY/MULTI_TENANCY.md`.

revoke update (tenant_id) on public.crm_companies       from authenticated;
revoke update (tenant_id) on public.crm_contacts        from authenticated;
revoke update (tenant_id) on public.crm_pipelines       from authenticated;
revoke update (tenant_id) on public.crm_pipeline_stages from authenticated;
revoke update (tenant_id) on public.crm_deals           from authenticated;
revoke update (tenant_id) on public.crm_leads           from authenticated;
revoke update (tenant_id) on public.crm_activity_types  from authenticated;
revoke update (tenant_id) on public.crm_activities      from authenticated;
