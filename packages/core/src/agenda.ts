/**
 * A agenda: em que faixa cai cada atividade.
 *
 * "Atrasada" é por instante, não por dia. A consulta das 9h que não foi feita
 * está atrasada às 10h do mesmo dia — dizer "hoje" para ela esconderia o
 * atraso até a meia-noite. As outras faixas são por **dia do tenant**:
 * "amanhã" em São Paulo às 22h não é o amanhã de UTC.
 */

import { addDays, dateIn } from './calendar.ts';

export const AGENDA_BUCKETS = ['overdue', 'today', 'tomorrow', 'week', 'later', 'undated'] as const;

export type AgendaBucket = (typeof AGENDA_BUCKETS)[number];

/**
 * A faixa de uma atividade **pendente**. Feita não entra aqui — ela sai da
 * agenda, e quem mostra as feitas é outra lista.
 */
export function agendaBucket(dueAt: string | null, now: Date, timeZone: string): AgendaBucket {
  if (dueAt === null) return 'undated';
  const vence = new Date(dueAt);
  if (vence.getTime() < now.getTime()) return 'overdue';

  const hoje = dateIn(now, timeZone);
  const dia = dateIn(vence, timeZone);
  if (dia === hoje) return 'today';
  if (dia === addDays(hoje, 1)) return 'tomorrow';
  if (dia <= addDays(hoje, 7)) return 'week';
  return 'later';
}

/** Agrupa na ordem da agenda. Toda faixa aparece, vazia ou não. */
export function groupByBucket<T extends { dueAt: string | null }>(
  itens: readonly T[],
  now: Date,
  timeZone: string,
): Record<AgendaBucket, T[]> {
  const grupos = Object.fromEntries(AGENDA_BUCKETS.map((b) => [b, [] as T[]])) as Record<
    AgendaBucket,
    T[]
  >;
  for (const item of itens) grupos[agendaBucket(item.dueAt, now, timeZone)].push(item);
  return grupos;
}
