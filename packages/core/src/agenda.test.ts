/**
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AGENDA_BUCKETS, agendaBucket, groupByBucket } from './agenda.ts';

const SP = 'America/Sao_Paulo';
/* 25/09/2026 10:00 em São Paulo. */
const agora = new Date('2026-09-25T13:00:00Z');

describe('agendaBucket', () => {
  it('a das 9h que não foi feita está atrasada às 10h — não "hoje"', () => {
    assert.equal(agendaBucket('2026-09-25T12:00:00Z', agora, SP), 'overdue');
  });

  it('mais tarde hoje é hoje', () => {
    assert.equal(agendaBucket('2026-09-25T20:00:00Z', agora, SP), 'today');
  });

  it('23h30 de hoje em São Paulo já é amanhã em UTC — e continua sendo hoje', () => {
    assert.equal(agendaBucket('2026-09-26T02:30:00Z', agora, SP), 'today');
  });

  it('amanhã, a semana e depois', () => {
    assert.equal(agendaBucket('2026-09-26T15:00:00Z', agora, SP), 'tomorrow');
    assert.equal(agendaBucket('2026-10-02T15:00:00Z', agora, SP), 'week');
    assert.equal(agendaBucket('2026-10-03T15:00:00Z', agora, SP), 'later');
  });

  it('sem data é sem data', () => {
    assert.equal(agendaBucket(null, agora, SP), 'undated');
  });
});

describe('groupByBucket', () => {
  it('toda faixa aparece, na ordem da agenda', () => {
    const g = groupByBucket([{ dueAt: null }], agora, SP);
    assert.deepEqual(Object.keys(g), [...AGENDA_BUCKETS]);
    assert.equal(g.undated.length, 1);
    assert.equal(g.today.length, 0);
  });
});
