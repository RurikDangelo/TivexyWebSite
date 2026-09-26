/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseMovementInput } from './movement-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const produto = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('parseMovementInput', () => {
  it('entrada: positiva, com custo opcional', () => {
    const r = parseMovementInput(
      form({ produto, tipo: 'in', quantidade: '12', custo: '3,50' }),
      'un',
    );
    assert.ok(r.ok);
    assert.equal(r.valor.quantidade, 12);
    assert.equal(r.valor.custoCentavos, 350);
    assert.equal(r.valor.contada, null);
  });

  it('saída: negativa, e exige motivo', () => {
    const sem = parseMovementInput(form({ produto, tipo: 'out', quantidade: '2' }), 'un');
    assert.ok(!sem.ok);
    assert.match(sem.campos.motivo ?? '', /motivo/);

    const com = parseMovementInput(
      form({ produto, tipo: 'out', quantidade: '2', motivo: 'quebrou' }),
      'un',
    );
    assert.ok(com.ok);
    assert.equal(com.valor.quantidade, -2);
  });

  it('saída não guarda custo, mesmo que o campo venha', () => {
    const r = parseMovementInput(
      form({ produto, tipo: 'out', quantidade: '1', custo: '9,99', motivo: 'validade' }),
      'un',
    );
    assert.ok(r.ok);
    assert.equal(r.valor.custoCentavos, null);
  });

  it('contagem: guarda o contado, e zero vale', () => {
    const cinco = parseMovementInput(form({ produto, tipo: 'adjustment', quantidade: '5' }), 'un');
    assert.ok(cinco.ok);
    assert.equal(cinco.valor.contada, 5);
    assert.equal(cinco.valor.quantidade, 0, 'a diferença quem calcula é o banco');

    const zero = parseMovementInput(form({ produto, tipo: 'adjustment', quantidade: '0' }), 'kg');
    assert.ok(zero.ok);
    assert.equal(zero.valor.contada, 0);
  });

  it('entrada de zero não é movimento', () => {
    const r = parseMovementInput(form({ produto, tipo: 'in', quantidade: '0' }), 'un');
    assert.ok(!r.ok);
  });

  it('a unidade decide a fração', () => {
    const un = parseMovementInput(form({ produto, tipo: 'in', quantidade: '1,5' }), 'un');
    assert.ok(!un.ok);
    assert.match(un.campos.quantidade ?? '', /inteiro/);

    const kg = parseMovementInput(form({ produto, tipo: 'in', quantidade: '1,5' }), 'kg');
    assert.ok(kg.ok);
    assert.equal(kg.valor.quantidade, 1.5);
  });

  it('venda não se registra à mão', () => {
    const r = parseMovementInput(form({ produto, tipo: 'sale', quantidade: '1' }), 'un');
    assert.ok(!r.ok);
    assert.ok(r.campos.tipo !== undefined);
  });

  it('produto com id torto é recusado antes do banco', () => {
    const r = parseMovementInput(form({ produto: 'x', tipo: 'in', quantidade: '1' }), 'un');
    assert.ok(!r.ok);
    assert.ok(r.campos.produto !== undefined);
  });
});
