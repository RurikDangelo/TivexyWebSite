/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PROVISIONING_STEPS } from '@tivexy/core';

import { NOME_DA_ETAPA } from './labels.ts';
import { parseTenantInput } from './tenant-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('parseTenantInput', () => {
  it('documento com pontuação vira só os caracteres; CNPJ de letra passa', () => {
    const r = parseTenantInput(
      form({ nome: ' Café ', razaoSocial: '', documento: '12.ABC.345/01DE-35' }),
    );
    assert.deepEqual(r, {
      ok: true,
      valor: { nome: 'Café', razaoSocial: null, documento: '12ABC34501DE35' },
    });
  });

  it('documento com dígito errado diz o que está errado, no campo', () => {
    const r = parseTenantInput(form({ nome: 'Café', documento: '12.345.678/0001-00' }));
    assert.ok(!r.ok);
    assert.match(r.campos.documento ?? '', /dígito verificador/);
  });

  it('nome é obrigatório; documento vazio é "sem documento", não erro', () => {
    assert.ok(!parseTenantInput(form({ nome: ' ' })).ok);
    const r = parseTenantInput(form({ nome: 'Café', documento: '' }));
    assert.ok(r.ok);
    assert.equal(r.valor.documento, null);
  });
});

describe('rótulos do Admin', () => {
  it('toda etapa do provisionamento tem nome', () => {
    for (const etapa of PROVISIONING_STEPS) assert.ok(NOME_DA_ETAPA[etapa], etapa);
  });
});
