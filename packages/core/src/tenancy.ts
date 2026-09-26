/**
 * Estados de tenant e de vínculo. Espelham os enums do Postgres criados em
 * `supabase/migrations/20260919020000_core_foundation.sql`.
 */

export const TENANT_STATUSES = ['provisioning', 'active', 'suspended', 'cancelled'] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * Só vínculo ativo dá acesso a dado. Convite pendente não lê nada — é o que
 * `public.user_tenant_ids()` garante no banco, e esta função repete no cliente
 * para a interface não prometer o que o RLS vai negar.
 */
export function grantsAccess(status: MembershipStatus): boolean {
  return status === 'active';
}

/** Um tenant só opera quando o provisionamento termina. */
export function isOperational(status: TenantStatus): boolean {
  return status === 'active';
}
