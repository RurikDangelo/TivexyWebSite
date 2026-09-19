/**
 * Testes da decisão de acesso.
 *
 * Rodam no runner do Node, direto sobre o TypeScript — sem build, sem Postgres.
 * São regras puras, e a ordem em que negam importa: um convidado de um tenant
 * ainda em provisionamento tem dois motivos para ser negado, e a interface
 * precisa mostrar o certo.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ModuleCode, PermissionCode } from './catalog.ts';
import type { MembershipStatus, TenantStatus } from './tenancy.ts';
import {
  ANONYMOUS,
  type RouteRule,
  type Viewer,
  can,
  decideAccess,
  redirectFor,
} from './access.ts';

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return {
    userId: 'u1',
    isSuperAdmin: false,
    tenant: { id: 't1', status: 'active' as TenantStatus },
    membershipStatus: 'active' as MembershipStatus,
    permissions: new Set<PermissionCode>(['crm.leads.read']),
    enabledModules: new Set<ModuleCode>(['core', 'crm']),
    ...overrides,
  };
}

const PUBLIC: RouteRule = { kind: 'public' };
const MEMBER: RouteRule = { kind: 'member' };
const LEADS: RouteRule = { kind: 'permission', permission: 'crm.leads.read' };
const ADMIN: RouteRule = { kind: 'superAdmin' };

function reasonOf(rule: RouteRule, v: Viewer) {
  const decision = decideAccess(rule, v);
  return decision.allowed ? null : decision.reason;
}

describe('rota pública', () => {
  it('abre para quem não está autenticado', () => {
    assert.equal(decideAccess(PUBLIC, ANONYMOUS).allowed, true);
  });
});

describe('autenticação', () => {
  it('nega tudo que não é público para visitante', () => {
    assert.equal(reasonOf(MEMBER, ANONYMOUS), 'unauthenticated');
    assert.equal(reasonOf(LEADS, ANONYMOUS), 'unauthenticated');
    assert.equal(reasonOf(ADMIN, ANONYMOUS), 'unauthenticated');
  });

  it('manda o visitante para o login', () => {
    assert.equal(redirectFor('unauthenticated'), '/entrar');
  });
});

describe('pertencimento ao tenant', () => {
  it('permite membro ativo de tenant operacional', () => {
    assert.equal(decideAccess(MEMBER, viewer()).allowed, true);
  });

  it('nega quem ainda não entrou em tenant nenhum', () => {
    assert.equal(reasonOf(MEMBER, viewer({ tenant: null })), 'no-tenant');
  });

  it('nega convite pendente — espelha user_tenant_ids()', () => {
    assert.equal(reasonOf(MEMBER, viewer({ membershipStatus: 'invited' })), 'membership-inactive');
  });

  it('nega vínculo suspenso', () => {
    assert.equal(
      reasonOf(MEMBER, viewer({ membershipStatus: 'suspended' })),
      'membership-inactive',
    );
  });

  it('nega enquanto o tenant está em provisionamento', () => {
    const v = viewer({ tenant: { id: 't1', status: 'provisioning' } });
    assert.equal(reasonOf(MEMBER, v), 'tenant-not-operational');
    assert.equal(redirectFor('tenant-not-operational'), '/preparando');
  });

  it('nega tenant suspenso e cancelado', () => {
    for (const status of ['suspended', 'cancelled'] as TenantStatus[]) {
      const v = viewer({ tenant: { id: 't1', status } });
      assert.equal(reasonOf(MEMBER, v), 'tenant-not-operational', `status ${status}`);
    }
  });

  it('reclama do vínculo antes do estado do tenant', () => {
    // Um convidado de um tenant em provisionamento tem dois problemas. O que
    // ele precisa resolver primeiro é aceitar o convite.
    const v = viewer({
      membershipStatus: 'invited',
      tenant: { id: 't1', status: 'provisioning' },
    });
    assert.equal(reasonOf(MEMBER, v), 'membership-inactive');
  });
});

describe('permissão', () => {
  it('permite quem tem a permissão e o módulo habilitado', () => {
    assert.equal(decideAccess(LEADS, viewer()).allowed, true);
  });

  it('nega quem não tem a permissão', () => {
    const v = viewer({ permissions: new Set() });
    assert.equal(reasonOf(LEADS, v), 'missing-permission');
  });

  it('nega quando o módulo não está habilitado, mesmo com a permissão', () => {
    // "Ter permissão não basta": tenant_modules é a verdade sobre acesso.
    const v = viewer({ enabledModules: new Set<ModuleCode>(['core']) });
    assert.equal(reasonOf(LEADS, v), 'module-disabled');
  });

  it('reclama do módulo antes da permissão', () => {
    // Sem o módulo contratado, faltar a permissão é irrelevante — e a mensagem
    // "peça a permissão ao administrador" mandaria a pessoa para o lugar errado.
    const v = viewer({ permissions: new Set(), enabledModules: new Set<ModuleCode>(['core']) });
    assert.equal(reasonOf(LEADS, v), 'module-disabled');
  });

  it('não redireciona quem foi negado por permissão ou módulo', () => {
    // Redirecionar deixaria a pessoa em um laço sem entender o motivo.
    assert.equal(redirectFor('missing-permission'), null);
    assert.equal(redirectFor('module-disabled'), null);
  });
});

describe('super admin', () => {
  const superAdmin = viewer({
    isSuperAdmin: true,
    tenant: null,
    membershipStatus: null,
    permissions: new Set(),
    enabledModules: new Set(),
  });

  it('entra na área da plataforma', () => {
    assert.equal(decideAccess(ADMIN, superAdmin).allowed, true);
  });

  it('não é barrado por não pertencer a tenant nenhum', () => {
    assert.equal(decideAccess(MEMBER, superAdmin).allowed, true);
    assert.equal(decideAccess(LEADS, superAdmin).allowed, true);
  });

  it('nenhum papel de tenant alcança a área da plataforma', () => {
    // Nem o administrador do tenant com todas as permissões.
    const admin = viewer({ permissions: new Set(['core.roles.write', 'crm.leads.read']) });
    assert.equal(reasonOf(ADMIN, admin), 'missing-permission');
  });
});

describe('can()', () => {
  it('responde o mesmo que decideAccess para permissão', () => {
    assert.equal(can(viewer(), 'crm.leads.read'), true);
    assert.equal(can(viewer(), 'crm.leads.write'), false);
    assert.equal(can(ANONYMOUS, 'crm.leads.read'), false);
  });
});

describe('redirectFor cobre todos os motivos', () => {
  it('não deixa motivo sem tratamento', () => {
    const reasons = [
      'unauthenticated',
      'no-tenant',
      'membership-inactive',
      'tenant-not-operational',
      'module-disabled',
      'missing-permission',
    ] as const;
    for (const reason of reasons) {
      const target = redirectFor(reason);
      assert.ok(target === null || target.startsWith('/'), `${reason} devolveu ${String(target)}`);
    }
  });
});
