/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { agruparPorSemana, segundaDaSemana, vencimentoEmTexto } from './finance-text.ts';

describe('vencimentoEmTexto', () => {
  it('diz o vencimento do jeito que se fala', () => {
    const hoje = '2026-09-25';
    assert.equal(vencimentoEmTexto('2026-09-25', hoje), 'vence hoje');
    assert.equal(vencimentoEmTexto('2026-09-26', hoje), 'vence amanhã');
    assert.equal(vencimentoEmTexto('2026-09-24', hoje), 'venceu ontem');
    assert.equal(vencimentoEmTexto('2026-09-20', hoje), 'venceu há 5 dias');
    assert.equal(vencimentoEmTexto('2026-10-25', hoje), 'vence em 30 dias');
  });

  it('atravessa a virada do mês e do ano sem erro de fuso', () => {
    assert.equal(vencimentoEmTexto('2027-01-01', '2026-12-31'), 'vence amanhã');
  });
});

describe('segundaDaSemana', () => {
  it('segunda é o começo; domingo é o fim da semana anterior', () => {
    assert.equal(segundaDaSemana('2026-09-21'), '2026-09-21'); // segunda
    assert.equal(segundaDaSemana('2026-09-25'), '2026-09-21'); // sexta
    assert.equal(segundaDaSemana('2026-09-27'), '2026-09-21'); // domingo
    assert.equal(segundaDaSemana('2026-09-28'), '2026-09-28');
  });
});

describe('agruparPorSemana', () => {
  const dia = (d: string, recebido = 0, pago = 0, aReceber = 0, aPagar = 0) => ({
    dia: d,
    recebido,
    pago,
    aReceber,
    aPagar,
  });

  it('soma segunda a domingo e marca a semana de hoje', () => {
    const semanas = agruparPorSemana(
      [
        dia('2026-09-20', 100), // domingo: semana anterior
        dia('2026-09-21', 10, 5),
        dia('2026-09-25', 20, 0, 300),
        dia('2026-09-27', 0, 0, 0, 40),
        dia('2026-09-28', 0, 0, 50),
      ],
      '2026-09-25',
    );
    assert.deepEqual(
      semanas.map((s) => [s.inicio, s.recebido, s.pago, s.aReceber, s.aPagar, s.atual]),
      [
        ['2026-09-14', 100, 0, 0, 0, false],
        ['2026-09-21', 30, 5, 300, 40, true],
        ['2026-09-28', 0, 0, 50, 0, false],
      ],
    );
  });
});
