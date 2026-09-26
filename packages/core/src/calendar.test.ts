/**
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  dateIn,
  daysBetween,
  instantFromLocal,
  isIsoDate,
  isTime,
  startOfMonth,
  timeIn,
  todayIn,
} from './calendar.ts';

describe('dateIn / todayIn', () => {
  it('às 22h de São Paulo ainda é hoje em São Paulo — e já é amanhã em UTC', () => {
    /* 25/09/2026 22:30 em São Paulo (UTC−3) = 26/09/2026 01:30 UTC. */
    const noite = new Date('2026-09-26T01:30:00Z');
    assert.equal(todayIn('America/Sao_Paulo', noite), '2026-09-25');
    assert.equal(todayIn('UTC', noite), '2026-09-26');
  });

  it('aceita o texto que o banco devolve para timestamptz', () => {
    assert.equal(dateIn('2026-01-01T02:59:59+00:00', 'America/Sao_Paulo'), '2025-12-31');
  });
});

describe('isIsoDate', () => {
  it('recusa o que não existe no calendário', () => {
    assert.equal(isIsoDate('2026-02-28'), true);
    assert.equal(isIsoDate('2028-02-29'), true);
    assert.equal(isIsoDate('2026-02-29'), false);
    assert.equal(isIsoDate('2026-13-01'), false);
    assert.equal(isIsoDate('26-09-2026'), false);
    assert.equal(isIsoDate(''), false);
  });
});

describe('daysBetween', () => {
  it('conta dias de calendário, nos dois sentidos', () => {
    assert.equal(daysBetween('2026-09-01', '2026-09-25'), 24);
    assert.equal(daysBetween('2026-09-25', '2026-09-01'), -24);
    assert.equal(daysBetween('2026-09-25', '2026-09-25'), 0);
  });

  it('atravessa virada de ano e fevereiro sem perder um dia', () => {
    assert.equal(daysBetween('2027-12-31', '2028-01-01'), 1);
    assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
  });
});

describe('addDays / startOfMonth', () => {
  it('soma e subtrai atravessando o mês', () => {
    assert.equal(addDays('2026-09-25', 10), '2026-10-05');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  it('o primeiro dia do mês', () => {
    assert.equal(startOfMonth('2026-09-25'), '2026-09-01');
  });
});

describe('instantFromLocal / timeIn', () => {
  it('14h30 em São Paulo é 17h30 em UTC — não 14h30', () => {
    assert.equal(
      instantFromLocal('2026-09-25', '14:30', 'America/Sao_Paulo'),
      '2026-09-25T17:30:00.000Z',
    );
  });

  it('ida e volta: a hora que entrou é a hora que aparece', () => {
    const instante = instantFromLocal('2026-12-31', '23:45', 'America/Sao_Paulo');
    assert.equal(timeIn(instante, 'America/Sao_Paulo'), '23:45');
    assert.equal(dateIn(instante, 'America/Sao_Paulo'), '2026-12-31');
  });

  it('em fuso com horário de verão, cada lado da mudança tem o seu deslocamento', () => {
    /* Nova York: UTC−4 no verão, UTC−5 no inverno. */
    assert.equal(
      instantFromLocal('2026-07-01', '09:00', 'America/New_York'),
      '2026-07-01T13:00:00.000Z',
    );
    assert.equal(
      instantFromLocal('2026-12-01', '09:00', 'America/New_York'),
      '2026-12-01T14:00:00.000Z',
    );
  });
});

describe('isTime', () => {
  it('só HH:MM que existe', () => {
    assert.equal(isTime('00:00'), true);
    assert.equal(isTime('23:59'), true);
    for (const torto of ['24:00', '12:60', '9:30', '12:3', ''])
      assert.equal(isTime(torto), false, torto);
  });
});
