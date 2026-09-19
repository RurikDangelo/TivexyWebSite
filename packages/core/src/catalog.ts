/**
 * Catálogo da plataforma: módulos, papéis de sistema, planos e permissões.
 *
 * Estes valores existem em dois lugares — aqui e no SQL, em
 * `supabase/migrations/20260919020500_core_catalog.sql`. Duplicação é sempre
 * uma dívida, e esta é paga por um teste: `supabase/tests/contracts.test.mjs`
 * compara as duas listas nos dois sentidos e falha se divergirem.
 *
 * Ao adicionar uma permissão: entra na migration E aqui, no mesmo commit.
 */

/* ── Módulos ──────────────────────────────────────────────────────────── */

export const MODULE_CODES = [
  'core',
  'crm',
  'erp',
  'inventory',
  'finance',
  'fiscal',
  'automation',
  'ai',
  'integrations',
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

/* ── Papéis de sistema ────────────────────────────────────────────────── */

/**
 * Super Admin **não** está aqui de propósito: é `users.is_super_admin`, um
 * sinalizador de plataforma, não papel de tenant. Ver docs/12-SECURITY.
 */
export const SYSTEM_ROLE_CODES = ['tenant_admin', 'manager', 'collaborator'] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

/* ── Planos ───────────────────────────────────────────────────────────── */

export const PLAN_CODES = ['essencial', 'profissional', 'avancado'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];

/* ── Permissões ───────────────────────────────────────────────────────── */

/** Formato `modulo.recurso.acao`. */
export const PERMISSION_CODES = [
  // Core
  'core.tenant.read',
  'core.tenant.write',
  'core.users.read',
  'core.users.write',
  'core.roles.read',
  'core.roles.write',
  'core.teams.read',
  'core.teams.write',
  'core.audit.read',
  'core.settings.read',
  'core.settings.write',
  // CRM
  'crm.leads.read',
  'crm.leads.write',
  'crm.leads.delete',
  'crm.contacts.read',
  'crm.contacts.write',
  'crm.contacts.delete',
  'crm.companies.read',
  'crm.companies.write',
  'crm.companies.delete',
  'crm.deals.read',
  'crm.deals.write',
  'crm.deals.delete',
  'crm.activities.read',
  'crm.activities.write',
  // ERP
  'erp.products.read',
  'erp.products.write',
  'erp.products.delete',
  'erp.customers.read',
  'erp.customers.write',
  'erp.suppliers.read',
  'erp.suppliers.write',
  'erp.sales.read',
  'erp.sales.write',
  'erp.purchases.read',
  'erp.purchases.write',
  // Estoque
  'inventory.stock.read',
  'inventory.movements.read',
  'inventory.movements.write',
  // Financeiro
  'finance.payables.read',
  'finance.payables.write',
  'finance.receivables.read',
  'finance.receivables.write',
  'finance.cashflow.read',
  // Fiscal
  'fiscal.documents.read',
  'fiscal.documents.write',
  // Automações
  'automation.rules.read',
  'automation.rules.write',
  // IA
  'ai.assistant.use',
  // Integrações
  'integrations.connections.read',
  'integrations.connections.write',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** O módulo a que uma permissão pertence, lido do próprio código. */
export function moduleOf(permission: PermissionCode): ModuleCode {
  return permission.split('.')[0] as ModuleCode;
}
