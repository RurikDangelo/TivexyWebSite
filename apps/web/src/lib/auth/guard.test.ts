/**
 * Testes da guarda de rota.
 *
 * Exercitam a configuração real (`routeRules`), não uma lista de mentirinha:
 * uma rota declarada errada precisa aparecer aqui, não em produção.
 *
 * O teste que mais importa neste arquivo não é nenhum dos casos individuais —
 * é o invariante de "nenhum destino de redirecionamento redireciona de novo".
 * Laço de redirecionamento é o defeito clássico desta camada, e ele nasce de
 * uma edição inocente em `routes.ts`, não de um erro na guarda.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANONYMOUS,
  type DenialReason,
  type MembershipStatus,
  type ModuleCode,
  type PermissionCode,
  type TenantStatus,
  type Viewer,
  redirectFor,
} from '@tivexy/core';
import { routeRules } from '../../config/routes.ts';
import { RETURN_PARAM, guard, parseReturnTo } from './guard.ts';

/* ── Personagens ──────────────────────────────────────────────────────── */

function viewer(over: Partial<Viewer> = {}): Viewer {
  return {
    userId: 'u-1',
    isSuperAdmin: false,
    tenant: { id: 't-1', status: 'active' as TenantStatus },
    membershipStatus: 'active' as MembershipStatus,
    permissions: new Set<PermissionCode>(),
    enabledModules: new Set<ModuleCode>(),
    ...over,
  };
}

const visitante = ANONYMOUS;
const superAdmin = viewer({ isSuperAdmin: true, tenant: null, membershipStatus: null });
const semTenant = viewer({ tenant: null, membershipStatus: null });
const convidado = viewer({ membershipStatus: 'invited' as MembershipStatus });
const tenantPreparando = viewer({ tenant: { id: 't-1', status: 'provisioning' as TenantStatus } });
const tenantSuspenso = viewer({ tenant: { id: 't-1', status: 'suspended' as TenantStatus } });

const comCrm = viewer({
  permissions: new Set<PermissionCode>(['crm.leads.read']),
  enabledModules: new Set<ModuleCode>(['crm']),
});

const decidir = (caminho: string, quem: Viewer) => guard(caminho, quem, routeRules);

/* ── Casos ────────────────────────────────────────────────────────────── */

describe('rota aberta', () => {
  it('visitante entra no login', () => {
    assert.deepEqual(decidir('/entrar', visitante), { kind: 'allow' });
  });

  it('visitante entra na recuperação de senha', () => {
    assert.deepEqual(decidir('/recuperar', visitante), { kind: 'allow' });
  });
});

describe('sem sessão', () => {
  it('é mandado para o login, e o destino original vai junto', () => {
    const r = decidir('/painel', visitante);
    assert.equal(r.kind, 'redirect');
    assert.equal(r.kind === 'redirect' && r.location, `/entrar?${RETURN_PARAM}=%2Fpainel`);
  });

  it('o retorno preserva o caminho inteiro, não só o primeiro segmento', () => {
    const r = decidir('/crm/leads', visitante);
    assert.equal(r.kind === 'redirect' && r.location, `/entrar?${RETURN_PARAM}=%2Fcrm%2Fleads`);
  });

  it('rota não declarada também exige sessão — o padrão é fechado', () => {
    const r = decidir('/rota-que-ninguem-declarou', visitante);
    assert.equal(r.kind, 'redirect');
  });
});

describe('dentro do app', () => {
  it('membro ativo entra no painel', () => {
    assert.deepEqual(decidir('/painel', viewer()), { kind: 'allow' });
  });

  it('quem não tem tenant vai para o onboarding', () => {
    assert.deepEqual(decidir('/painel', semTenant), { kind: 'redirect', location: '/onboarding' });
  });

  it('convite pendente vai para o convite, não para o painel', () => {
    assert.deepEqual(decidir('/painel', convidado), { kind: 'redirect', location: '/convite' });
  });

  it('tenant ainda em provisionamento vai para "preparando"', () => {
    assert.deepEqual(decidir('/painel', tenantPreparando), {
      kind: 'redirect',
      location: '/preparando',
    });
  });

  it('tenant suspenso não opera', () => {
    assert.deepEqual(decidir('/painel', tenantSuspenso), {
      kind: 'redirect',
      location: '/preparando',
    });
  });

  it('o destino do redirecionamento não carrega retorno — só o login carrega', () => {
    const r = decidir('/painel', convidado);
    assert.equal(r.kind === 'redirect' && r.location.includes('?'), false);
  });
});

