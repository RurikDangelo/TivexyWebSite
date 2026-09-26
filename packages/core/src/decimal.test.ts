import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDecimal } from './decimal.ts';

describe('normalizeDecimal', () => {
  it('vírgula é o decimal; ponto em grupo de milhar é milhar', () => {
    assert.equal(normalizeDecimal('1.234,56', 2), '1234.56');
    assert.equal(normalizeDecimal('1234,56', 2), '1234.56');
    assert.equal(normalizeDecimal('1.000', 2), '1000');
    assert.equal(normalizeDecimal('1.234.567', 2), '1234567');
  });

  it('ponto sozinho que não forma grupo é decimal — o teclado do celular', () => {
    assert.equal(normalizeDecimal('5.50', 2), '5.50');
    assert.equal(normalizeDecimal('0.99', 2), '0.99');
    assert.equal(normalizeDecimal('0.335', 3), '0.335', 'grupo de milhar não começa com zero');
    assert.equal(normalizeDecimal('1.5', 3), '1.5');
  });

  it('recusa o que não é número, em vez de adivinhar', () => {
    for (const torto of [
      '',
      ' ',
      'abc',
      '1,2,3',
      '1.2.3',
      '1.23,4.5',
      '-5',
      '1e3',
      'R$ 10',
      ',5',
      '5,',
    ]) {
      assert.equal(normalizeDecimal(torto, 2), null, torto);
    }
  });

  it('casas demais é recusado, com vírgula ou com ponto', () => {
    assert.equal(normalizeDecimal('12,345', 2), null);
    assert.equal(normalizeDecimal('0.3355', 3), null);
    assert.equal(normalizeDecimal('0,3355', 3), null);
  });

  it('pontos antes da vírgula precisam ser grupos válidos', () => {
    assert.equal(normalizeDecimal('12.34,5', 2), null);
    assert.equal(normalizeDecimal('12.345,6', 2), '12345.6');
  });

  it('espaço é ignorado', () => {
    assert.equal(normalizeDecimal(' 1 234,5 ', 2), '1234.5');
  });
});
