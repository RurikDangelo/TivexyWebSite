-- Tivexy Core — fundação
--
-- Tipos e utilidades que o resto do esquema usa. Nada de tabela aqui.
--
-- Convenções que valem para todo o Core:
--   * chave primária `id uuid` com `gen_random_uuid()`
--   * `created_at` e `updated_at` em toda tabela mutável, com trigger
--   * toda entidade de negócio carrega `tenant_id`
--   * exclusão é `on delete restrict` por padrão; cascata só quando o filho
--     não faz sentido sem o pai

-- ─────────────────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────────────────

create type public.tenant_status as enum (
  'provisioning', -- criado, ainda sendo preparado
  'active',
  'suspended',    -- inadimplência ou decisão administrativa
  'cancelled'
);

create type public.membership_status as enum (
  'invited', -- convite enviado, primeiro acesso ainda não aconteceu
  'active',
  'suspended'
);

-- Estados do provisionamento. `compensating`/`compensated` cobrem o desfazer
-- parcial quando uma etapa falha depois de outras já terem efeito.
create type public.provisioning_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'compensating',
  'compensated'
);

create type public.provisioning_step_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'compensated'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Utilidades
-- ─────────────────────────────────────────────────────────────────────────

-- Mantém `updated_at` honesto. A aplicação não deveria escrever essa coluna:
-- se escrever, o trigger sobrescreve.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger de BEFORE UPDATE: carimba updated_at com now().';

-- Aplica o trigger de updated_at numa tabela, sem repetir o DDL seis vezes.
create or replace function public.attach_updated_at(target regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger set_updated_at before update on %s
       for each row execute function public.set_updated_at()',
    target
  );
end;
$$;

comment on function public.attach_updated_at(regclass) is
  'Cria o trigger set_updated_at na tabela indicada.';
