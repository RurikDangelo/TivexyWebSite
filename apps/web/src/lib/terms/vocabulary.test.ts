/**
 * O vocabulário padrão e a sobreposição do tenant.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TERM_KEYS } from '@tivexy/core';

import { DEFAULT_TERMS, capitalizar, customTerm, termOf } from './vocabulary.ts';

describe('DEFAULT_TERMS', () => {
  it('cobre exatamente os recursos do Core, nos dois sentidos', () => {
    /*
     * Faltando uma chave, a tela daquele recurso precisaria trazer o próprio
     * padrão — que é como o padrão diverge de uma tela para a outra. Sobrando,
     * é um nome para um recurso que o Core não tem.
     */
    assert.deepEqual(Object.keys(DEFAULT_TERMS).sort(), [...TERM_KEYS].sort());
  });

  it('todo padrão é minúsculo, porque aparece no meio da frase', () => {
    for (const [chave, { singular, plural }] of Object.entries(DEFAULT_TERMS)) {
      for (const forma of [singular, plural]) {
        const primeira = forma.charAt(0);
        assert.equal(primeira, primeira.toLocaleLowerCase('pt-BR'), `${chave}: "${forma}"`);
        assert.equal(forma, forma.trim(), `${chave}: espaço sobrando em "${forma}"`);
      }
    }
  });
});

describe('customTerm', () => {
  it('devolve o nome do nicho, sem espaço sobrando', () => {
    assert.deepEqual(
      customTerm(
        { 'crm.leads': { singular: ' interessado ', plural: 'interessados ' } },
        'crm.leads',
      ),
      { singular: 'interessado', plural: 'interessados' },
    );
  });

  it('ausente é null — o nicho não escolheu', () => {
    assert.equal(customTerm({}, 'crm.leads'), null);
  });

  it('forma torta vinda do banco conta como ausente, não como rótulo', () => {
    /* `tenants.terms` é jsonb: nada garante a forma além do que o provisionamento escreveu. */
    const tortos: unknown[] = [
      null,
      'interessados',
      42,
      ['interessado', 'interessados'],
      {},
      { singular: 'interessado' },
      { plural: 'interessados' },
      { singular: '', plural: 'interessados' },
      { singular: 'interessado', plural: '   ' },
      { singular: 1, plural: 2 },
    ];
    for (const torto of tortos) {
      const terms = { 'crm.leads': torto } as never;
      assert.equal(customTerm(terms, 'crm.leads'), null, JSON.stringify(torto));
    }
  });
});

describe('termOf', () => {
  it('cai no padrão do Tivexy quando o nicho não diz nada', () => {
    assert.deepEqual(termOf({}, 'crm.deals'), DEFAULT_TERMS['crm.deals']);
  });

  it('usa o do nicho quando existe', () => {
    const clinica = { 'crm.deals': { singular: 'tratamento', plural: 'tratamentos' } };
    assert.deepEqual(termOf(clinica, 'crm.deals'), {
      singular: 'tratamento',
      plural: 'tratamentos',
    });
  });
});

describe('capitalizar', () => {
  it('só a primeira letra, com acento', () => {
    assert.equal(capitalizar('órgãos parceiros'), 'Órgãos parceiros');
    assert.equal(capitalizar('itens do cardápio'), 'Itens do cardápio');
    assert.equal(capitalizar(''), '');
  });
});
