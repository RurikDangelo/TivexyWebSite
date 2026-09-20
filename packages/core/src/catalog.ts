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

/* ── Vocabulário ──────────────────────────────────────────────────────── */

/**
 * As chaves que um Blueprint pode renomear.
 *
 * **Derivadas das permissões, não escritas à mão.** Um recurso do Core é algo
 * sobre o que existe permissão — `crm.contacts`, `erp.products` —, então a lista
 * de coisas renomeáveis é exatamente `modulo.recurso` de cada permissão, sem o
 * verbo. Manter uma segunda lista escrita à mão seria criar mais uma
 * duplicação para o teste de contratos vigiar, e ela divergiria no dia em que
 * alguém adicionasse um recurso.
 *
 * O que isto permite cobrar: um blueprint que escreva `erp.produtos` em vez de
 * `erp.products` é recusado na validação, em vez de silenciosamente nunca
 * aplicar o rótulo — que é o tipo de defeito que ninguém encontra, porque a
 * tela só mostra o nome genérico e parece que está certo.
 */
export const TERM_KEYS = [
  ...new Set(PERMISSION_CODES.map((p) => p.split('.').slice(0, 2).join('.'))),
].sort() as readonly string[];

/** O módulo de uma chave de vocabulário. */
export function moduleOfTerm(key: string): string {
  return key.split('.')[0] ?? key;
}
