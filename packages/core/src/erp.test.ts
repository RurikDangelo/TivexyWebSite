/**
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  STOCK_STATUS_ORDER,
  stockSummary,
  formatQuantityInput,
  grossMargin,
  stockStatus,
  INVENTORY_MOVEMENT_KINDS,
  PRODUCT_UNITS,
  UNIT_INFO,
  checkQuantity,
  financeStatus,
  formatQuantity,
  lineTotalCents,
  movementSign,
  parseQuantity,
} from './erp.ts';

describe('parseQuantity', () => {
  it('lê o que se digita no Brasil', () => {
    assert.equal(parseQuantity('1,5'), 1.5);
    assert.equal(parseQuantity('0,350'), 0.35);
    assert.equal(parseQuantity('1.000'), 1000);
    assert.equal(parseQuantity('3'), 3);
  });

  it('recusa zero, torto e mais de três casas', () => {
    for (const torto of ['0', '0,000', 'abc', '1,2345', '', '1,2,3']) {
      assert.equal(parseQuantity(torto), null, torto);
    }
  });

  it('negativo só quando pedido — o ajuste de estoque pede', () => {
    assert.equal(parseQuantity('-2'), null);
    assert.equal(parseQuantity('-2', { negativo: true }), -2);
  });
});

describe('checkQuantity', () => {
  it('unidade inteira não aceita fração; peso aceita', () => {
    assert.match(checkQuantity(1.5, 'un') ?? '', /fração/);
    assert.equal(checkQuantity(2, 'un'), null);
    assert.equal(checkQuantity(0.35, 'kg'), null);
  });

  it('toda unidade diz se é fracionada', () => {
    for (const u of PRODUCT_UNITS) assert.equal(typeof UNIT_INFO[u].fracionada, 'boolean', u);
  });
});

describe('lineTotalCents', () => {
  it('quantidade × preço, meio centavo sobe', () => {
    assert.equal(lineTotalCents(3, 450), 1350);
    assert.equal(lineTotalCents(0.35, 4999), 1750); /* 1749,65 → 1750 */
    assert.equal(lineTotalCents(0.001, 500), 1); /* 0,5 → 1 */
    assert.equal(lineTotalCents(0.001, 499), 0); /* 0,499 → 0 */
  });

  it('não perde centavo em conta grande — onde ponto flutuante perderia', () => {
    /* 12,345 × 9.999.999.999 = 123.449.999.987,655 → arredonda para ...988. */
    assert.equal(lineTotalCents(12.345, 9_999_999_999), 123_449_999_988);
  });
});

describe('estoque', () => {
  it('todo tipo de movimento tem sinal definido', () => {
    for (const k of INVENTORY_MOVEMENT_KINDS) assert.ok([1, -1, 0].includes(movementSign(k)), k);
  });

  it('venda tira, estorno devolve, ajuste vai para onde a contagem mandar', () => {
    assert.equal(movementSign('sale'), -1);
    assert.equal(movementSign('sale_return'), 1);
    assert.equal(movementSign('adjustment'), 0);
  });
});

describe('financeStatus', () => {
  const base = { paidAt: null, cancelledAt: null, dueDate: '2026-09-25' };

  it('vence amanhã é aberto; venceu ontem é vencido — pelo dia do tenant', () => {
    assert.equal(financeStatus(base, '2026-09-25'), 'open');
    assert.equal(financeStatus(base, '2026-09-26'), 'overdue');
  });

  it('pago e cancelado vencem a data', () => {
    assert.equal(financeStatus({ ...base, paidAt: '2026-09-20T10:00:00Z' }, '2026-12-01'), 'paid');
    assert.equal(
      financeStatus({ ...base, cancelledAt: '2026-09-20T10:00:00Z' }, '2026-12-01'),
      'cancelled',
    );
  });
});

describe('formatQuantity', () => {
  it('vírgula e unidade', () => {
    assert.equal(formatQuantity(1.5, 'kg'), '1,5 kg');
    assert.equal(formatQuantity(3, 'un'), '3 un');
  });
});

describe('grossMargin', () => {
  it('calcula sobre o preço, com uma casa', () => {
    assert.equal(grossMargin(1000, 600), 40);
    assert.equal(grossMargin(550, 180), 67.3);
  });

  it('sem custo, ou com preço zero, não há margem — e não é zero', () => {
    assert.equal(grossMargin(1000, null), null);
    assert.equal(grossMargin(0, 100), null);
  });

  it('vender abaixo do custo dá margem negativa, e aparece', () => {
    assert.equal(grossMargin(1000, 1200), -20);
  });
});

describe('stockStatus', () => {
  const p = (quantity: number | null, minStock: number | null = null, trackStock = true) => ({
    trackStock,
    quantity,
    minStock,
  });

  it('quem não controla estoque não tem situação', () => {
    assert.equal(stockStatus(p(-5, 10, false)), 'untracked');
  });

  it('negativo, zerado, no mínimo e em dia', () => {
    assert.equal(stockStatus(p(-0.5)), 'negative');
    assert.equal(stockStatus(p(0)), 'out');
    assert.equal(stockStatus(p(null)), 'out', 'sem movimento nenhum é zero');
    assert.equal(stockStatus(p(5, 5)), 'low', 'chegar no mínimo já é hora de repor');
    assert.equal(stockStatus(p(6, 5)), 'ok');
    assert.equal(stockStatus(p(3)), 'ok', 'sem mínimo, só o zero alerta');
  });
});

describe('formatQuantityInput', () => {
  it('volta pelo parseQuantity sem mudar', () => {
    for (const q of [1, 1.5, 0.335, 1234, 12345.678]) {
      assert.equal(parseQuantity(formatQuantityInput(q)), q, String(q));
    }
  });

  it('sem separador de milhar', () => {
    assert.equal(formatQuantityInput(1234.5), '1234,5');
  });
});

describe('stockSummary', () => {
  const l = (
    quantity: number | null,
    minStock: number | null,
    costCents: number | null,
    trackStock = true,
  ) => ({
    trackStock,
    quantity,
    minStock,
    costCents,
  });

  it('conta cada situação', () => {
    const r = stockSummary([
      l(-1, null, 100),
      l(0, 5, 100),
      l(3, 5, 100),
      l(10, 5, 100),
      l(4, null, null, false),
    ]);
    assert.deepEqual(r.porSituacao, { negative: 1, out: 1, low: 1, ok: 1, untracked: 1 });
  });

  it('valor a custo: só saldo positivo, com a conta da venda', () => {
    // 0,335 × 5290 = 1772,15 → 1772; 10 × 100 = 1000; negativo não vale.
    const r = stockSummary([l(0.335, null, 5290), l(10, null, 100), l(-3, null, 999)]);
    assert.equal(r.valorACusto, 2772);
  });

  it('diz quantos ficaram fora do valor por falta de custo', () => {
    const r = stockSummary([l(2, null, null), l(0, null, null), l(1, null, 50)]);
    assert.equal(r.semCusto, 1, 'saldo zero sem custo não faz falta');
    assert.equal(r.valorACusto, 50);
  });

  it('a ordem de urgência começa pelo negativo', () => {
    assert.equal(STOCK_STATUS_ORDER[0], 'negative');
    assert.equal(STOCK_STATUS_ORDER.length, 5);
  });
});
