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
  /** Aberta. Login e recuperação de senha. */
  | { kind: 'public' }
  /**
   * Basta ter sessão. É o que as telas de saída do limbo exigem — aceitar
   * convite, onboarding, "preparando sua conta" —, porque exigir vínculo ativo
   * nelas criaria um laço: o redirecionamento manda para a página, a página
   * nega pelo mesmo motivo, e a pessoa nunca sai do lugar.
   */
  | { kind: 'authenticated' }
  /** Autenticado, membro ativo, e tenant operacional. */
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
  // String vazia não é identidade. Sem esta checagem, um contexto malformado
  // com `userId: ''` passaria por autenticado.
  return viewer.userId !== null && viewer.userId.length > 0;
}

/** O módulo a que uma permissão pertence, lido do próprio código. */
function moduleOfPermission(permission: PermissionCode): ModuleCode {
  return permission.split('.')[0] as ModuleCode;
}

export function decideAccess(rule: RouteRule, viewer: Viewer): AccessDecision {
  if (rule.kind === 'public') return ALLOWED;

  if (!isAuthenticated(viewer)) return deny('unauthenticated');

  if (rule.kind === 'authenticated') return ALLOWED;

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

/* ── Leitura do contexto vindo do banco ───────────────────────────────── */

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Converte o JSON de `public.current_viewer()` num `Viewer`.
 *
 * Tolerante de propósito: qualquer coisa que não seja o formato esperado vira
 * `ANONYMOUS`. Um contexto malformado precisa resultar em **menos** acesso, não
 * em exceção no meio do fluxo — e muito menos em acesso indevido.
 *
 * Códigos de permissão desconhecidos são mantidos, não descartados. Descartar
 * silenciaria uma permissão recém-criada no banco e ainda não declarada aqui:
 * a pessoa simplesmente não conseguiria fazer algo que deveria, sem erro
 * nenhum. Divergência entre os dois lados é pega pelo teste de contratos, que é
 * onde ela deve doer.
 */
export function parseViewer(raw: unknown): Viewer {
  if (raw === null || typeof raw !== 'object') return ANONYMOUS;

  const data = raw as Record<string, unknown>;
  if (typeof data.userId !== 'string' || data.userId.length === 0) return ANONYMOUS;

  const tenantRaw = data.tenant;
  let tenant: Viewer['tenant'] = null;
  if (tenantRaw !== null && typeof tenantRaw === 'object') {
    const t = tenantRaw as Record<string, unknown>;
    if (typeof t.id === 'string' && typeof t.status === 'string') {
      tenant = { id: t.id, status: t.status as TenantStatus };
    }
  }

  return {
    userId: data.userId,
    isSuperAdmin: data.isSuperAdmin === true,
    tenant,
    membershipStatus:
      typeof data.membershipStatus === 'string'
        ? (data.membershipStatus as MembershipStatus)
        : null,
    permissions: new Set(asStringArray(data.permissions) as PermissionCode[]),
    enabledModules: new Set(asStringArray(data.enabledModules) as ModuleCode[]),
  };
}

/* ── Casamento de rota ────────────────────────────────────────────────── */

export interface RouteMatcher {
  /** Prefixo do caminho. Casa o próprio caminho e tudo abaixo dele. */
  prefix: string;
  rule: RouteRule;
}

/**
 * Regra padrão de quem não casa com nada.
 *
 * **Fechado por padrão, e isto não é detalhe.** Uma rota nova que alguém
 * esqueceu de declarar fica protegida; se o padrão fosse `public`, o
 * esquecimento viraria uma rota aberta que ninguém percebe. Errar para o lado
 * de negar produz um chamado; errar para o lado de liberar produz um vazamento.
 */
export const DEFAULT_RULE: RouteRule = { kind: 'member' };

/**
 * A regra do prefixo mais específico vence — `/crm/leads` ganha de `/crm`.
 *
 * O casamento respeita a fronteira de segmento: `/crm` **não** casa com
 * `/crmed`. Sem isso, uma rota nova com nome parecido herdaria por acidente a
 * permissão de outra.
 *
 * E ignora a caixa, de propósito. `/ADMIN` casaria com nada e cairia no padrão
 * `member` — uma regra **mais fraca** que a de `/admin`. Hoje o roteador do
 * Next é sensível a caixa e `/ADMIN` daria 404, mas depender disso é depender
 * de uma propriedade de outra camada. Como todas as rotas deste app são
 * minúsculas, ignorar a caixa só pode tornar o casamento mais restritivo.
 */
export function matchRule(rules: readonly RouteMatcher[], pathname: string): RouteRule {
  const caminho = pathname.toLowerCase();
  let melhor: RouteMatcher | null = null;

  for (const candidato of rules) {
    const prefixo = candidato.prefix.toLowerCase();
    const casa = caminho === prefixo || caminho.startsWith(`${prefixo}/`);
    if (!casa) continue;
    if (melhor === null || candidato.prefix.length > melhor.prefix.length) {
      melhor = candidato;
    }
  }

  return melhor?.rule ?? DEFAULT_RULE;
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
