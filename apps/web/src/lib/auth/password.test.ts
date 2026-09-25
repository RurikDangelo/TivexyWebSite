/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conferirSenhaNova } from './password.ts';

describe('conferirSenhaNova', () => {
  it('oito caracteres iguais nas duas é o mínimo', () => {
    assert.equal(conferirSenhaNova('12345678', '12345678'), null);
  });

  it('curta é recusada, dizendo o mínimo', () => {
    assert.match(conferirSenhaNova('1234567', '1234567') ?? '', /8 caracteres/);
  });

  it('confirmação diferente é recusada', () => {
    assert.match(conferirSenhaNova('12345678', '12345679') ?? '', /não são iguais/);
  });
});
