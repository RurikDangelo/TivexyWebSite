/**
 * Testes da classificação da agenda.
 *
 * Toda data aqui é construída no fuso do tenant, nunca no do processo: um
 * teste que usa `new Date('2026-09-24T09:00')` passa na máquina de quem
 * escreveu e falha no CI, que roda em UTC. É o mesmo defeito que a função
 * existe para evitar.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { zonedToUtc } from '@tivexy/core';
import { faixaDe, instante } from './agenda.ts';

const SP = 'America/Sao_Paulo';

/** Hora de parede em São Paulo → instante. */
function emSP(parede: string): Date {
  const data = zonedToUtc(parede, SP);
  assert.notEqual(data, null, parede);
  return data as Date;
}

/** O "agora" de todos os testes: 24/09/2026, meio-dia em São Paulo. */
const AGORA = emSP('2026-09-24T12:00');

describe('faixaDe', () => {
  it('sem prazo é sem prazo, não atrasada', () => {
    // Atividade sem data é anotação, não pendência vencida. Pintá-la de
    // vermelho ensina a ignorar o vermelho.
    assert.equal(faixaDe(null, null, AGORA, SP), 'sem-prazo');
  });

  it('concluída ganha de tudo, inclusive de prazo vencido', () => {
    const venceuAnteontem = emSP('2026-09-22T09:00');
    const feitaOntem = emSP('2026-09-23T15:00');
    assert.equal(faixaDe(venceuAnteontem, feitaOntem, AGORA, SP), 'concluida');
  });

  it('concluída sem prazo também é concluída', () => {
    assert.equal(faixaDe(null, emSP('2026-09-23T15:00'), AGORA, SP), 'concluida');
  });

  it('ontem é atrasada', () => {
    assert.equal(faixaDe(emSP('2026-09-23T09:00'), null, AGORA, SP), 'atrasada');
  });

  it('amanhã é próxima', () => {
    assert.equal(faixaDe(emSP('2026-09-25T09:00'), null, AGORA, SP), 'proxima');
  });

  it('hoje mais tarde é hoje', () => {
    assert.equal(faixaDe(emSP('2026-09-24T18:00'), null, AGORA, SP), 'hoje');
  });

  it('hoje mais cedo já é atrasada — a hora decide dentro do dia', () => {
    // Às 12:00, a reunião das 09:00 pede ação, não paciência.
    assert.equal(faixaDe(emSP('2026-09-24T09:00'), null, AGORA, SP), 'atrasada');
  });

  it('hoje às 23:00 não vira "próxima" só porque faltam menos de 24 horas', () => {
    // A armadilha de contar em horas em vez de dias de calendário.
    assert.equal(faixaDe(emSP('2026-09-24T23:00'), null, AGORA, SP), 'hoje');
  });

  it('amanhã às 00:30 não vira "hoje" só porque faltam 12 horas', () => {
    assert.equal(faixaDe(emSP('2026-09-25T00:30'), null, AGORA, SP), 'proxima');
  });

  it('o fuso do tenant decide, não o do servidor', () => {
    /*
     * O mesmo instante, dois expedientes. Às 04:00 UTC de 25/09:
     *
     *   São Paulo  25/09 01:00 — e agora, ali, ainda é 24/09 → amanhã
     *   Tóquio     25/09 13:00 — e agora, ali, já é 25/09   → hoje
     *
     * Uma agenda que decidisse pelo fuso do servidor daria a mesma resposta
     * para os dois, e estaria errada para um deles.
     */
    const instanteUnico = new Date('2026-09-25T04:00:00Z');
    assert.equal(faixaDe(instanteUnico, null, AGORA, SP), 'proxima');
    assert.equal(faixaDe(instanteUnico, null, AGORA, 'Asia/Tokyo'), 'hoje');
  });
});

describe('instante', () => {
  it('lê o ISO que o Postgres devolve', () => {
    const data = instante('2026-09-24T17:00:00+00:00');
    assert.equal(data?.toISOString(), '2026-09-24T17:00:00.000Z');
  });

  it('ausência é null, não Invalid Date', () => {
    // `new Date(null)` é 1970, e 1970 na agenda apareceria como atrasada.
    for (const nada of [null, undefined, '', 42, {}]) {
      assert.equal(instante(nada), null, String(nada));
    }
  });

  it('texto que não é data é null', () => {
    assert.equal(instante('semana que vem'), null);
  });
});
