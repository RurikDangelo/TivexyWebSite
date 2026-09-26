-- Tivexy Core — fecha três brechas encontradas em revisão adversarial
--
-- As três passaram pelos testes anteriores porque os testes perguntavam
-- "o RLS nega o acesso óbvio?". O RLS decide quais LINHAS alguém enxerga; ele
-- não verifica quais COLUNAS foram escritas, nem se os valores dentro da linha
-- fazem sentido juntos. Essas duas coisas são trabalho de privilégio de coluna
-- e de constraint.
--
-- Cada uma tem teste em `supabase/tests/integrity.test.mjs`.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Escalada de privilégio: qualquer pessoa virava Super Admin
-- ─────────────────────────────────────────────────────────────────────────
--
-- A política `users_update_self` permite atualizar a própria linha. O `with
-- check` confere `id = auth.uid()` — a LINHA está certa. Mas nada impedia que a
-- atualização incluísse `is_super_admin = true`, e o Super Admin enxerga todos
-- os tenants da plataforma.
--
-- RLS não expressa restrição de coluna. Quem expressa é o privilégio de coluna,
-- que é o primitivo certo e falha fechado: o que não foi concedido, não existe.

revoke update on public.users from authenticated;

-- Só o que a pessoa realmente edita no próprio perfil.
grant update (full_name, avatar_url, last_seen_at) on public.users to authenticated;

comment on column public.users.is_super_admin is
  'Equipe Tivexy. Não é atualizável pelo papel authenticated: conceder é operação de backend, com service_role e auditoria.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Vínculo apontando para papel de outro tenant
-- ─────────────────────────────────────────────────────────────────────────
--
-- `tenant_users.role_id` referencia `roles`, e só. Nada impedia um vínculo
-- dentro da Aurora carregar um papel próprio da Base — e as permissões desse
-- papel valeriam na Aurora.
--
-- A chave estrangeira composta não resolve: papel de sistema tem `tenant_id`
-- nulo, e MATCH SIMPLE nunca casaria com ele. Daí o gatilho.

create or replace function public.assert_role_belongs_to_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  papel_tenant uuid;
begin
  select r.tenant_id into papel_tenant from public.roles r where r.id = new.role_id;

  -- Papel de sistema (tenant_id nulo) vale para todos.
  if papel_tenant is not null and papel_tenant <> new.tenant_id then
    raise exception
      'tenant_users_role_do_tenant: o papel % pertence a outro tenant', new.role_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger tenant_users_role_do_tenant
  before insert or update of role_id, tenant_id on public.tenant_users
  for each row execute function public.assert_role_belongs_to_tenant();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Equipe recebendo membro de outro tenant
-- ─────────────────────────────────────────────────────────────────────────
--
-- `team_members` liga `teams` a `tenant_users`, mas não exigia que os dois
-- fossem do mesmo tenant. A política de escrita olha o tenant da EQUIPE; o
-- vínculo do outro lado passava sem conferência.

create or replace function public.assert_team_member_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_equipe uuid;
  tenant_membro uuid;
begin
  select t.tenant_id into tenant_equipe from public.teams t where t.id = new.team_id;
  select tu.tenant_id into tenant_membro
    from public.tenant_users tu where tu.id = new.tenant_user_id;

  if tenant_equipe is distinct from tenant_membro then
    raise exception
      'team_members_mesmo_tenant: a equipe e o membro são de tenants diferentes'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger team_members_mesmo_tenant
  before insert or update on public.team_members
  for each row execute function public.assert_team_member_same_tenant();
