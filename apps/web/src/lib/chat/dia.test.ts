/**
 *   npm run test:web
 *
 * O separador de data é a única coisa da conversa que decide sozinha o que
 * escrever. Se ele errar, a tela mente sobre QUANDO algo foi dito — e num chat
 * de equipe "isso foi ontem" ou "isso foi em julho" muda a decisão de quem lê.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dividirPorDia, rotuloDoDia } from './dia.ts';

/* Uma sexta-feira, para que "menos de 7 dias" caia em dias da semana distintos. */
const HOJE = '2026-09-25';

describe('rotuloDoDia', () => {
  it('hoje e ontem têm nome, não data', () => {
    assert.equal(rotuloDoDia('2026-09-25', HOJE), 'Hoje');
    assert.equal(rotuloDoDia('2026-09-24', HOJE), 'Ontem');
  });

  it('os últimos seis dias viram dia da semana, com inicial maiúscula', () => {
    assert.equal(rotuloDoDia('2026-09-23', HOJE), 'Quarta-feira');
    assert.equal(rotuloDoDia('2026-09-20', HOJE), 'Domingo');
    /* Seis dias atrás ainda é nome; o sétimo já não é. */
    assert.equal(rotuloDoDia('2026-09-19', HOJE), 'Sábado');
  });

  it('a partir de sete dias vira data, sem o ano quando o ano é o mesmo', () => {
    assert.equal(rotuloDoDia('2026-09-18', HOJE), '18 de setembro');
    assert.equal(rotuloDoDia('2026-01-07', HOJE), '7 de janeiro');
  });

  it('ano diferente traz o ano — é ele que a pessoa está procurando', () => {
    assert.equal(rotuloDoDia('2025-12-31', HOJE), '31 de dezembro de 2025');
  });

  it('data no futuro não vira dia da semana', () => {
    /*
     * Relógio de servidor adiantado, ou fuso do tenant à frente do de quem
     * escreveu: "Sábado" para algo que ainda não aconteceu leria como passado.
     */
    assert.equal(rotuloDoDia('2026-09-26', HOJE), '26 de setembro');
  });
});

describe('dividirPorDia', () => {
  const fuso = 'America/Sao_Paulo';
  const msg = (id: string, criadaEm: string) => ({ id, criadaEm });

  it('agrupa na ordem em que chega e preserva a sequência', () => {
    const dias = dividirPorDia(
      [
        msg('a', '2026-09-24T12:00:00Z'),
        msg('b', '2026-09-24T18:00:00Z'),
        msg('c', '2026-09-25T13:00:00Z'),
      ],
      fuso,
      HOJE,
    );

    assert.deepEqual(
      dias.map((d) => [d.dia, d.rotulo, d.mensagens.map((m) => m.id)]),
      [
        ['2026-09-24', 'Ontem', ['a', 'b']],
        ['2026-09-25', 'Hoje', ['c']],
      ],
    );
  });

  it('o dia é o do fuso do tenant, não o de UTC', () => {
    /*
     * 01:30 UTC de 25/09 é 22:30 de 24/09 em São Paulo. Dividir por UTC poria
     * a mensagem sob a régua "Hoje" para quem a escreveu ontem à noite.
     */
    const dias = dividirPorDia([msg('a', '2026-09-25T01:30:00Z')], fuso, HOJE);
    assert.equal(dias.length, 1);
    assert.equal(dias[0]?.dia, '2026-09-24');
    assert.equal(dias[0]?.rotulo, 'Ontem');
  });

  it('lista vazia não inventa um dia', () => {
    assert.deepEqual(dividirPorDia([], fuso, HOJE), []);
  });
});
