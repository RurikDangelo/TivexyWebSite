/**
 * Como números e datas aparecem na tela.
 *
 * Um lugar só: duas telas formatando a mesma data de dois jeitos é o tipo de
 * inconsistência que faz a pessoa desconfiar de que os números também não
 * batem.
 */

const DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const DIA_MES = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * `2026-09-25` → `25/09/2026`.
 *
 * Em UTC de propósito: a data já é de calendário — já está no dia certo. Pôr
 * um fuso aqui faria `2026-09-25` virar 24/09 em qualquer fuso a oeste de
 * Greenwich, que é o Brasil inteiro.
 */
export function formatDate(iso: string): string {
  return DIA_MES_ANO.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** `2026-09-25` → `25 de set.` — para cartão, onde o ano é óbvio. */
export function formatDayMonth(iso: string): string {
  return DIA_MES.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** Um instante, no fuso do tenant: `25/09/2026 14:30`. */
export function formatInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant));
}

/** "1 dia", "3 dias" — o plural que concatenar "s" erra. */
export function dias(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
}

/** Quantidade de itens: "1 item", "4 itens". */
export function contagem(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : plural}`;
}
