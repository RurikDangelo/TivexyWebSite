/**
 * Contratos do provisionamento — prioridade zero do produto.
 *
 * O fluxo e as garantias estão em `docs/06-ADMIN/PROVISIONING.md`; o esquema
 * que as sustenta, em `supabase/migrations/20260919020300_*.sql`.
 */

export const PROVISIONING_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'compensating',
  'compensated',
] as const;

export type ProvisioningStatus = (typeof PROVISIONING_STATUSES)[number];

export const PROVISIONING_STEP_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'compensated',
] as const;

export type ProvisioningStepStatus = (typeof PROVISIONING_STEP_STATUSES)[number];

/** As etapas, na ordem em que executam. A ordem é parte do contrato. */
export const PROVISIONING_STEPS = [
  'create_tenant',
  'apply_plan',
  'enable_modules',
  'create_admin',
  'seed_defaults',
  'send_invite',
] as const;

export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];

/** Estados terminais. O esquema exige `finished_at` justamente nestes. */
const TERMINAL: readonly ProvisioningStatus[] = ['succeeded', 'failed', 'compensated'];

export function isTerminal(status: ProvisioningStatus): boolean {
  return TERMINAL.includes(status);
}

/** Uma execução viva ocupa o tenant: o banco impede uma segunda. */
export function isActive(status: ProvisioningStatus): boolean {
  return !isTerminal(status);
}

/** Progresso para exibir no painel, de 0 a 1. */
export function progressOf(completedSteps: number): number {
  const total = PROVISIONING_STEPS.length;
  return Math.min(Math.max(completedSteps, 0), total) / total;
}
