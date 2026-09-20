/**
 * Testes do texto de acesso negado.
 *
 * O teste que importa aqui é o de exaustividade. O `Record` completo já faz o
 * TypeScript recusar um motivo novo sem tradução — mas não impede alguém de
 * preencher com string vazia às pressas só para compilar, e aí a pessoa negada
 * vê um cabeçalho em branco.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DENIAL_REASONS, redirectFor } from '@tivexy/core';
import { denialCopy, parseDenialReason } from './denial.ts';

describe('todo motivo tem texto', () => {
  for (const motivo of DENIAL_REASONS) {
    it(motivo, () => {
      const copy = denialCopy(motivo);
      for (const [campo, valor] of Object.entries(copy)) {
        assert.equal(typeof valor, 'string', `${campo} precisa ser texto`);
        assert.ok(valor.trim().length > 10, `${campo} está vazio ou curto demais para explicar`);
      }
    });
  }

  it('nenhum texto se repete entre motivos', () => {
    // Dois motivos com o mesmo texto são dois motivos que a pessoa não
    // consegue distinguir — e a distinção é o valor inteiro desta página.
    const titulos = DENIAL_REASONS.map((r) => denialCopy(r).title);
    assert.equal(new Set(titulos).size, titulos.length, 'há título repetido');

    const descricoes = DENIAL_REASONS.map((r) => denialCopy(r).description);
    assert.equal(new Set(descricoes).size, descricoes.length, 'há descrição repetida');
  });

  it('o próximo passo diz com quem falar, não o que clicar', () => {
    // Quem é negado não resolve sozinho: resolve com o administrador da
    // empresa, com quem contratou, ou aceitando um convite.
    const comDestino = DENIAL_REASONS.filter((r) => redirectFor(r) === null);
    for (const motivo of comDestino) {
      const { nextStep } = denialCopy(motivo);
      assert.match(
        nextStep,
        /administrador|contratou|comercial|empresa/i,
        `"${motivo}" não diz a quem recorrer`,
      );
    }
  });
});

describe('motivo vindo da URL', () => {
  it('aceita os motivos conhecidos', () => {
    for (const motivo of DENIAL_REASONS) {
      assert.equal(parseDenialReason(motivo), motivo);
    }
  });

  for (const lixo of [
    'inventado',
    '',
    null,
    undefined,
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
  ]) {
    it(`${JSON.stringify(lixo)} cai no padrão em vez de quebrar`, () => {
      // `__proto__` e `constructor` existem em todo objeto por herança: um
      // `raw in COPY` ingênuo os daria como válidos, e `COPY['constructor']`
      // devolveria uma função no lugar do texto.
      assert.equal(parseDenialReason(lixo), 'missing-permission');
      assert.equal(typeof denialCopy(parseDenialReason(lixo)).title, 'string');
    });
  }
});
