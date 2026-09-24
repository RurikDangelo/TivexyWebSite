/**
 * Testes dos contratos do ERP.
 *
 * As listas em si são conferidas contra os enums do Postgres em
 * `supabase/tests/contracts.test.mjs` — aqui ficam as regras que dependem
 * delas, e sobretudo as duas contas de dinheiro e quantidade.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ERP_MOVEMENT_KINDS,
  ERP_SALE_STATUSES,
  ERP_UNITS,
  ERP_UNIT_LABEL,
  FINANCE_ENTRY_KINDS,
  financeSign,
  formatQuantity,
  isSaleClosed,
  lineTotalCents,
  parseQuantity,
  stockDelta,
} from './erp.ts';

describe('rótulos', () => {
  it('toda unidade tem nome por extenso', () => {
    for (const unidade of ERP_UNITS) {
      assert.equal(typeof ERP_UNIT_LABEL[unidade], 'string');
      assert.ok(ERP_UNIT_LABEL[unidade].length > 0, `${unidade} sem rótulo`);
    }
  });
});

describe('stockDelta', () => {
  it('entrada soma, saída subtrai', () => {
    assert.equal(stockDelta('in', 10), 10);
    assert.equal(stockDelta('out', 10), -10);
  });

  it('ajuste soma o que veio — o sinal é de quem lançou', () => {
    /*
     * Ajuste para menos entra como `out`. É por isso que a quantidade pode
     * ser sempre positiva no banco, com constraint provando: quantidade
     * negativa com tipo `in` seria saída disfarçada de entrada, e nenhuma
     * soma perceberia.
     */
    assert.equal(stockDelta('adjustment', 4), 4);
  });

  it('todo tipo de movimento tem efeito definido', () => {
    for (const tipo of ERP_MOVEMENT_KINDS) {
      assert.equal(typeof stockDelta(tipo, 1), 'number', tipo);
    }
  });
});

describe('isSaleClosed', () => {
  it('rascunho é o único estado aberto', () => {
    assert.equal(isSaleClosed('draft'), false);
    for (const estado of ERP_SALE_STATUSES.filter((s) => s !== 'draft')) {
      assert.equal(isSaleClosed(estado), true, estado);
    }
  });
});

describe('financeSign', () => {
  it('receber entra, pagar sai', () => {
    assert.equal(financeSign('receivable'), 1);
    assert.equal(financeSign('payable'), -1);
  });

  it('todo tipo tem sinal', () => {
    for (const tipo of FINANCE_ENTRY_KINDS) {
      assert.ok([1, -1].includes(financeSign(tipo)), tipo);
    }
  });
});

describe('lineTotalCents', () => {
  it('quantidade inteira dá conta exata', () => {
    assert.equal(lineTotalCents(3, 4500), 13500);
  });

  it('quantidade fracionária arredonda como o banco arredonda', () => {
    /*
     * O gatilho que mantém o total da venda faz `round(quantity *
     * unit_price_cents)`. Se esta conta divergisse, a tela mostraria um
     * centavo a mais ou a menos do que ficou gravado — e a diferença só
     * apareceria no fechamento.
     */
    assert.equal(lineTotalCents(1.5, 4500), 6750);
    assert.equal(lineTotalCents(0.333, 4500), 1499);
  });

  it('quantidade zero dá zero', () => {
    assert.equal(lineTotalCents(0, 4500), 0);
  });
});

describe('parseQuantity', () => {
  it('aceita o que uma pessoa brasileira digita', () => {
    assert.equal(parseQuantity('2'), 2);
    assert.equal(parseQuantity('1,5'), 1.5);
    assert.equal(parseQuantity('1.250'), 1250);
    assert.equal(parseQuantity('0,333'), 0.333);
  });

  it('o ponto é milhar, não decimal', () => {
    // Lido ao contrário, `1.250` viraria 1,25 — um erro de mil vezes que
    // passa despercebido porque o número continua plausível.
    assert.equal(parseQuantity('1.250'), 1250);
    assert.notEqual(parseQuantity('1.250'), 1.25);
  });

  it('três casas, que é o que a coluna guarda', () => {
    assert.equal(parseQuantity('1,2345'), null, 'a quarta casa não cabe em numeric(14,3)');
  });

  it('zero não é quantidade', () => {
    // Item de venda com quantidade zero não é item, e a constraint recusa.
    assert.equal(parseQuantity('0'), null);
    assert.equal(parseQuantity('0,000'), null);
  });

  it('recusa o que não é número, em vez de virar zero', () => {
    for (const torto of ['', '  ', 'dois', '1,2,3', '-1', '1e3']) {
      assert.equal(parseQuantity(torto), null, `${torto} deveria ser recusado`);
    }
  });
});

describe('formatQuantity', () => {
  it('não mostra casa decimal inútil', () => {
    assert.equal(formatQuantity(2), '2');
  });

  it('mostra a casa que existe', () => {
    assert.equal(formatQuantity(1.5), '1,5');
  });
});
