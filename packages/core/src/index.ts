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
  TERM_KEYS,
  moduleOf,
  moduleOfTerm,
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

export { RESERVED_SUBDOMAINS, isReservedSubdomain, tenantSlugFromHost } from './tenant-host.ts';

export {
  CRM_LEAD_STATUSES,
  CRM_STAGE_KINDS,
  boardTotals,
  formatCents,
  formatCentsInput,
  isClosedStage,
  isLeadClosed,
  missingExits,
  nextLeadStatuses,
  orderStages,
  parseCents,
  stageTotals,
  totalsByKind,
  type BoardDeal,
  type BoardStage,
  type CrmLeadStatus,
  type CrmStageKind,
  type Totals,
} from './crm.ts';

export {
  addDays,
  dateIn,
  daysBetween,
  instantFromLocal,
  isIsoDate,
  isTime,
  startOfMonth,
  timeIn,
  todayIn,
} from './calendar.ts';

export {
  ERP_SALE_STATUSES,
  FINANCE_DIRECTIONS,
  INVENTORY_MOVEMENT_KINDS,
  PRODUCT_UNITS,
  QUANTITY_DECIMALS,
  STOCK_STATUS_ORDER,
  UNIT_INFO,
  checkQuantity,
  financeStatus,
  formatQuantity,
  formatQuantityInput,
  grossMargin,
  isProductUnit,
  lineTotalCents,
  movementSign,
  parseQuantity,
  saleTotals,
  stockStatus,
  stockSummary,
  type ErpSaleStatus,
  type FinanceDirection,
  type FinanceStatus,
  type InventoryMovementKind,
  type ProductUnit,
  type StockStatus,
  type StockSummary,
} from './erp.ts';

export { AGENDA_BUCKETS, agendaBucket, groupByBucket, type AgendaBucket } from './agenda.ts';

export {
  DOCUMENT_PATTERN,
  checkDocument,
  formatDocument,
  isValidCnpj,
  isValidCpf,
  normalizeDocument,
  type DocumentCheck,
  type DocumentKind,
} from './documents.ts';

export {
  TENANT_SETTINGS,
  checkSettingValue,
  overridesFrom,
  resolveSettings,
  settingDefinition,
  type SettingDefinition,
  type SettingType,
} from './settings.ts';

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
  planProvisioning,
  previewOf,
  stepOf,
  stepPosition,
  type ProvisioningInput,
  type ProvisioningOperation,
  type ProvisioningPlan,
  type ProvisioningPreview,
} from './provisioning-plan.ts';

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

export { normalizeDecimal } from './decimal.ts';
