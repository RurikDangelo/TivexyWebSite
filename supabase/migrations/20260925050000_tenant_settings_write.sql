-- Tivexy Core — configurações se escrevem com a permissão de configurações
--
-- O catálogo tem `core.settings.read` e `core.settings.write`. A rota
-- `/configuracoes` exige a primeira. A **escrita** nunca exigiu a segunda:
-- `settings` é coluna de `tenants`, e a política `tenants_update` confere
-- `core.tenant.write`. Um papel com `core.settings.write` e sem
-- `core.tenant.write` não conseguia salvar; um com o contrário conseguia.
--
-- A correção: a coluna sai do `GRANT UPDATE` do papel `authenticated`, e a
-- escrita passa por uma função que confere a permissão certa e registra o
-- antes e o depois na auditoria — configuração muda o comportamento da
-- empresa inteira (fuso, baixa de estoque), e "quem mudou isso?" precisa de
-- resposta.
--
-- A função não valida chave nem valor. Isso é do Core (`overridesFrom`,
-- `checkSettingValue`), que conhece o catálogo de configurações; repetir o
-- catálogo em SQL seria mais uma cópia para divergir. Ela confere o que só o
-- banco pode garantir: quem, e que o formato é um objeto.

revoke update (settings) on public.tenants from authenticated;

create or replace function public.update_tenant_settings(p_tenant_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  if not (public.is_super_admin() or public.has_permission(p_tenant_id, 'core.settings.write')) then
    raise exception using
      errcode = '42501',
      message = 'você não tem permissão para mudar as configurações';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'configurações precisam ser um objeto';
  end if;

  select t.settings into v_antes from public.tenants t where t.id = p_tenant_id for update;

  update public.tenants set settings = p_settings where id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'tenant.settings_updated', 'tenant', p_tenant_id::text,
    jsonb_build_object('antes', coalesce(v_antes, '{}'::jsonb), 'depois', p_settings)
  );
end;
$$;

comment on function public.update_tenant_settings(uuid, jsonb) is
  'Grava as configurações do tenant exigindo core.settings.write, com auditoria. A validação é do Core.';

revoke execute on function public.update_tenant_settings(uuid, jsonb) from public, anon;
grant execute on function public.update_tenant_settings(uuid, jsonb) to authenticated;
