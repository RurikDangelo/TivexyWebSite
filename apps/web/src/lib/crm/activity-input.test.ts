/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseActivityInput, parseTarget } from './activity-input.ts';

const ID = '6f1f5d2e-9a47-4c1e-8b1a-3f2c4d5e6a7b';
const SP = 'America/Sao_Paulo';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('parseTarget', () => {
  it('cada tipo vai para a sua coluna', () => {
    assert.deepEqual(parseTarget(`contato:${ID}`), {
      tipo: 'contato',
      coluna: 'contact_id',
      id: ID,
    });
    assert.equal(parseTarget(`negocio:${ID}`)?.coluna, 'deal_id');
  });

  it('tipo inventado ou id torto não viram coluna', () => {
    for (const torto of [`tenant:${ID}`, 'contato:x', 'contato', '', `__proto__:${ID}`]) {
      assert.equal(parseTarget(torto), null, torto);
    }
  });
});

describe('parseActivityInput', () => {
  it('dia e hora no fuso do tenant viram o instante certo', () => {
    const r = parseActivityInput(
      form({ assunto: 'Retorno', alvo: `contato:${ID}`, data: '2026-09-25', hora: '14:30' }),
      SP,
    );
    assert.ok(r.ok);
    assert.equal(r.valor.venceEm, '2026-09-25T17:30:00.000Z');
  });

  it('dia sem hora vence no fim do dia, não de manhã', () => {
    const r = parseActivityInput(
      form({ assunto: 'Ligar', alvo: `lead:${ID}`, data: '2026-09-26' }),
      SP,
    );
    assert.ok(r.ok);
    /* 23:59 em São Paulo = 02:59 do dia seguinte em UTC. */
    assert.equal(r.valor.venceEm, '2026-09-27T02:59:00.000Z');
  });

  it('sem dia é sem data', () => {
    const r = parseActivityInput(form({ assunto: 'Ligar', alvo: `lead:${ID}` }), SP);
    assert.ok(r.ok);
    assert.equal(r.valor.venceEm, null);
  });

  it('hora sem dia é pergunta, não meia-noite de 1970', () => {
    const r = parseActivityInput(form({ assunto: 'X', alvo: `lead:${ID}`, hora: '10:00' }), SP);
    assert.ok(!r.ok);
    assert.match(r.campos.data ?? '', /dia/);
  });

  it('sem alvo não passa — o banco exige exatamente um', () => {
    const r = parseActivityInput(form({ assunto: 'X' }), SP);
    assert.ok(!r.ok);
    assert.ok(r.campos.alvo);
  });
});
