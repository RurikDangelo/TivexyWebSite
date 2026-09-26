-- Tivexy Core — a empresa não fica sem administrador
--
-- A tela de equipe deixa trocar papel, suspender e remover. As três são o
-- mesmo risco quando alcançam a última pessoa com `tenant_admin` ativa: a
-- empresa fica sem ninguém que possa administrar usuários, papéis e
-- configurações — e sem como sair disso pela própria tela. Só a Tivexy, pelo
-- banco.
--
-- A regra é do banco, e não da tela: a mesma escrita pode vir da API, de um
-- script ou de outra tela amanhã.
--
-- ## O que ela deixa passar
--
-- Apagar a **empresa** ou a **conta** da pessoa apaga o vínculo em cascata, e
-- aí não há empresa a proteger — ou não há mais a pessoa. O gatilho olha se o
-- pai ainda existe; se não existe, é cascata, e passa.

create or replace function public.assert_tenant_keeps_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
begin
  select r.id into v_admin
  from public.roles r
  where r.code = 'tenant_admin' and r.tenant_id is null;

  -- O vínculo antigo não era de administrador ativo: não há o que proteger.
  if old.role_id is distinct from v_admin or old.status <> 'active' then
    return coalesce(new, old);
  end if;

  -- Continua administrador ativo depois da mudança.
  if tg_op = 'UPDATE' and new.role_id = v_admin and new.status = 'active' then
    return new;
  end if;

  -- Cascata: a empresa ou a pessoa está sendo apagada.
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.tenants t where t.id = old.tenant_id)
    or not exists (select 1 from public.users u where u.id = old.user_id)
  ) then
    return old;
  end if;

  if not exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = old.tenant_id
      and tu.id <> old.id
      and tu.role_id = v_admin
      and tu.status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'a empresa ficaria sem administrador; dê o papel de administrador a outra pessoa antes';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.assert_tenant_keeps_admin() is
  'Recusa remover, rebaixar ou suspender o último administrador ativo de um tenant. Cascata passa.';

create trigger tenant_users_keeps_admin
  before update of role_id, status or delete on public.tenant_users
  for each row execute function public.assert_tenant_keeps_admin();

-- ─────────────────────────────────────────────────────────────────────────
-- Ninguém dá um papel com mais poder que o seu
-- ─────────────────────────────────────────────────────────────────────────
--
-- O Gestor não tem `core.roles.write` — o catálogo explica: "um gestor que
-- edita papéis pode se promover a administrador". Mas ele tem
-- `core.users.write`, e isso basta para escrever `role_id` em qualquer
-- vínculo da empresa, **inclusive o dele**, apontando para `tenant_admin`. A
-- porta que o catálogo fechou em `roles` continuava aberta em `tenant_users`.
--
-- A regra: quem atribui um papel precisa ter cada permissão que o papel dá.
-- Vale para convidar (insert) e para trocar (update de `role_id`).
--
-- Não vale para quem não é pessoa — o provisionamento escreve pela conexão de
-- serviço, sem `auth.uid()` — nem para o Super Admin, que é a plataforma.

create or replace function public.assert_role_within_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role_id is not distinct from old.role_id then
    return new;
  end if;

  -- Quem não pode escrever vínculos aqui é problema do RLS, não desta regra.
  -- Sem este corte, a recusa de quem tenta entrar na empresa alheia sairia
  -- daqui, com uma mensagem sobre papel — e esconderia a do RLS, que é a certa.
  if not public.has_permission(new.tenant_id, 'core.users.write') then
    return new;
  end if;

  if exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = new.role_id
      and not public.has_permission(new.tenant_id, p.code)
  ) then
    raise exception using
      errcode = '42501',
      message = 'você não pode dar um papel com permissões que você mesmo não tem';
  end if;

  return new;
end;
$$;

comment on function public.assert_role_within_actor() is
  'Quem atribui um papel precisa ter todas as permissões dele. Fecha a promoção do gestor a administrador.';

create trigger tenant_users_role_within_actor
  before insert or update of role_id on public.tenant_users
  for each row execute function public.assert_role_within_actor();
