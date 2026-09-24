/**
 * Testes da busca.
 *
 * O teste que importa é o de **fuga**: o termo digitado não pode virar
 * sintaxe de filtro. Os outros são conforto; este é correção.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filtroOu, parametro, termoSeguro, umDentre } from './busca.ts';

const COLUNAS = ['name', 'email'] as const;

describe('filtroOu', () => {
  it('monta uma condição por coluna', () => {
    assert.equal(filtroOu('maria', COLUNAS), 'name.ilike."*maria*",email.ilike."*maria*"');
  });

  it('termo vazio devolve null, não filtro vazio', () => {
    // String vazia viraria um filtro que não casa com nada, e a listagem
    // apareceria vazia para quem só apagou a busca.
    assert.equal(filtroOu('', COLUNAS), null);
    assert.equal(filtroOu('   ', COLUNAS), null);
  });

  it('sem coluna não há filtro', () => {
    assert.equal(filtroOu('maria', []), null);
  });
});

describe('o termo não vira sintaxe de filtro', () => {
  /*
   * A vírgula separa condições no PostgREST e o parêntese delimita o grupo.
   * Um nome de empresa brasileiro tem os dois: `Silva, Souza & Cia (ME)`.
   * Eles precisam atravessar como texto — dentro das aspas duplas, que é onde
   * perdem o significado.
   */
  const perigosos = [
    'Silva, Souza & Cia (ME)',
    'a,b',
    'x)or(y',
    '*',
    '%',
    'tudo*',
    'a"b',
    'a\\b',
    'name.ilike.*,id.eq.1',
  ];

  for (const termo of perigosos) {
    it(`"${termo}" não acrescenta cláusula`, () => {
      const filtro = filtroOu(termo, COLUNAS);
      if (filtro === null) return;

      /*
       * Fora das aspas, o filtro só pode ter uma vírgula — a que separa as
       * duas colunas. Contar assim prova a contenção sem depender de a
       * implementação escapar de um jeito específico.
       */
      const foraDasAspas = filtro.replace(/"[^"]*"/g, '""');
      assert.equal(
        foraDasAspas.split(',').length,
        COLUNAS.length,
        `o termo criou cláusula: ${filtro}`,
      );
      assert.equal((foraDasAspas.match(/[()]/g) ?? []).length, 0, `parêntese escapou: ${filtro}`);
    });
  }

  it('aspa e barra invertida saem do termo — são elas que fecham a citação', () => {
    assert.equal(termoSeguro('a"b\\c'), 'abc');
  });

  it('vírgula e parêntese ficam, porque são nome de empresa de verdade', () => {
    assert.equal(termoSeguro('Silva, Souza (ME)'), 'Silva, Souza (ME)');
  });

  it('curinga sai: quem digita 100% procura "100%"', () => {
    assert.equal(termoSeguro('100%'), '100');
    assert.equal(termoSeguro('tudo*'), 'tudo');
  });

  it('termo absurdamente longo é cortado', () => {
    // A URL vem de fora, e um termo de 10 mil caracteres é consulta cara de
    // graça — não é ataque sofisticado, é o que um script faz sem querer.
    assert.equal(termoSeguro('a'.repeat(5000)).length, 100);
  });
});

describe('parametro', () => {
  it('lê o texto', () => {
    assert.equal(parametro({ b: 'maria' }, 'b'), 'maria');
  });

  it('parâmetro repetido na URL vira array — pega o primeiro', () => {
    assert.equal(parametro({ b: ['maria', 'joao'] }, 'b'), 'maria');
  });

  it('ausente é string vazia, não undefined', () => {
    assert.equal(parametro({}, 'b'), '');
    assert.equal(parametro({ b: undefined }, 'b'), '');
    assert.equal(parametro({ b: [] }, 'b'), '');
  });
});

describe('umDentre', () => {
  const ESTADOS = ['todos', 'abertos'] as const;

  it('aceita o que está na lista', () => {
    assert.equal(umDentre('abertos', ESTADOS, 'todos'), 'abertos');
  });

  it('o que não está cai no padrão, em vez de esvaziar a tela', () => {
    // URL editada à mão ou link velho mostra a listagem inteira, não uma tela
    // vazia sem explicação.
    assert.equal(umDentre('inventado', ESTADOS, 'todos'), 'todos');
    assert.equal(umDentre('', ESTADOS, 'todos'), 'todos');
  });
});
