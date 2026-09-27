/**
 *   npm run test:web
 *
 * Este arquivo guarda o risco R3 do DESIGN_SYSTEM: se o tailwind-merge deixar
 * de conhecer os tokens por papel, ele não quebra nada — ele passa a devolver
 * as duas classes, e o override por `className` falha em silêncio em todo
 * primitivo. Um teste é a única forma de esse defeito ser barulhento.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { atrasoDaLinha, cn } from './utils.ts';

describe('cn — escala tipográfica', () => {
  it('a última classe de tamanho vence', () => {
    assert.equal(cn('text-metric', 'text-h1'), 'text-h1');
    assert.equal(cn('text-eyebrow', 'text-micro'), 'text-micro');
  });

  it('token por papel e escala nativa do Tailwind disputam o mesmo grupo', () => {
    assert.equal(cn('text-h1', 'text-sm'), 'text-sm');
    assert.equal(cn('text-sm', 'text-caption'), 'text-caption');
  });

  it('nome com dois segmentos não escapa do grupo', () => {
    assert.equal(cn('text-body-lg', 'text-metric-sm'), 'text-metric-sm');
    assert.equal(cn('text-metric-sm', 'text-body'), 'text-body');
  });

  it('tamanho e cor são eixos diferentes e convivem — nas duas ordens', () => {
    assert.equal(cn('text-h1', 'text-content-subtle'), 'text-h1 text-content-subtle');
    assert.equal(cn('text-content-subtle', 'text-h1'), 'text-content-subtle text-h1');
  });
});

describe('cn — raio por papel', () => {
  it('a última classe de raio vence', () => {
    assert.equal(cn('rounded-card', 'rounded-pill'), 'rounded-pill');
    assert.equal(cn('rounded-control', 'rounded-lg'), 'rounded-lg');
    assert.equal(cn('rounded-panel', 'rounded-control'), 'rounded-control');
  });

  it('cada lado é um grupo próprio', () => {
    assert.equal(cn('rounded-t-card', 'rounded-t-panel'), 'rounded-t-panel');
    assert.equal(cn('rounded-bl-card', 'rounded-bl-pill'), 'rounded-bl-pill');
  });

  it('o raio inteiro anula o raio de um lado, mas não o contrário', () => {
    assert.equal(cn('rounded-t-panel', 'rounded-card'), 'rounded-card');
    assert.equal(cn('rounded-card', 'rounded-t-panel'), 'rounded-card rounded-t-panel');
  });
});

describe('cn — elevação por papel', () => {
  it('a última classe de sombra vence', () => {
    assert.equal(cn('shadow-card', 'shadow-modal'), 'shadow-modal');
    assert.equal(cn('shadow-xs', 'shadow-raised'), 'shadow-raised');
    assert.equal(cn('shadow-overlay', 'shadow-flat'), 'shadow-flat');
  });

  it('elevação e cor de sombra são eixos diferentes e convivem', () => {
    assert.equal(cn('shadow-overlay', 'shadow-brand'), 'shadow-overlay shadow-brand');
  });
});

describe('cn — grupos distintos', () => {
  it('classes de grupos diferentes sobrevivem juntas', () => {
    assert.equal(
      cn('text-h1', 'rounded-card', 'shadow-raised'),
      'text-h1 rounded-card shadow-raised',
    );
  });

  it('só o conflito real é resolvido dentro de um conjunto maior', () => {
    assert.equal(
      cn('text-body rounded-control shadow-card', 'text-h2 shadow-overlay'),
      'rounded-control text-h2 shadow-overlay',
    );
  });
});

describe('atrasoDaLinha', () => {
  it('escalona de 20 em 20 milissegundos', () => {
    assert.equal(atrasoDaLinha(0), '0ms');
    assert.equal(atrasoDaLinha(1), '20ms');
    assert.equal(atrasoDaLinha(5), '100ms');
  });

  it('para de crescer no nono item — depois disso vira espera', () => {
    assert.equal(atrasoDaLinha(8), '160ms');
    assert.equal(atrasoDaLinha(9), '160ms');
    assert.equal(atrasoDaLinha(400), '160ms');
  });

  it('índice negativo não puxa o atraso para trás', () => {
    assert.equal(atrasoDaLinha(-3), '0ms');
  });
});
