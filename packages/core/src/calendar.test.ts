/**
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addDays, dateIn, daysBetween, isIsoDate, startOfMonth, todayIn } from './calendar.ts';

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
