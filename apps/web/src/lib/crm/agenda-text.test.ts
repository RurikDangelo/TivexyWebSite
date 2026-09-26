/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { atraso, quando } from './agenda-text.ts';

const SP = 'America/Sao_Paulo';
const agora = new Date('2026-09-25T13:00:00Z'); /* sexta, 10h em São Paulo */

describe('quando', () => {
  it('hoje e amanhã mostram só a hora — o dia está no título da seção', () => {
    assert.equal(quando('2026-09-25T17:30:00Z', 'today', SP), '14:30');
  });

  it('23h59 é "o dia todo" — é assim que o dia sem hora é gravado', () => {
    assert.equal(quando('2026-09-26T02:59:00Z', 'today', SP), 'o dia todo');
  });

  it('mais adiante leva o dia da semana e a data do fuso do tenant', () => {
    assert.equal(quando('2026-10-02T17:00:00Z', 'week', SP), 'sex. 02/10 · 14:00');
    assert.equal(quando('2026-10-03T02:59:00Z', 'week', SP), 'sex. 02/10');
  });
});

describe('atraso', () => {
  it('em minutos, em horas, e em dias de calendário', () => {
    assert.equal(atraso('2026-09-25T12:45:00Z', agora, SP), 'há 15 min');
    assert.equal(atraso('2026-09-25T10:00:00Z', agora, SP), 'há 3 h');
    assert.equal(atraso('2026-09-24T20:00:00Z', agora, SP), 'desde ontem');
    assert.equal(atraso('2026-09-22T20:00:00Z', agora, SP), 'há 3 dias');
  });
});
