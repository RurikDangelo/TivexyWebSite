/**
 * O fluxo de caixa previsto, agrupado por semana.
 *
 * Puro de propósito: recebe o dia de hoje como texto e os lançamentos, e
 * devolve as barras. É o que permite testar a virada de semana e o mês que
 * atravessa sem esperar o tempo passar.
 *
 * ## Por que tudo aqui é `YYYY-MM-DD`, e nunca `Date`
 *
 * `due_date` é uma coluna `date`: não tem hora nem fuso, é o dia que alguém
 * escreveu. `new Date('2026-10-10')` é meia-noite **UTC**, e formatar isso em
 * `America/Sao_Paulo` mostra dia 9 — um erro de um dia em todo vencimento.
 *
 * Comparar e agrupar texto `YYYY-MM-DD` funciona porque o formato é ordenável
 * lexicograficamente, que é justamente para isso que ele foi desenhado. Quem
 * decide qual é "hoje" no fuso do cliente é `dayIn()`, no Core.
 */

import type { FinanceEntryKind } from '@tivexy/core';

/** Um lançamento, reduzido ao que o fluxo precisa. */
export interface LancamentoDoFluxo {
  kind: FinanceEntryKind;
  dueDate: string;
  amountCents: number;
}

/** Uma barra do gráfico. */
export interface SemanaDoFluxo {
  /** `YYYY-MM-DD` do primeiro dia da semana. */
  inicio: string;
  fim: string;
  /** `12/10` — curto, porque vira rótulo de eixo. */
  rotulo: string;
  receberCents: number;
  pagarCents: number;
}

/** Soma um dia a uma data `YYYY-MM-DD`, sem passar por fuso. */
function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  /*
   * `Date.UTC` aqui é seguro e não contradiz o comentário do topo: a data
   * entra e sai em UTC, então ela nunca é interpretada num fuso. O que o
   * topo proíbe é misturar — construir em UTC e formatar num fuso local.
   */
  const instante = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias));
  return instante.toISOString().slice(0, 10);
}

/** A segunda-feira da semana de `iso`. */
function segundaDa(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const instante = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1));
  /* `getUTCDay()` é 0 no domingo; a semana comercial começa na segunda. */
  const diaDaSemana = instante.getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return somarDias(iso, -recuo);
}

/** `2026-10-12` vira `12/10`. */
function curta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/**
 * As próximas `quantidade` semanas, a partir da semana de hoje.
 *
 * Semanas fixas, inclusive as vazias. Pular semana sem lançamento faria o
 * eixo mentir sobre o intervalo — duas barras vizinhas pareceriam
 * consecutivas quando há um mês entre elas.
 */
export function semanasDoFluxo(
  hojeISO: string,
  lancamentos: readonly LancamentoDoFluxo[],
  quantidade = 8,
): SemanaDoFluxo[] {
  const primeira = segundaDa(hojeISO);

  const semanas: SemanaDoFluxo[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    const inicio = somarDias(primeira, i * 7);
    const fim = somarDias(inicio, 6);
    semanas.push({ inicio, fim, rotulo: curta(inicio), receberCents: 0, pagarCents: 0 });
  }

  const ultima = semanas[semanas.length - 1];
  if (ultima === undefined) return semanas;

  for (const lancamento of lancamentos) {
    /*
     * O que venceu antes da semana de hoje **entra na primeira barra**, em vez
     * de sumir. Atraso é caixa que ainda vai acontecer, e escondê-lo faria a
     * previsão parecer melhor do que é — que é o pior jeito de errar num
     * gráfico de dinheiro.
     */
    const alvo =
      lancamento.dueDate < primeira
        ? semanas[0]
        : semanas.find((s) => lancamento.dueDate >= s.inicio && lancamento.dueDate <= s.fim);

    /* Depois do horizonte não entra: a barra da última semana somaria o
       futuro inteiro e ficaria absurdamente alta. */
    if (alvo === undefined) continue;

    if (lancamento.kind === 'receivable') alvo.receberCents += lancamento.amountCents;
    else alvo.pagarCents += lancamento.amountCents;
  }

  return semanas;
}

/** O maior valor de qualquer barra — a escala do eixo. */
export function tetoDoFluxo(semanas: readonly SemanaDoFluxo[]): number {
  return semanas.reduce((maior, s) => Math.max(maior, s.receberCents, s.pagarCents), 0);
}
