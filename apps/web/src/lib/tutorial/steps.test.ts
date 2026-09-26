/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type ModuleCode,
  PERMISSION_CODES,
  type PermissionCode,
  type Viewer,
  matchRule,
} from '@tivexy/core';

import { routeRules } from '../../config/routes.ts';
import { SEM_TERMOS } from '../terms/vocabulary.ts';
import { type Contagem, estadoDoPasso, passosDoTutorial, progresso } from './steps.ts';

function viewer(permissoes: readonly PermissionCode[], modulos: readonly ModuleCode[]): Viewer {
  return {
    userId: 'u1',
    isSuperAdmin: false,
    tenant: { id: 't1', status: 'active' },
    membershipStatus: 'active',
    permissions: new Set(permissoes),
    enabledModules: new Set(modulos),
  };
}

const passos = passosDoTutorial(SEM_TERMOS);
const passo = (codigo: string) => {
  const p = passos.find((x) => x.codigo === codigo);
  if (p === undefined) throw new Error(codigo);
  return p;
};

describe('o estado de cada passo', () => {
  const tudo = viewer(PERMISSION_CODES, [
    'core',
    'crm',
    'erp',
    'inventory',
    'finance',
    'automation',
  ]);

  it('feito é contado — zero é a fazer, um é feito', () => {
    const zero = new Map<Contagem, number>([['erp-products', 0]]);
    const um = new Map<Contagem, number>([['erp-products', 1]]);
    assert.equal(estadoDoPasso(passo('produto'), tudo, zero), 'a-fazer');
    assert.equal(estadoDoPasso(passo('produto'), tudo, um), 'feito');
  });

  it('equipe precisa de alguém além de quem entrou', () => {
    assert.equal(estadoDoPasso(passo('equipe'), tudo, new Map([['equipe', 1]])), 'a-fazer');
    assert.equal(estadoDoPasso(passo('equipe'), tudo, new Map([['equipe', 2]])), 'feito');
  });

  it('módulo não contratado aparece como tal, e não como pendência', () => {
    const cafe = viewer(PERMISSION_CODES, ['core', 'erp', 'inventory', 'finance']);
    assert.equal(estadoDoPasso(passo('lead'), cafe, new Map([['crm-leads', 0]])), 'sem-modulo');
  });

  it('quem lê e não alcança a tela: é de outra pessoa', () => {
    const consulta = viewer(['erp.sales.read'], ['core', 'erp']);
    assert.equal(
      estadoDoPasso(passo('venda'), consulta, new Map([['erp-sales', 0]])),
      'com-outra-pessoa',
    );
    assert.equal(estadoDoPasso(passo('venda'), consulta, new Map([['erp-sales', 3]])), 'feito');
  });

  it('quem não lê não sabe — nem feito, nem a fazer', () => {
    const caixa = viewer(['erp.sales.read', 'erp.sales.write'], ['core', 'erp', 'finance']);
    assert.equal(
      estadoDoPasso(passo('financeiro'), caixa, new Map([['finance-entries', 5]])),
      'sem-acesso',
    );
  });

  it('contagem que falhou não vira zero', () => {
    assert.equal(
      estadoDoPasso(passo('venda'), tudo, new Map([['erp-sales', null]])),
      'desconhecido',
    );
    assert.equal(estadoDoPasso(passo('venda'), tudo, new Map()), 'desconhecido');
  });

  it('sem empresa escolhida, não há o que contar', () => {
    const semEmpresa = { ...tudo, tenant: null, membershipStatus: null };
    assert.equal(estadoDoPasso(passo('venda'), semEmpresa, new Map()), 'sem-empresa');
  });
});

describe('progresso', () => {
  it('conta o que dá para fazer; módulo que não há fica fora', () => {
    assert.deepEqual(
      progresso(['feito', 'a-fazer', 'com-outra-pessoa', 'sem-modulo', 'sem-acesso', 'feito']),
      { feitos: 2, total: 4 },
    );
  });
});

describe('os passos', () => {
  it('cada passo aponta para uma rota declarada — nenhuma cai na regra padrão', () => {
    for (const p of passos) {
      const declarada = routeRules.some((r) => p.href.startsWith(r.prefix));
      assert.ok(declarada, `${p.codigo}: ${p.href} sem regra`);
      assert.notEqual(matchRule(routeRules, p.href).kind, 'public', p.codigo);
    }
  });

  it('falam o vocabulário do nicho, sem artigo', () => {
    const clinica = passosDoTutorial({
      'erp.sales': { singular: 'atendimento', plural: 'atendimentos' },
    });
    assert.equal(clinica.find((p) => p.codigo === 'venda')?.titulo, 'Registrar atendimento');
  });
});
