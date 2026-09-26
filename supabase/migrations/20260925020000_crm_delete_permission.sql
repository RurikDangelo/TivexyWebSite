-- Tivexy CRM — excluir passa a exigir a permissão de excluir
--
-- O catálogo tem `crm.leads.delete`, `crm.contacts.delete`,
-- `crm.companies.delete` e `crm.deals.delete`, e o papel de Colaborador foi
-- desenhado **sem** elas — "sem exclusão", diz o comentário do catálogo.
--
-- Nada cobrava isso. As políticas de escrita destas quatro tabelas eram
-- `for all` com a permissão `.write`, e `for all` inclui `delete`. Um
-- colaborador apagava lead, pessoa, conta e oportunidade pela API, com a
-- permissão de editar. A interface não oferecia o botão; o banco não negava.
--
-- É o mesmo tipo de defeito do resto da história do Core: a regra existia
-- escrita, e a camada que a garante não sabia dela.
--
-- A correção separa a política em três: inserir e atualizar continuam com
-- `.write`; excluir passa a exigir `.delete`. As outras tabelas do CRM não
-- mudam — funil, etapa, tipo de atividade e atividade não têm permissão de
-- exclusão própria no catálogo, e inventar uma aqui seria catálogo novo sem
-- quem o consuma.

-- ─────────────────────────────────────────────────────────────────────────
-- Leads
-- ─────────────────────────────────────────────────────────────────────────

drop policy crm_leads_write on public.crm_leads;

create policy crm_leads_insert on public.crm_leads
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'));
create policy crm_leads_update on public.crm_leads
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'));
create policy crm_leads_delete on public.crm_leads
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.delete'));

-- ─────────────────────────────────────────────────────────────────────────
-- Pessoas
-- ─────────────────────────────────────────────────────────────────────────

drop policy crm_contacts_write on public.crm_contacts;

create policy crm_contacts_insert on public.crm_contacts
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.write'));
create policy crm_contacts_update on public.crm_contacts
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.write'));
create policy crm_contacts_delete on public.crm_contacts
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.contacts.delete'));

-- ─────────────────────────────────────────────────────────────────────────
-- Contas
-- ─────────────────────────────────────────────────────────────────────────

drop policy crm_companies_write on public.crm_companies;

create policy crm_companies_insert on public.crm_companies
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.write'));
create policy crm_companies_update on public.crm_companies
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.write'));
create policy crm_companies_delete on public.crm_companies
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.companies.delete'));

-- ─────────────────────────────────────────────────────────────────────────
-- Oportunidades
-- ─────────────────────────────────────────────────────────────────────────

drop policy crm_deals_write on public.crm_deals;

create policy crm_deals_insert on public.crm_deals
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'));
create policy crm_deals_update on public.crm_deals
  for update to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'))
  with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.write'));
create policy crm_deals_delete on public.crm_deals
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.deals.delete'));
