import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_CODES,
  OPERADORES_POR_TIPO,
  actionAllowedFor,
  automationMatches,
  checkAutomationRule,
  renderAutomationTemplate,
} from './automation.ts';

describe('automationMatches', () => {
  const venda = { numero: 12, total: 15000, cliente: 'Rita Moraes' };

  it('todas as condições precisam valer', () => {
    assert.equal(
      automationMatches(
        [
          { campo: 'total', operador: 'gte', valor: 10000 },
          { campo: 'cliente', operador: 'contains', valor: 'rita' },
        ],
        venda,
      ),
      true,
    );
    assert.equal(
      automationMatches(
        [
          { campo: 'total', operador: 'gte', valor: 10000 },
          { campo: 'cliente', operador: 'eq', valor: 'Outra' },
        ],
        venda,
      ),
      false,
    );
  });

  it('sem condição, sempre vale', () => {
    assert.equal(automationMatches([], venda), true);
  });

  it('campo ausente ou nulo não satisfaz nada — nem "não é"', () => {
    assert.equal(
      automationMatches([{ campo: 'cliente', operador: 'neq', valor: 'x' }], { cliente: null }),
      false,
    );
    assert.equal(automationMatches([{ campo: 'origem', operador: 'neq', valor: 'x' }], {}), false);
  });

  it('número compara número; texto em comparação numérica não vale', () => {
    assert.equal(
      automationMatches([{ campo: 'total', operador: 'lte', valor: 15000 }], venda),
      true,
    );
    assert.equal(
      automationMatches([{ campo: 'cliente', operador: 'gte', valor: 1 }], venda),
      false,
    );
  });
});

describe('renderAutomationTemplate', () => {
  it('dinheiro formatado, número com vírgula, ausente vazio', () => {
    assert.equal(
      renderAutomationTemplate('Venda nº {{numero}}: {{total}} — {{cliente}}', {
        numero: 12,
        total: 123456,
        cliente: null,
      }),
      'Venda nº 12: R$ 1.234,56 — ',
    );
    assert.equal(
      renderAutomationTemplate('{{produto}}: {{saldo}} {{unidade}}', {
        produto: 'Grão',
        saldo: 4.5,
        unidade: 'kg',
      }),
      'Grão: 4,5 kg',
    );
  });

  it('variável que o evento não tem some', () => {
    assert.equal(renderAutomationTemplate('Olá {{ninguem}}!', {}), 'Olá !');
  });
});

describe('checkAutomationRule', () => {
  const base = {
    nome: 'Venda grande',
    gatilho: 'erp.sale.registered',
    condicoes: [{ campo: 'total', operador: 'gte', valor: 10000 }],
    acao: 'core.notify',
    params: {
      destino: 'permissao',
      permissao: 'finance.cashflow.read',
      titulo: 'Venda {{numero}}',
    },
  };

  it('aceita a regra bem montada', () => {
    const r = checkAutomationRule(base);
    assert.ok(r.ok);
    assert.equal(r.regra.params.permissao, 'finance.cashflow.read');
  });

  it('recusa campo que o gatilho não tem e operador que o campo não aceita', () => {
    const campo = checkAutomationRule({
      ...base,
      condicoes: [{ campo: 'origem', operador: 'eq', valor: 'x' }],
    });
    assert.ok(!campo.ok);
    const operador = checkAutomationRule({
      ...base,
      condicoes: [{ campo: 'total', operador: 'contains', valor: 10 }],
    });
    assert.ok(!operador.ok);
  });

  it('aviso ao responsável só em evento que tem responsável', () => {
    const r = checkAutomationRule({
      ...base,
      gatilho: 'inventory.stock.low',
      condicoes: [],
      params: { destino: 'responsavel', titulo: 'x' },
    });
    assert.ok(!r.ok);
    assert.match(r.problemas.destino ?? '', /responsável/);
  });

  it('atividade no CRM só de evento do CRM, com prazo válido', () => {
    const errado = checkAutomationRule({
      ...base,
      acao: 'crm.activity.create',
      params: { titulo: 'x', dias: 1, responsavel: 'responsavel' },
    });
    assert.ok(!errado.ok);

    const certo = checkAutomationRule({
      ...base,
      gatilho: 'crm.deal.stage_changed',
      condicoes: [{ campo: 'situacao', operador: 'eq', valor: 'won' }],
      acao: 'crm.activity.create',
      params: { titulo: 'Agradecer', dias: 2, responsavel: 'responsavel' },
    });
    assert.ok(certo.ok);

    const prazo = checkAutomationRule({
      ...base,
      gatilho: 'crm.lead.created',
      condicoes: [],
      acao: 'crm.activity.create',
      params: { titulo: 'x', dias: 400, responsavel: 'responsavel' },
    });
    assert.ok(!prazo.ok);
  });

  it('permissão fora do catálogo não recebe aviso', () => {
    const r = checkAutomationRule({ ...base, params: { ...base.params, permissao: 'erp.tudo' } });
    assert.ok(!r.ok);
  });
});

describe('o catálogo se sustenta', () => {
  it('todo campo tem operador, e toda opção tem rótulo', () => {
    for (const codigo of AUTOMATION_TRIGGER_CODES) {
      for (const campo of AUTOMATION_TRIGGERS[codigo].campos) {
        assert.ok(OPERADORES_POR_TIPO[campo.tipo].length > 0, `${codigo}.${campo.campo}`);
      }
    }
  });

  it('criar atividade é permitido exatamente nos gatilhos do CRM', () => {
    assert.deepEqual(
      AUTOMATION_TRIGGER_CODES.filter((g) => actionAllowedFor('crm.activity.create', g)).sort(),
      ['crm.deal.stage_changed', 'crm.lead.created'],
    );
  });
});
