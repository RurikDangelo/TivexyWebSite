/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseDealInput } from './deal-input.ts';

const ETAPA = '6f1f5d2e-9a47-4c1e-8b1a-3f2c4d5e6a7b';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('parseDealInput', () => {
  it('o mínimo: título e etapa', () => {
    const r = parseDealInput(form({ titulo: '  Implante  ', etapa: ETAPA }));
    assert.ok(r.ok);
    assert.equal(r.valor.titulo, 'Implante');
    assert.equal(r.valor.valorCentavos, 0);
    assert.equal(r.valor.contaId, null);
  });

  it('valor brasileiro vira centavos exatos', () => {
    const r = parseDealInput(form({ titulo: 'X', etapa: ETAPA, valor: '4.500,00' }));
    assert.ok(r.ok);
    assert.equal(r.valor.valorCentavos, 450_000);
  });

  it('valor torto é erro no campo, não zero silencioso', () => {
    const r = parseDealInput(form({ titulo: 'X', etapa: ETAPA, valor: '1.2,3,4' }));
    assert.ok(!r.ok);
    assert.match(r.campos.valor ?? '', /valor/);
  });

  it('diz todos os campos errados de uma vez', () => {
    const r = parseDealInput(form({ titulo: '', etapa: 'nao-e-uuid', previsao: '2026-02-30' }));
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.campos).sort(), ['etapa', 'previsao', 'titulo']);
  });

  it('id opcional com formato torto não chega ao banco', () => {
    const r = parseDealInput(
      form({ titulo: 'X', etapa: ETAPA, conta: "'; drop table crm_deals; --" }),
    );
    assert.ok(r.ok);
    assert.equal(r.valor.contaId, null);
  });

  it('título longo demais é recusado com o limite', () => {
    const r = parseDealInput(form({ titulo: 'a'.repeat(201), etapa: ETAPA }));
    assert.ok(!r.ok);
    assert.match(r.campos.titulo ?? '', /200/);
  });
});
