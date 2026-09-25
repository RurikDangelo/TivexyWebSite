/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseFinanceEntryInput } from './finance-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const HOJE = '2026-09-25';
const base = {
  direcao: 'payable',
  descricao: 'Aluguel',
  valor: '2.500,00',
  vencimento: '2026-10-05',
};

describe('parseFinanceEntryInput', () => {
  it('descrição, valor e vencimento bastam', () => {
    const r = parseFinanceEntryInput(form(base), HOJE);
    assert.ok(r.ok);
    assert.equal(r.valor.valorCentavos, 250000);
    assert.equal(r.valor.pagoEm, null);
  });

  it('valor zero ou torto é recusado', () => {
    for (const valor of ['0', '', 'dois mil']) {
      const r = parseFinanceEntryInput(form({ ...base, valor }), HOJE);
      assert.ok(!r.ok, valor);
    }
  });

  it('já pago: a data é obrigatória e não pode ser futura', () => {
    const semData = parseFinanceEntryInput(form({ ...base, jaPago: 'on' }), HOJE);
    assert.ok(!semData.ok);

    const futuro = parseFinanceEntryInput(
      form({ ...base, jaPago: 'on', pagoEm: '2026-09-26' }),
      HOJE,
    );
    assert.ok(!futuro.ok);
    assert.match(futuro.campos.pagoEm ?? '', /futura/);

    const hoje = parseFinanceEntryInput(form({ ...base, jaPago: 'on', pagoEm: HOJE }), HOJE);
    assert.ok(hoje.ok);
    assert.equal(hoje.valor.pagoEm, HOJE);
  });

  it('a data de pagamento sem a caixa marcada é ignorada', () => {
    const r = parseFinanceEntryInput(form({ ...base, pagoEm: '2026-09-20' }), HOJE);
    assert.ok(r.ok);
    assert.equal(r.valor.pagoEm, null);
  });

  it('direção fora da lista é recusada', () => {
    const r = parseFinanceEntryInput(form({ ...base, direcao: 'transfer' }), HOJE);
    assert.ok(!r.ok);
  });

  it('vencimento precisa ser data', () => {
    const r = parseFinanceEntryInput(form({ ...base, vencimento: '05/10/2026' }), HOJE);
    assert.ok(!r.ok);
    assert.ok(r.campos.vencimento !== undefined);
  });
});
