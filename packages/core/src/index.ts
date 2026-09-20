/**
 * @tivexy/core — contratos compartilhados do Tivexy Core.
 *
 * Só o que é realmente comum entre aplicações: os códigos do catálogo, os
 * estados do domínio e as regras que dependem só deles. Nada de acesso a
 * banco, nada de componente, nada específico de uma aplicação.
 */

export {
  MODULE_CODES,
  SYSTEM_ROLE_CODES,
  PLAN_CODES,
  PERMISSION_CODES,
  moduleOf,
  type ModuleCode,
  type SystemRoleCode,
  type PlanCode,
  type PermissionCode,
} from './catalog.ts';

export {
  TENANT_STATUSES,
  MEMBERSHIP_STATUSES,
  grantsAccess,
  isOperational,
  type TenantStatus,
  type MembershipStatus,
} from './tenancy.ts';

export {
  ANONYMOUS,
  DEFAULT_RULE,
  DENIAL_REASONS,
  can,
  decideAccess,
  isAuthenticated,
  matchRule,
  parseViewer,
  redirectFor,
  type AccessDecision,
  type DenialReason,
  type RouteMatcher,
  type RouteRule,
  type Viewer,
} from './access.ts';

export {
  checkBlueprint,
  enables,
  termFor,
  type Blueprint,
  type BlueprintCheck,
  type BlueprintProblem,
  type BlueprintRole,
  type SeedRecord,
  type Term,
} from './blueprint.ts';

export {
  PROVISIONING_STATUSES,
  PROVISIONING_STEP_STATUSES,
  PROVISIONING_STEPS,
  isTerminal,
  isActive,
  progressOf,
  type ProvisioningStatus,
  type ProvisioningStepStatus,
  type ProvisioningStep,
} from './provisioning.ts';
