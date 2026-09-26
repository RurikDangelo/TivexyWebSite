/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRuleForm } from './rule-input.ts';

function form(regra: unknown): FormData {
  const f = new FormData();
  f.set('regra', typeof regra === 'string' ? regra : JSON.stringify(regra));
  return f;
}

const vendaGrande = {
  nome: '  Venda grande ',
  gatilho: 'erp.sale.registered',
  condicoes: [{ campo: 'total', operador: 'gte', valor: '1.000,50' }],
  acao: 'core.notify',
  params: { destino: 'permissao', permissao: 'finance.receivables.read', titulo: 'Nº {{numero}}' },
};

describe('parseRuleForm', () => {
  it('valor em reais digitado vira centavos, pela regra de parseCents', () => {
    const r = parseRuleForm(form(vendaGrande));
    assert.ok(r.ok);
    assert.equal(r.regra.nome, 'Venda grande');
    assert.deepEqual(r.regra.condicoes, [{ campo: 'total', operador: 'gte', valor: 100050 }]);
  });

  it('"5.50" do teclado do celular é cinco e cinquenta, não quinhentos e cinquenta', () => {
    const r = parseRuleForm(
      form({ ...vendaGrande, condicoes: [{ campo: 'total', operador: 'gte', valor: '5.50' }] }),
    );
    assert.ok(r.ok);
    assert.equal(r.regra.condicoes[0]?.valor, 550);
  });

  it('valor que não é dinheiro é recusado no campo da condição, não vira zero', () => {
    const r = parseRuleForm(
      form({ ...vendaGrande, condicoes: [{ campo: 'total', operador: 'gte', valor: 'mil' }] }),
    );
    assert.ok(!r.ok);
    assert.equal(r.problemas['condicoes.0'], 'Informe um valor em reais.');
  });

  it('prazo vazio ou fracionado não vira "no mesmo dia"', () => {
    const base = {
      nome: 'Primeiro contato',
      gatilho: 'crm.lead.created',
      condicoes: [],
      acao: 'crm.activity.create',
      params: { titulo: 'Ligar', responsavel: 'responsavel' },
    };
    for (const dias of ['', '1,5', 'amanhã']) {
      const r = parseRuleForm(form({ ...base, params: { ...base.params, dias } }));
      assert.ok(!r.ok, `"${dias}" passou`);
      assert.ok(r.problemas.dias);
    }
    const certo = parseRuleForm(form({ ...base, params: { ...base.params, dias: '2' } }));
    assert.ok(certo.ok);
    assert.equal(certo.regra.params.dias, 2);
  });

  it('JSON torto não derruba a ação', () => {
    const r = parseRuleForm(form('{"nome":'));
    assert.ok(!r.ok);
    assert.ok(r.problemas.regra);
  });

  it('o que o Core recusa chega com a chave do campo', () => {
    const r = parseRuleForm(form({ ...vendaGrande, nome: ' ', acao: 'crm.activity.create' }));
    assert.ok(!r.ok);
    assert.ok(r.problemas.nome);
    assert.ok(r.problemas.acao);
  });
});
