/**
 * Onde cada atividade cai na agenda.
 *
 * Puro de propósito — recebe o agora e o fuso em vez de perguntar ao relógio.
 * É o que permite testar "atrasada" sem esperar o tempo passar, e o que
 * impede a classificação de depender do fuso do servidor, que na Vercel é
 * UTC e não tem relação nenhuma com o expediente do cliente.
 */

import { calendarDaysBetween } from '@tivexy/core';

/**
 * As faixas da agenda.
 *
 * `atrasada` existe separada de `proxima` porque é a única que pede ação
 * hoje. Misturar as duas numa lista ordenada por data funciona e esconde o
 * que importa: a de anteontem fica com a mesma cara da de semana que vem.
 */
export type Faixa = 'atrasada' | 'hoje' | 'proxima' | 'sem-prazo' | 'concluida';

/** A ordem em que a tela mostra as seções. O que pede ação vem primeiro. */
export const FAIXAS: readonly Faixa[] = [
  'atrasada',
  'hoje',
  'proxima',
  'sem-prazo',
  'concluida',
] as const;

export const FAIXA_TITULO: Record<Faixa, string> = {
  atrasada: 'Atrasadas',
  hoje: 'Hoje',
  proxima: 'Próximas',
  'sem-prazo': 'Sem prazo',
  concluida: 'Concluídas',
};

export const FAIXA_TOM: Record<Faixa, 'neutral' | 'brand' | 'success' | 'danger'> = {
  atrasada: 'danger',
  hoje: 'brand',
  proxima: 'neutral',
  'sem-prazo': 'neutral',
  concluida: 'success',
};

/**
 * Em que faixa esta atividade está.
 *
 * ## Concluída ganha de tudo
 *
 * Uma atividade concluída ontem com prazo de anteontem **não** é atrasada. Ela
 * foi feita. Manter no vermelho o que já foi resolvido treina quem usa a
 * ignorar o vermelho, e aí o alerta deixa de funcionar para o que importa.
 *
 * ## "Hoje" é dia de calendário, não 24 horas
 *
 * Uma atividade marcada para hoje às 09:00, olhada às 18:00, continua sendo
 * de hoje — atrasada, mas de hoje. E o que vence às 23:00 de hoje não é
 * "amanhã" só porque faltam menos de 24 horas. Quem responde isso é
 * `calendarDaysBetween`, no fuso do tenant.
 *
 * O que já passou **da hora** hoje conta como atrasada: às 18:00, a reunião
 * das 09:00 pede ação, não paciência.
 */
export function faixaDe(
  dueAt: Date | null,
  doneAt: Date | null,
  agora: Date,
  timeZone: string,
): Faixa {
  if (doneAt !== null) return 'concluida';
  if (dueAt === null) return 'sem-prazo';

  const dias = calendarDaysBetween(agora, dueAt, timeZone);

  if (dias < 0) return 'atrasada';
  if (dias > 0) return 'proxima';

  /* Mesmo dia: a hora decide entre "ainda dá" e "já passou". */
  return dueAt.getTime() < agora.getTime() ? 'atrasada' : 'hoje';
}

/** Lê o que veio do banco como `timestamptz`, ou `null` se não veio. */
export function instante(bruto: unknown): Date | null {
  if (typeof bruto !== 'string' || bruto === '') return null;
  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}
