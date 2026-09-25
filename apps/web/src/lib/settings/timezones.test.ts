/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkSettingValue, settingDefinition } from '@tivexy/core';

import { offsetLabel, timeZoneOptions } from './timezones.ts';

const agora = new Date('2026-09-25T12:00:00Z');

describe('timeZoneOptions', () => {
  it('todo fuso oferecido é aceito pela configuração do Core', () => {
    const def = settingDefinition('core.timezone');
    assert.ok(def);
    for (const { valor } of timeZoneOptions('America/Sao_Paulo', agora)) {
      assert.equal(checkSettingValue(def, valor), null, valor);
    }
  });

  it('o deslocamento vem do Intl, não de texto fixo', () => {
    assert.equal(offsetLabel('America/Sao_Paulo', agora), 'GMT-3');
    assert.equal(offsetLabel('America/Manaus', agora), 'GMT-4');
  });

  it('um fuso de fora da lista, em uso, continua oferecido — senão salvar trocaria o fuso', () => {
    const opcoes = timeZoneOptions('Europe/Lisbon', agora);
    assert.ok(opcoes.some((o) => o.valor === 'Europe/Lisbon'));
  });
});
