/**
 * Como a agenda diz quando uma atividade vence.
 *
 * Calculado no servidor, no fuso do tenant: o navegador de quem olha pode
 * estar em outro fuso, e a consulta das 14h30 de São Paulo não é às 13h30 só
 * porque a pessoa abriu a agenda de Manaus.
 */

import { type AgendaBucket, dateIn, daysBetween, timeIn } from '@tivexy/core';

import { DIA_TODO } from './activity-input.ts';

const SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

function diaCurto(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${SEMANA.format(d)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "14:30", "o dia todo", "sex. 02/10 · 14:30" — conforme a faixa. */
export function quando(dueAt: string, bucket: AgendaBucket, timeZone: string): string {
  const hora = timeIn(dueAt, timeZone);
  const horaTexto = hora === DIA_TODO ? 'o dia todo' : hora;
  if (bucket === 'today' || bucket === 'tomorrow') return horaTexto;
  const dia = diaCurto(dateIn(dueAt, timeZone));
  return hora === DIA_TODO ? dia : `${dia} · ${hora}`;
}

/** "há 3 dias", "há 2 h", "há 15 min" — quanto já passou do vencimento. */
export function atraso(dueAt: string, now: Date, timeZone: string): string {
  const dias = daysBetween(dateIn(dueAt, timeZone), dateIn(now, timeZone));
  if (dias >= 1) return dias === 1 ? 'desde ontem' : `há ${dias} dias`;
  const minutos = Math.max(1, Math.floor((now.getTime() - new Date(dueAt).getTime()) / 60_000));
  return minutos >= 60 ? `há ${Math.floor(minutos / 60)} h` : `há ${minutos} min`;
}
