/**
 * O que é da plataforma, e não de um tenant.
 *
 * O Admin olha todas as empresas ao mesmo tempo, então não existe "o fuso do
 * cliente" para formatar uma lista: o relógio de referência é o da operação.
 */

export const FUSO_DA_PLATAFORMA = 'America/Sao_Paulo';

/*
 * `formatDate()` de `lib/format` corta a string em 10 caracteres e lê em UTC —
 * o certo para uma data de calendário (`2026-09-25` é 25/09 em qualquer lugar),
 * e o errado para um instante: um cliente criado às 22h de Brasília tem
 * `created_at` já no dia seguinte em UTC e apareceria criado amanhã.
 */
const DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: FUSO_DA_PLATAFORMA,
});

/** Um instante (`created_at`) como data curta no relógio da plataforma. */
export function dataDaPlataforma(instante: string): string {
  return DIA_MES_ANO.format(new Date(instante));
}
