/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MODULE_CODES } from '@tivexy/core';

import { INTEGRACOES, conferir, integracoesEmUso } from './catalog.ts';

describe('o catálogo de integrações', () => {
  it('nenhuma aparece como conectada — não existe conexão', () => {
    for (const i of INTEGRACOES) assert.equal(i.estado, 'nao-configurado', i.codigo);
    assert.equal(integracoesEmUso(INTEGRACOES), 0);
    const texto = JSON.stringify(INTEGRACOES).toLowerCase();
    assert.doesNotMatch(texto, /\bconectad[oa]s?\b|\bem funcionamento\b|\bdemonstra/);
  });

  it('cada uma diz para quê, o que funciona sem ela e o que falta da Tivexy', () => {
    for (const i of INTEGRACOES) {
      assert.ok(i.paraQue.trim() !== '', i.codigo);
      assert.ok(i.hojeSemEla.trim() !== '', i.codigo);
      assert.ok(i.faltaDaTivexy.length > 0, `${i.codigo}: nada a construir?`);
    }
  });

  it('códigos únicos, módulos do catálogo do Core', () => {
    const codigos = INTEGRACOES.map((i) => i.codigo);
    assert.equal(new Set(codigos).size, codigos.length);
    for (const i of INTEGRACOES) {
      if (i.modulo !== null) assert.ok(MODULE_CODES.includes(i.modulo), i.codigo);
    }
  });
});

describe('conferir', () => {
  const vazia = { documento: null, razaoSocial: null };

  it('CNPJ é o de 14 posições — com ou sem letra; CPF não emite como empresa', () => {
    assert.equal(conferir('cnpj', { ...vazia, documento: '12345678000195' }).pronto, true);
    assert.equal(conferir('cnpj', { ...vazia, documento: '12ABC34501DE35' }).pronto, true);
    assert.equal(conferir('cnpj', { ...vazia, documento: '12345678909' }).pronto, false);
    assert.equal(conferir('cnpj', vazia).pronto, false);
  });

  it('razão social em branco não conta', () => {
    assert.equal(conferir('razao-social', { ...vazia, razaoSocial: '  ' }).pronto, false);
    assert.equal(
      conferir('razao-social', { ...vazia, razaoSocial: 'Café Demo Ltda' }).pronto,
      true,
    );
  });
});
