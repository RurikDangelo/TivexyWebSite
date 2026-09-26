/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decidirLink } from './link-policy.ts';

const nova = { jaExistia: false, nuncaEntrou: true, outrasEmpresas: 0, superAdmin: false };

describe('decidirLink', () => {
  it('conta nova, sem uso e sem outra empresa: gera — é o convite sem e-mail', () => {
    assert.deepEqual(decidirLink(nova), { gerar: true });
  });

  it('conta de outra empresa: não gera — seria o login de alguém de fora', () => {
    const r = decidirLink({ ...nova, jaExistia: true, outrasEmpresas: 1 });
    assert.equal(r.gerar, false);
  });

  it('conta já usada: não gera, mesmo sem outra empresa', () => {
    const r = decidirLink({ ...nova, jaExistia: true, nuncaEntrou: false });
    assert.equal(r.gerar, false);
  });

  it('conta da equipe Tivexy: nunca', () => {
    assert.equal(decidirLink({ ...nova, superAdmin: true }).gerar, false);
  });

  it('conta que existia mas nunca foi usada nem tem outra empresa: gera', () => {
    /* O caso do convite repetido: o link anterior venceu antes de a pessoa abrir. */
    assert.deepEqual(decidirLink({ ...nova, jaExistia: true }), { gerar: true });
  });
});
