/**
 * Decisão de acesso na camada de aplicação.
 *
 * O RLS é a última linha de defesa, não a única. A aplicação precisa decidir
 * **antes** de agir: para devolver um erro que explica, para redirecionar em vez
 * de mostrar uma lista vazia, e para não oferecer o que vai ser negado.
 *
 * Estas regras espelham, de propósito, as do banco:
 *
 *   banco                                    aqui
 *   ─────────────────────────────────────    ──────────────────────────────
 *   user_tenant_ids() só devolve 'active'    vínculo 'invited' não acessa
 *   has_permission(tenant, code)             `permissions`
 *   tenant_modules.is_enabled                `enabledModules`
 *   users.is_super_admin                     `isSuperAdmin`
 *
 * Divergir aqui não abre brecha — o banco continua negando. Mas produz uma
 * interface que mente: oferece o que não funciona, ou esconde o que funcionaria.
 *
 * Funções puras, sem I/O: quem monta o `Viewer` é a camada de sessão.
 */

import type { ModuleCode, PermissionCode } from './catalog.ts';
import type { MembershipStatus, TenantStatus } from './tenancy.ts';
import { grantsAccess, isOperational } from './tenancy.ts';

/** O que uma rota exige. */
export type RouteRule =
  /** Aberta. Login, convite, recuperação de senha. */
  | { kind: 'public' }
  /** Basta estar autenticado e ser membro ativo de um tenant operacional. */
  | { kind: 'member' }
  /** Exige uma permissão, e que o módulo dela esteja habilitado. */
  | { kind: 'permission'; permission: PermissionCode }
  /** Área da plataforma. Nenhum papel de tenant alcança. */
  | { kind: 'superAdmin' };

/** Quem está pedindo. Montado a partir da sessão, uma vez por requisição. */
export interface Viewer {
  userId: string | null;
  isSuperAdmin: boolean;
  tenant: { id: string; status: TenantStatus } | null;
  membershipStatus: MembershipStatus | null;
  permissions: ReadonlySet<PermissionCode>;
  enabledModules: ReadonlySet<ModuleCode>;
}

export type DenialReason =
  | 'unauthenticated'
  | 'no-tenant'
  | 'membership-inactive'
  | 'tenant-not-operational'
  | 'module-disabled'
  | 'missing-permission';

export type AccessDecision = { allowed: true } | { allowed: false; reason: DenialReason };

const ALLOWED: AccessDecision = { allowed: true };
const deny = (reason: DenialReason): AccessDecision => ({ allowed: false, reason });

/** Visitante sem sessão. */
export const ANONYMOUS: Viewer = {
  userId: null,
  isSuperAdmin: false,
  tenant: null,
  membershipStatus: null,
  permissions: new Set(),
  enabledModules: new Set(),
};

export function isAuthenticated(viewer: Viewer): boolean {
  return viewer.userId !== null;
}

/** O módulo a que uma permissão pertence, lido do próprio código. */
function moduleOfPermission(permission: PermissionCode): ModuleCode {
  return permission.split('.')[0] as ModuleCode;
}

export function decideAccess(rule: RouteRule, viewer: Viewer): AccessDecision {
  if (rule.kind === 'public') return ALLOWED;

  if (!isAuthenticated(viewer)) return deny('unauthenticated');

  if (rule.kind === 'superAdmin') {
    return viewer.isSuperAdmin ? ALLOWED : deny('missing-permission');
  }

  /*
   * Super Admin não pertence a tenant nenhum, então as checagens de
   * pertencimento abaixo não se aplicam a ele — do mesmo jeito que no RLS.
   */
  if (viewer.isSuperAdmin) return ALLOWED;

  if (viewer.tenant === null) return deny('no-tenant');

  /* Convite pendente não acessa dado: é o que user_tenant_ids() garante. */
  if (viewer.membershipStatus === null || !grantsAccess(viewer.membershipStatus)) {
    return deny('membership-inactive');
  }

  /* Tenant em provisionamento, suspenso ou cancelado não opera. */
  if (!isOperational(viewer.tenant.status)) return deny('tenant-not-operational');

  if (rule.kind === 'member') return ALLOWED;

  /*
   * Ter a permissão não basta: o módulo precisa estar habilitado para o tenant.
   * tenant_modules é a verdade sobre acesso a módulo, não o plano.
   */
  if (!viewer.enabledModules.has(moduleOfPermission(rule.permission))) {
    return deny('module-disabled');
  }

  return viewer.permissions.has(rule.permission) ? ALLOWED : deny('missing-permission');
}

/** Atalho para esconder da interface o que seria negado. */
export function can(viewer: Viewer, permission: PermissionCode): boolean {
  return decideAccess({ kind: 'permission', permission }, viewer).allowed;
}

/**
 * Para onde mandar quem foi negado. `null` significa "não redirecione" —
 * mostre a página de acesso negado, com o motivo.
 *
 * Redirecionar quem simplesmente não tem permissão seria pior: a pessoa fica
 * em um laço sem entender o que aconteceu.
 */
export function redirectFor(reason: DenialReason): string | null {
  switch (reason) {
    case 'unauthenticated':
      return '/entrar';
    case 'no-tenant':
      return '/onboarding';
    case 'membership-inactive':
      return '/convite';
    case 'tenant-not-operational':
      return '/preparando';
    case 'module-disabled':
    case 'missing-permission':
      return null;
  }
}
