/**
 * O separador de data da conversa — "Hoje", "Ontem", "Quinta-feira".
 *
 * Fica fora de `read.ts` porque é decisão de apresentação e não toca o banco:
 * assim tem teste (`dia.test.ts`) sem precisar de Postgres, e a mesma regra
 * serve ao esqueleto, ao servidor e a qualquer tela futura.
 *
 * O agrupamento por AUTOR é do Core (`groupMessages`). Aqui é só por DIA, e a
 * ordem entre os dois importa: divide-se por dia primeiro, senão um bloco de
 * mensagens seguidas atravessaria a meia-noite e ficaria de um lado só do
 * separador — o que faria a régua "Hoje" aparecer no meio de uma fala de ontem.
 */

import { addDays, dateIn, daysBetween } from '@tivexy/core';

const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });
const DIA_E_MES = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const DIA_MES_E_ANO = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/*
 * UTC de propósito, como em `lib/format.ts`: `dia` já é data de calendário no
 * fuso do tenant — já está no dia certo. Reinterpretá-la em qualquer fuso a
 * oeste de Greenwich, que é o Brasil inteiro, a jogaria para o dia anterior.
 */
function comoData(dia: string): Date {
  return new Date(`${dia.slice(0, 10)}T00:00:00Z`);
}

/**
 * Como a régua de data se lê: `2026-09-26`, hoje `2026-09-26` → "Hoje".
 *
 * Quatro degraus, do mais humano ao mais preciso. O dia da semana só vale para
 * os últimos seis dias — "terça-feira" sem mais nada, para uma terça de três
 * meses atrás, é pior que a data: parece recente e não é.
 *
 * O ano só aparece quando muda. Numa conversa de equipe, "24 de setembro de
 * 2026" no meio de setembro de 2026 é ruído que o olho aprende a pular.
 */
export function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'Hoje';
  if (dia === addDays(hoje, -1)) return 'Ontem';

  const data = comoData(dia);
  const distancia = daysBetween(dia, hoje);

  /* `> 0` exclui o futuro: mensagem adiante no calendário não é "sexta-feira". */
  if (distancia > 0 && distancia < 7) {
    const nome = DIA_DA_SEMANA.format(data);
    return nome.charAt(0).toLocaleUpperCase('pt-BR') + nome.slice(1);
  }

  const mesmoAno = dia.slice(0, 4) === hoje.slice(0, 4);
  return (mesmoAno ? DIA_E_MES : DIA_MES_E_ANO).format(data);
}

/** Um dia de conversa: a data de calendário e o que foi dito nela. */
export interface DiaDeConversa<T> {
  /** `YYYY-MM-DD` no fuso do tenant. Serve de `key` e de `dateTime`. */
  dia: string;
  rotulo: string;
  mensagens: readonly T[];
}

/**
 * Divide mensagens em ordem cronológica crescente por data de calendário.
 *
 * O fuso é o do tenant, não o do navegador: às 22h de São Paulo já é amanhã em
 * UTC, e a mensagem de hoje à noite abriria um separador "Hoje" novo no meio
 * do expediente. Duas pessoas da mesma empresa também veriam réguas em
 * posições diferentes, que é o tipo de divergência que faz desconfiar da tela.
 */
export function dividirPorDia<T extends { criadaEm: string }>(
  mensagens: readonly T[],
  fuso: string,
  hoje: string,
): DiaDeConversa<T>[] {
  const dias: DiaDeConversa<T>[] = [];

  for (const mensagem of mensagens) {
    const dia = dateIn(mensagem.criadaEm, fuso);
    const atual = dias[dias.length - 1];

    if (atual !== undefined && atual.dia === dia) {
      (atual.mensagens as T[]).push(mensagem);
    } else {
      dias.push({ dia, rotulo: rotuloDoDia(dia, hoje), mensagens: [mensagem] });
    }
  }

  return dias;
}
