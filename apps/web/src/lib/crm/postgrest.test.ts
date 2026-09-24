/**
 * Testes da leitura de relação embutida.
 *
 * O caso que este arquivo existe para travar é o silencioso: quando o
 * PostgREST devolve a relação como array e o código só trata objeto, a coluna
 * fica vazia **sem erro nenhum** — e "sem empresa" é um estado legítimo, então
 * ninguém desconfia.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nomeAninhado } from './postgrest.ts';

describe('nomeAninhado', () => {
  it('lê do objeto', () => {
    assert.equal(nomeAninhado({ name: 'Padaria do Bairro' }), 'Padaria do Bairro');
  });

  it('lê do array — a forma que passa despercebida', () => {
    assert.equal(nomeAninhado([{ name: 'Padaria do Bairro' }]), 'Padaria do Bairro');
  });

  it('relação ausente é null', () => {
    assert.equal(nomeAninhado(null), null);
    assert.equal(nomeAninhado(undefined), null);
    assert.equal(nomeAninhado([]), null);
  });

  it('nome vazio é ausência, não nome', () => {
    /* Renderizar string vazia produz um espaço em branco onde deveria haver
       "Sem empresa" — pior que a ausência, porque parece dado. */
    assert.equal(nomeAninhado({ name: '' }), null);
  });

  it('lê outro campo quando pedido — a oportunidade tem título, não nome', () => {
    assert.equal(nomeAninhado({ title: 'Reforma da fachada' }, 'title'), 'Reforma da fachada');
    assert.equal(nomeAninhado([{ title: 'Reforma da fachada' }], 'title'), 'Reforma da fachada');
  });

  it('pedir um campo não faz o outro valer', () => {
    assert.equal(nomeAninhado({ name: 'Padaria' }, 'title'), null);
  });

  it('o que não tem a forma esperada não vira nome', () => {
    assert.equal(nomeAninhado({ name: 42 }), null);
    assert.equal(nomeAninhado('Padaria'), null);
    assert.equal(nomeAninhado({}), null);
  });
});
