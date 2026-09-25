/**
 * Como o financeiro se escreve na tela: vencimentos e semanas do fluxo.
 *
 * Datas são dias de calendário do tenant (`YYYY-MM-DD`), e a conta é a de
 * `daysBetween` — nunca subtração de `Date`, que erra no horário de verão.
 */

import { type FinanceStatus, addDays, daysBetween } from '@tivexy/core';

/** "venceu há 3 dias", "vence hoje", "vence amanhã", "vence em 5 dias". */
export function vencimentoEmTexto(vencimento: string, hoje: string): string {
  const dias = daysBetween(hoje, vencimento);
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias === -1) return 'venceu ontem';
  if (dias < 0) return `venceu há ${-dias} dias`;
  return `vence em ${dias} dias`;
}

/** O tom de cada situação — sempre com o rótulo escrito ao lado. */
export const TOM_DA_SITUACAO: Readonly<
  Record<FinanceStatus, 'success' | 'neutral' | 'warning' | 'danger'>
> = {
  paid: 'success',
  open: 'neutral',
  overdue: 'danger',
  cancelled: 'neutral',
};

export interface DiaDoFluxo {
  dia: string;
  recebido: number;
  pago: number;
  aReceber: number;
  aPagar: number;
}

export interface SemanaDoFluxo {
  /** A segunda-feira que abre a semana. */
  inicio: string;
  recebido: number;
  pago: number;
  aReceber: number;
  aPagar: number;
  /** A semana que contém hoje: o marcador do gráfico. */
  atual: boolean;
}

/** A segunda-feira da semana de um dia de calendário. */
export function segundaDaSemana(dia: string): string {
  const semana = new Date(`${dia}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const desde = semana === 0 ? 6 : semana - 1;
  return addDays(dia, -desde);
}

/**
 * Os dias do fluxo, somados por semana (segunda a domingo).
 *
 * Sessenta barras diárias num celular de 375 px viram riscos; nove semanas
 * cabem, e cada uma ainda separa o que entrou do que vai entrar.
 */
export function agruparPorSemana(dias: readonly DiaDoFluxo[], hoje: string): SemanaDoFluxo[] {
  const semanas = new Map<string, SemanaDoFluxo>();
  const atual = segundaDaSemana(hoje);
  for (const d of dias) {
    const inicio = segundaDaSemana(d.dia);
    const s = semanas.get(inicio) ?? {
      inicio,
      recebido: 0,
      pago: 0,
      aReceber: 0,
      aPagar: 0,
      atual: inicio === atual,
    };
    s.recebido += d.recebido;
    s.pago += d.pago;
    s.aReceber += d.aReceber;
    s.aPagar += d.aPagar;
    semanas.set(inicio, s);
  }
  return [...semanas.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}
