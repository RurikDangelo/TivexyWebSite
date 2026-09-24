/**
 * Testes de CPF e CNPJ.
 *
 * O teste que importa aqui não é nenhum caso isolado: é o **invariante** de
 * que tudo que `checkDocument` aceita sai de `onlyDigits` em forma que a
 * coluna aceita. A coluna exige `^[0-9]+$`, e a mesma afirmação é conferida
 * contra o Postgres de verdade em `supabase/tests/crm.test.mjs` — aqui contra
 * a expressão, lá contra o banco.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CNPJ_LENGTH, CPF_LENGTH, checkDocument, formatDocument, onlyDigits } from './documento.ts';

/** A mesma expressão da constraint `crm_companies_document_digits`. */
const COMO_A_COLUNA_EXIGE = /^[0-9]+$/;

const CNPJ = '12345678000195';
const CPF = '12345678901';

describe('onlyDigits', () => {
  it('tira a pontuação do CNPJ', () => {
    assert.equal(onlyDigits('12.345.678/0001-95'), CNPJ);
  });

  it('tira a pontuação do CPF', () => {
    assert.equal(onlyDigits('123.456.789-01'), CPF);
  });

  it('serve para telefone também', () => {
    assert.equal(onlyDigits('(11) 90000-0000'), '11900000000');
  });

  it('sem dígito nenhum devolve vazio', () => {
    assert.equal(onlyDigits('abc'), '');
  });
});

describe('checkDocument', () => {
  it('vazio serve — o documento é opcional', () => {
    assert.equal(checkDocument(''), null);
    assert.equal(checkDocument('   '), null);
  });

  it('aceita CNPJ pontuado, como vem colado do site da Receita', () => {
    assert.equal(checkDocument('12.345.678/0001-95'), null);
  });

  it('aceita CPF pontuado', () => {
    assert.equal(checkDocument('123.456.789-01'), null);
  });

  it('aceita os dois sem pontuação', () => {
    assert.equal(checkDocument(CNPJ), null);
    assert.equal(checkDocument(CPF), null);
  });

  it('recusa quantidade de dígitos que não é nem CPF nem CNPJ', () => {
    for (const torto of ['1', '1234567890', '123456789012', '123456789012345']) {
      assert.notEqual(checkDocument(torto), null, `${torto} deveria ser recusado`);
    }
  });

  it('quem não digitou número nenhum lê sobre número, não sobre tamanho', () => {
    /*
     * A distinção é a razão de a mensagem ser texto e não booleano: dizer
     * "informe 11 ou 14 dígitos" a quem escreveu "a combinar" manda a pessoa
     * contar letras.
     */
    const problema = checkDocument('a combinar');
    assert.ok(problema !== null);
    assert.ok(!problema.includes(String(CPF_LENGTH)), problema);
  });

  it('a mensagem de tamanho diz os dois tamanhos', () => {
    const problema = checkDocument('123');
    assert.ok(problema !== null);
    assert.ok(problema.includes(String(CPF_LENGTH)), problema);
    assert.ok(problema.includes(String(CNPJ_LENGTH)), problema);
  });
});

describe('o que passa na conferência entra na coluna', () => {
  /*
   * O invariante. Se um dia `checkDocument` afrouxar — aceitar um traço, por
   * exemplo — este teste falha aqui, e não em produção com um erro de
   * constraint falando de expressão regular para quem só queria cadastrar uma
   * empresa.
   */
  const aceitos = [
    '12.345.678/0001-95',
    '12345678000195',
    '123.456.789-01',
    '12345678901',
    '  12345678000195  ',
  ];

  for (const entrada of aceitos) {
    it(`"${entrada.trim()}" vira dígito puro`, () => {
      assert.equal(checkDocument(entrada), null, 'deveria ser aceito');

      const gravado = onlyDigits(entrada);
      assert.match(gravado, COMO_A_COLUNA_EXIGE);
      assert.ok(
        gravado.length === CPF_LENGTH || gravado.length === CNPJ_LENGTH,
        `${gravado} tem ${gravado.length} dígitos`,
      );
    });
  }
});

describe('formatDocument', () => {
  it('pontua o CNPJ', () => {
    assert.equal(formatDocument(CNPJ), '12.345.678/0001-95');
  });

  it('pontua o CPF', () => {
    assert.equal(formatDocument(CPF), '123.456.789-01');
  });

  it('o que não tem tamanho de documento volta como veio', () => {
    /* Dado antigo e importação existem. Pontuar por cima inventaria um valor. */
    assert.equal(formatDocument('123'), '123');
    assert.equal(formatDocument(''), '');
  });

  it('formatar e limpar volta ao mesmo lugar', () => {
    for (const digitos of [CPF, CNPJ]) {
      assert.equal(onlyDigits(formatDocument(digitos)), digitos);
    }
  });
});