describe('permissão', () => {
  it('quem tem a permissão e o módulo entra', () => {
    assert.deepEqual(decidir('/crm/leads', comCrm), { kind: 'allow' });
  });

  it('com o módulo mas sem a permissão, nega e não redireciona', () => {
    // Redirecionar quem só não tem permissão joga a pessoa num laço sem
    // explicação. A página de acesso negado diz o motivo.
    const semPermissao = viewer({ enabledModules: new Set<ModuleCode>(['crm']) });
    assert.deepEqual(decidir('/crm/leads', semPermissao), {
      kind: 'deny',
      reason: 'missing-permission',
    });
  });

  it('a ordem da negação é contrato: módulo antes de permissão', () => {
    // Quem não tem nenhum dos dois ouve "módulo desabilitado" — é a resposta
    // acionável: contratar o módulo, não pedir permissão que não adiantaria.
    assert.deepEqual(decidir('/crm/leads', viewer()), { kind: 'deny', reason: 'module-disabled' });
  });

  it('com a permissão mas sem o módulo habilitado, nega pelo módulo', () => {
    const semModulo = viewer({ permissions: new Set<PermissionCode>(['crm.leads.read']) });
    assert.deepEqual(decidir('/crm/leads', semModulo), { kind: 'deny', reason: 'module-disabled' });
  });
});

describe('área da plataforma', () => {
  it('super admin entra', () => {
    assert.deepEqual(decidir('/admin', superAdmin), { kind: 'allow' });
  });

  it('administrador de tenant não entra, por mais permissões que tenha', () => {
    const donoDoTenant = viewer({
      permissions: new Set<PermissionCode>(['core.tenant.write', 'core.users.read']),
      enabledModules: new Set<ModuleCode>(['core']),
    });
    assert.deepEqual(decidir('/admin', donoDoTenant), {
      kind: 'deny',
      reason: 'missing-permission',
    });
  });

  it('caixa diferente não rebaixa a regra', () => {
    // `/ADMIN` não pode cair no padrão `member`, que é mais fraco.
    assert.deepEqual(decidir('/ADMIN', viewer()), { kind: 'deny', reason: 'missing-permission' });
  });
});

/* ── O invariante ─────────────────────────────────────────────────────── */

describe('nenhum redirecionamento leva a outro redirecionamento', () => {
  /** Quem causa cada motivo de negação, para o destino ser avaliado com ele. */
  const causadores: Record<DenialReason, Viewer | null> = {
    unauthenticated: visitante,
    'no-tenant': semTenant,
    'membership-inactive': convidado,
    'tenant-not-operational': tenantPreparando,
    'module-disabled': null, // sem destino
    'missing-permission': null, // sem destino
  };

  for (const [motivo, quem] of Object.entries(causadores) as [DenialReason, Viewer | null][]) {
    const destino = redirectFor(motivo);
    if (destino === null || quem === null) continue;

    it(`quem é negado por "${motivo}" consegue abrir ${destino}`, () => {
      const r = guard(destino, quem, routeRules);
      assert.deepEqual(
        r,
        { kind: 'allow' },
        `${destino} nega quem foi mandado para lá: isso é um laço de redirecionamento`,
      );
    });
  }

  it('estar no destino e ainda ser negado vira erro legível, não laço', () => {
    // Cenário forçado: alguém apertaria `/convite` para exigir vínculo ativo.
    // A guarda precisa parar em vez de mandar para lá de novo.
    const regras = [{ prefix: '/convite', rule: { kind: 'member' as const } }];
    const r = guard('/convite', convidado, regras);
    assert.deepEqual(r, { kind: 'deny', reason: 'membership-inactive' });
  });
});

/* ── Redirecionamento aberto ──────────────────────────────────────────── */

describe('destino de retorno', () => {
  it('aceita caminho do próprio app', () => {
    assert.equal(parseReturnTo('/painel'), '/painel');
    assert.equal(parseReturnTo('/crm/leads?q=1'), '/crm/leads?q=1');
  });

  for (const hostil of [
    'https://golpe.example',
    'http://golpe.example',
    '//golpe.example',
    '/\\golpe.example',
    'javascript:alert(1)',
    'painel',
    '../painel',
    '/painel\nSet-Cookie: a=b',
    '/painel\r\n',
    '/ painel',
    '',
    null,
    undefined,
  ]) {
    it(`recusa ${JSON.stringify(hostil)}`, () => {
      assert.equal(
        parseReturnTo(hostil),
        null,
        'destino de retorno não validado é redirecionamento aberto',
      );
    });
  }

  it('o retorno é codificado, não concatenado cru', () => {
    // Sem codificar, um `&` no caminho viraria outro parâmetro.
    const r = decidir('/crm/leads', visitante);
    assert.equal(r.kind === 'redirect' && r.location.includes('%2F'), true);
  });
});
