/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAXIMO_DE_ITENS, parseSaleInput } from './sale-input.ts';

const P1 = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const F1 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function form(campos: Record<string, unknown>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    f.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return f;
}

const base = {
  itens: [{ produto: P1, quantidade: '2' }],
  pagamentos: [{ forma: F1, valor: '11,00' }],
};

describe('parseSaleInput', () => {
  it('lê itens e pagamentos do JSON', () => {
    const r = parseSaleInput(form(base));
    assert.ok(r.ok);
    assert.deepEqual(r.valor.itens, [{ produtoId: P1, quantidade: 2 }]);
    assert.deepEqual(r.valor.pagamentos, [{ formaId: F1, centavos: 1100 }]);
    assert.equal(r.valor.descontoCentavos, 0);
    assert.equal(r.valor.clienteId, null);
  });

  it('quantidade com vírgula ou com ponto — o que o teclado do celular mandar', () => {
    const virgula = parseSaleInput(
      form({ ...base, itens: [{ produto: P1, quantidade: '0,335' }] }),
    );
    const ponto = parseSaleInput(form({ ...base, itens: [{ produto: P1, quantidade: '0.335' }] }));
    assert.ok(virgula.ok && ponto.ok);
    assert.equal(virgula.valor.itens[0]?.quantidade, 0.335);
    assert.equal(ponto.valor.itens[0]?.quantidade, 0.335);
  });

  it('venda sem item é recusada', () => {
    const r = parseSaleInput(form({ ...base, itens: [] }));
    assert.ok(!r.ok);
    assert.match(r.campos.itens ?? '', /pelo menos um item/);
  });

  it('quantidade zero, negativa ou torta é recusada', () => {
    for (const quantidade of ['0', '-1', 'dois', '']) {
      const r = parseSaleInput(form({ ...base, itens: [{ produto: P1, quantidade }] }));
      assert.ok(!r.ok, quantidade);
    }
  });

  it('JSON quebrado não derruba a ação: vira mensagem', () => {
    const r = parseSaleInput(form({ ...base, itens: '[{' }));
    assert.ok(!r.ok);
    assert.match(r.campos.itens ?? '', /Recarregue/);
  });

  it('venda gigante é recusada antes do banco', () => {
    const itens = Array.from({ length: MAXIMO_DE_ITENS + 1 }, () => ({
      produto: P1,
      quantidade: '1',
    }));
    const r = parseSaleInput(form({ ...base, itens }));
    assert.ok(!r.ok);
  });

  it('pagamento sem forma ou sem valor é recusado; venda sem pagamento passa daqui', () => {
    const semForma = parseSaleInput(form({ ...base, pagamentos: [{ forma: '', valor: '1' }] }));
    assert.ok(!semForma.ok);
    const zero = parseSaleInput(form({ ...base, pagamentos: [{ forma: F1, valor: '0' }] }));
    assert.ok(!zero.ok);
    // Sem pagamento é venda de valor zero — quem confere é a ação, com o total.
    const nenhum = parseSaleInput(form({ ...base, pagamentos: [] }));
    assert.ok(nenhum.ok);
  });

  it('desconto no formato brasileiro', () => {
    const r = parseSaleInput(form({ ...base, desconto: '1,50' }));
    assert.ok(r.ok);
    assert.equal(r.valor.descontoCentavos, 150);
    const torto = parseSaleInput(form({ ...base, desconto: 'um real' }));
    assert.ok(!torto.ok);
  });
});
