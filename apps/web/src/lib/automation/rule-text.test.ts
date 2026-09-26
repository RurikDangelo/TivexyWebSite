/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTOMATION_TRIGGER_CODES, type ModuleCode, checkAutomationRule } from '@tivexy/core';

import { SEM_TERMOS } from '../terms/vocabulary.ts';
import {
  EXEMPLO_DO_EVENTO,
  descreverAcao,
  descreverCondicao,
  linkDoEvento,
  modelosDeAutomacao,
  nomeDoGatilho,
  permissoesDeDestino,
  resumoDoEvento,
} from './rule-text.ts';

const clinica = {
  'erp.sales': { singular: 'atendimento', plural: 'atendimentos' },
  'crm.deals': { singular: 'tratamento', plural: 'tratamentos' },
  'crm.activities': { singular: 'retorno', plural: 'retornos' },
};

/** O `Intl` separa "R$" do número com espaço que não quebra; o teste lê como espaço. */
const semNbsp = (texto: string) => texto.replace(/\u00a0/g, ' ');

const TODOS: ReadonlySet<ModuleCode> = new Set(['core', 'crm', 'erp', 'inventory', 'finance']);

describe('a regra em português', () => {
  it('o gatilho fala a língua do nicho, sem artigo', () => {
    assert.equal(nomeDoGatilho('erp.sale.registered', SEM_TERMOS), 'Vendas — registro novo');
    assert.equal(nomeDoGatilho('erp.sale.registered', clinica), 'Atendimentos — registro novo');
    assert.equal(
      nomeDoGatilho('inventory.stock.low', SEM_TERMOS),
      'Itens de estoque — saldo chegou no mínimo',
    );
  });

  it('a condição diz o valor como se escreve', () => {
    assert.equal(
      semNbsp(
        descreverCondicao('erp.sale.registered', {
          campo: 'total',
          operador: 'gte',
          valor: 100000,
        }),
      ),
      'total é pelo menos R$ 1.000,00',
    );
    assert.equal(
      descreverCondicao('crm.deal.stage_changed', {
        campo: 'situacao',
        operador: 'eq',
        valor: 'won',
      }),
      'situação da etapa é ganho',
    );
    assert.equal(
      descreverCondicao('crm.lead.created', {
        campo: 'origem',
        operador: 'contains',
        valor: 'site',
      }),
      'origem contém "site"',
    );
  });

  it('a ação diz para quem vai', () => {
    const contexto = { terms: clinica, pessoas: [{ userId: 'u1', nome: 'Ana' }] };
    assert.equal(
      descreverAcao('core.notify', { destino: 'permissao', permissao: 'erp.sales.read' }, contexto),
      'avisar quem vê atendimentos',
    );
    assert.equal(
      descreverAcao('core.notify', { destino: 'usuario', usuario: 'u1' }, contexto),
      'avisar Ana',
    );
    assert.equal(
      descreverAcao('core.notify', { destino: 'usuario', usuario: 'u2' }, contexto),
      'avisar alguém que saiu da empresa',
    );
    assert.equal(
      descreverAcao('crm.activity.create', { dias: 2, responsavel: 'responsavel' }, contexto),
      'criar retorno para a pessoa responsável, com prazo em 2 dias',
    );
    assert.equal(
      descreverAcao('crm.activity.create', { dias: 0, responsavel: 'u1' }, contexto),
      'criar retorno para Ana, para o mesmo dia',
    );
  });

  it('destinatário por permissão: só "ver", e só dos módulos da empresa', () => {
    const soCrm = permissoesDeDestino(new Set<ModuleCode>(['core', 'crm']), SEM_TERMOS);
    assert.ok(soCrm.every((p) => p.codigo.endsWith('.read')));
    assert.ok(soCrm.some((p) => p.codigo === 'crm.deals.read'));
    assert.ok(!soCrm.some((p) => p.codigo.startsWith('erp.')));
    assert.ok(!soCrm.some((p) => p.codigo === 'core.audit.read'));
    assert.equal(soCrm.find((p) => p.codigo === 'crm.deals.read')?.rotulo, 'Quem vê oportunidades');
  });
});

describe('o evento de uma execução', () => {
  it('resume o que ficou gravado, e leva à página quando existe', () => {
    const venda = {
      id: '6f1c2c7e-1d5b-4c8e-9f63-3d1a2b4c5d6e',
      numero: 12,
      total: 15000,
      cliente: null,
    };
    assert.equal(semNbsp(resumoDoEvento('erp.sale.registered', venda)), 'nº 12 · R$ 150,00');
    assert.equal(linkDoEvento('erp.sale.registered', venda), `/erp/vendas/${venda.id}`);
    assert.equal(
      resumoDoEvento('inventory.stock.low', { produto: 'Café', saldo: 2.5, unidade: 'kg' }),
      'Café · saldo 2,5 kg',
    );
    assert.equal(linkDoEvento('crm.lead.created', { id: venda.id }), null);
    assert.equal(linkDoEvento('erp.sale.registered', { id: '../admin' }), null);
  });
});

describe('os modelos', () => {
  it('todo modelo passa pela conferência do Core', () => {
    for (const modelo of modelosDeAutomacao(TODOS, true, clinica)) {
      const r = checkAutomationRule(modelo.regra);
      assert.ok(r.ok, `${modelo.chave}: ${JSON.stringify(r.ok ? null : r.problemas)}`);
    }
  });

  it('só os dos módulos da empresa, e atividade só para quem pode criar', () => {
    const chaves = (m: ReadonlySet<ModuleCode>, pode: boolean) =>
      modelosDeAutomacao(m, pode, SEM_TERMOS).map((x) => x.chave);
    assert.deepEqual(chaves(new Set(['core', 'erp']), true), ['venda-grande']);
    assert.ok(!chaves(TODOS, false).includes('primeiro-contato'));
  });

  it('todo gatilho tem exemplo para a prévia', () => {
    for (const g of AUTOMATION_TRIGGER_CODES) assert.ok(EXEMPLO_DO_EVENTO[g]);
  });
});
