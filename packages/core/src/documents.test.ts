/**
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DOCUMENT_PATTERN,
  checkDocument,
  formatDocument,
  isValidCnpj,
  isValidCpf,
  normalizeDocument,
} from './documents.ts';

describe('CPF', () => {
  it('aceita um CPF com os dígitos certos', () => {
    assert.equal(isValidCpf('52998224725'), true);
  });

  it('recusa dígito errado — um número a mais no fim muda tudo', () => {
    assert.equal(isValidCpf('52998224726'), false);
    assert.equal(isValidCpf('52998224715'), false);
  });

  it('onze dígitos iguais passam no cálculo e não são CPF', () => {
    for (const d of '0123456789') assert.equal(isValidCpf(d.repeat(11)), false, d);
  });
});

describe('CNPJ', () => {
  it('numérico, como sempre foi', () => {
    assert.equal(isValidCnpj('11222333000181'), true);
    assert.equal(isValidCnpj('11222333000182'), false);
  });

  it('alfanumérico — o exemplo da própria Receita Federal', () => {
    /* 12.ABC.345/01DE-35, da página de perguntas e respostas da RFB. */
    assert.equal(isValidCnpj(normalizeDocument('12.ABC.345/01DE-35')), true);
  });

  it('alfanumérico com dígito errado é recusado', () => {
    assert.equal(isValidCnpj('12ABC34501DE36'), false);
    assert.equal(isValidCnpj('12ABC34501DF35'), false);
  });

  it('letra no dígito verificador não existe', () => {
    assert.equal(isValidCnpj('12ABC34501DE3A'), false);
  });
});

describe('checkDocument', () => {
  it('limpa a pontuação, sobe a caixa e diz o tipo', () => {
    assert.deepEqual(checkDocument(' 529.982.247-25 '), {
      ok: true,
      value: '52998224725',
      kind: 'cpf',
    });
    assert.deepEqual(checkDocument('12.abc.345/01de-35'), {
      ok: true,
      value: '12ABC34501DE35',
      kind: 'cnpj',
    });
  });

  it('o tamanho errado diz qual é o certo', () => {
    const r = checkDocument('1234');
    assert.ok(!r.ok);
    assert.match(r.error, /11 dígitos.*14 caracteres/);
  });

  it('tudo o que sai aceito cabe na constraint do banco', () => {
    const banco = new RegExp(DOCUMENT_PATTERN);
    for (const bruto of ['529.982.247-25', '11.222.333/0001-81', '12.ABC.345/01DE-35']) {
      const r = checkDocument(bruto);
      assert.ok(r.ok, bruto);
      assert.match(r.value, banco, bruto);
    }
  });
});

describe('formatDocument', () => {
  it('volta para a forma que a pessoa reconhece', () => {
    assert.equal(formatDocument('52998224725'), '529.982.247-25');
    assert.equal(formatDocument('11222333000181'), '11.222.333/0001-81');
    assert.equal(formatDocument('12ABC34501DE35'), '12.ABC.345/01DE-35');
  });
});
