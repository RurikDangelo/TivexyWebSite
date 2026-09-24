/**
 * Testes do fluxo de caixa por semana.
 *
 * Três coisas importam aqui, e todas são sobre **não mentir num gráfico de
 * dinheiro**: o atrasado não some, o que está fora do horizonte não infla a
 * última barra, e semana vazia continua no eixo.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type LancamentoDoFluxo, semanasDoFluxo, tetoDoFluxo } from './fluxo.ts';

/** 2026-09-24 é uma quinta-feira; a segunda daquela semana é 2026-09-21. */
const HOJE = '2026-09-24';

function receber(dueDate: string, reais: number): LancamentoDoFluxo {
  return { kind: 'receivable', dueDate, amountCents: reais * 100 };
}
function pagar(dueDate: string, reais: number): LancamentoDoFluxo {
  return { kind: 'payable', dueDate, amountCents: reais * 100 };
}

describe('as semanas', () => {
  it('começam na segunda da semana de hoje', () => {
    const [primeira] = semanasDoFluxo(HOJE, []);
    assert.equal(primeira?.inicio, '2026-09-21');
    assert.equal(primeira?.fim, '2026-09-27');
    assert.equal(primeira?.rotulo, '21/09');
  });

  it('domingo pertence à semana que começou na segunda anterior', () => {
    // `getUTCDay()` é 0 no domingo, e a semana comercial começa na segunda —
    // sem tratar isso, todo domingo abriria uma semana própria.
    const [primeira] = semanasDoFluxo('2026-09-27', []);
    assert.equal(primeira?.inicio, '2026-09-21');
  });

  it('são sempre a mesma quantidade, inclusive as vazias', () => {
    /*
     * Pular semana sem lançamento faria o eixo mentir sobre o intervalo: duas
     * barras vizinhas pareceriam consecutivas com um mês entre elas.
     */
    const semanas = semanasDoFluxo(HOJE, [receber('2026-11-10', 100)], 8);
    assert.equal(semanas.length, 8);
    assert.equal(semanas.filter((s) => s.receberCents === 0 && s.pagarCents === 0).length, 7);
  });

  it('atravessam a virada do mês sem pular dia', () => {
    const semanas = semanasDoFluxo(HOJE, [], 3);
    assert.deepEqual(
      semanas.map((s) => s.inicio),
      ['2026-09-21', '2026-09-28', '2026-10-05'],
    );
  });
});

describe('onde cada lançamento cai', () => {
  it('receber e pagar vão para colunas diferentes da mesma semana', () => {
    const semanas = semanasDoFluxo(HOJE, [receber('2026-09-25', 500), pagar('2026-09-26', 200)]);
    assert.equal(semanas[0]?.receberCents, 50000);
    assert.equal(semanas[0]?.pagarCents, 20000);
  });

  it('o atrasado entra na primeira barra, em vez de sumir', () => {
    /*
     * O teste que mais importa. Atraso é caixa que ainda vai acontecer, e
     * escondê-lo faria a previsão parecer melhor do que é — o pior jeito de
     * errar num gráfico de dinheiro.
     */
    const semanas = semanasDoFluxo(HOJE, [receber('2026-08-01', 1000)]);
    assert.equal(semanas[0]?.receberCents, 100000);
  });

  it('o que vence depois do horizonte não infla a última barra', () => {
    // Somar o futuro inteiro na última semana produziria uma barra absurda
    // que esmagaria todas as outras na escala.
    const semanas = semanasDoFluxo(HOJE, [receber('2027-06-01', 999999)], 8);
    assert.equal(
      semanas.reduce((soma, s) => soma + s.receberCents, 0),
      0,
    );
  });

  it('a borda da semana é inclusiva dos dois lados', () => {
    const semanas = semanasDoFluxo(HOJE, [receber('2026-09-21', 10), receber('2026-09-27', 10)]);
    assert.equal(semanas[0]?.receberCents, 2000);
    assert.equal(semanas[1]?.receberCents, 0);
  });

  it('o primeiro dia da semana seguinte cai na semana seguinte', () => {
    const semanas = semanasDoFluxo(HOJE, [receber('2026-09-28', 10)]);
    assert.equal(semanas[0]?.receberCents, 0);
    assert.equal(semanas[1]?.receberCents, 1000);
  });
});

describe('tetoDoFluxo', () => {
  it('é o maior valor de qualquer barra, não a soma', () => {
    // A escala é por barra: somar receber e pagar daria um teto que nenhuma
    // barra alcança, e todas ficariam achatadas na metade de baixo.
    const semanas = semanasDoFluxo(HOJE, [receber('2026-09-25', 300), pagar('2026-09-25', 500)]);
    assert.equal(tetoDoFluxo(semanas), 50000);
  });

  it('sem lançamento nenhum é zero', () => {
    assert.equal(tetoDoFluxo(semanasDoFluxo(HOJE, [])), 0);
  });
});
