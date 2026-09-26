/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ilikeTerm, paginaPedida } from './search.ts';

describe('ilikeTerm', () => {
  it('embrulha o termo nos curingas do PostgREST', () => {
    assert.equal(ilikeTerm('maria'), '*maria*');
  });

  it('sintaxe do filtro não passa — vírgula viraria outra condição', () => {
    assert.equal(ilikeTerm('a,email.eq.x'), '*a email.eq.x*');
    assert.equal(ilikeTerm('(x)'), '*x*');
    assert.equal(ilikeTerm('"x"'), '*x*');
  });

  it('curinga digitado vira espaço, não "qualquer coisa"', () => {
    assert.equal(ilikeTerm('50%'), '*50*');
    assert.equal(ilikeTerm('a_b'), '*a b*');
  });

  it('vazio, só espaço ou só sintaxe não filtra', () => {
    for (const vazio of ['', '   ', ',,,', undefined, null, []]) {
      assert.equal(ilikeTerm(vazio as string), null, JSON.stringify(vazio));
    }
  });

  it('termo gigante é cortado', () => {
    assert.equal(ilikeTerm('a'.repeat(500))?.length, 82);
  });
});

describe('paginaPedida', () => {
  it('só inteiro positivo; o resto é a primeira', () => {
    assert.equal(paginaPedida('3'), 3);
    for (const torto of ['0', '-1', '1.5', 'abc', '', undefined, '99999999']) {
      assert.equal(paginaPedida(torto), 1, String(torto));
    }
  });
});
