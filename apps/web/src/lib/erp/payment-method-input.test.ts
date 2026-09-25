/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TIPOS_DE_FORMA, parsePaymentMethodInput } from './payment-method-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('parsePaymentMethodInput', () => {
  it('nome, tipo e prazo; ativa vem do interruptor', () => {
    const r = parsePaymentMethodInput(
      form({ nome: 'Crédito Stone', codigo: 'credit', prazo: '30', ativa: 'on' }),
    );
    assert.ok(r.ok);
    assert.deepEqual(r.valor, {
      nome: 'Crédito Stone',
      codigo: 'credit',
      prazoEmDias: 30,
      ativa: true,
    });
  });

  it('prazo vazio é na hora; desligada é desligada', () => {
    const r = parsePaymentMethodInput(form({ nome: 'Pix', codigo: 'pix', prazo: '' }));
    assert.ok(r.ok);
    assert.equal(r.valor.prazoEmDias, 0);
    assert.equal(r.valor.ativa, false);
  });

  it('prazo fora de 0 a 365, ou não inteiro, é recusado', () => {
    for (const prazo of ['366', '-1', '1,5', 'trinta']) {
      const r = parsePaymentMethodInput(form({ nome: 'X', codigo: 'other', prazo }));
      assert.ok(!r.ok, prazo);
    }
  });

  it('tipo fora da lista é recusado — e boleto não está na lista', () => {
    const r = parsePaymentMethodInput(form({ nome: 'Boleto', codigo: 'boleto', prazo: '3' }));
    assert.ok(!r.ok);
    assert.ok(!TIPOS_DE_FORMA.some((t) => t.codigo === ('boleto' as string)));
  });

  it('todo tipo cabe na constraint do banco: minúsculas e sublinhado', () => {
    for (const t of TIPOS_DE_FORMA) assert.match(t.codigo, /^[a-z][a-z0-9_]*$/);
  });
});
