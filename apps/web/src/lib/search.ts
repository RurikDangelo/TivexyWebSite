/**
 * O termo de busca, pronto para um filtro `ilike` do PostgREST.
 *
 * O filtro `or=(name.ilike.*x*,email.ilike.*x*)` tem sintaxe própria: vírgula
 * separa condições, parêntese agrupa, aspas delimitam. Um termo com vírgula
 * vindo do campo de busca quebraria o filtro — ou pior, acrescentaria uma
 * condição que ninguém escreveu. Então o que é sintaxe sai do termo, junto
 * com os curingas do `like`, e o que sobra é texto para procurar.
 *
 * Devolve `null` quando não sobra nada: busca vazia não filtra.
 */
export function ilikeTerm(bruto: string | string[] | undefined | null): string | null {
  const texto = Array.isArray(bruto) ? (bruto[0] ?? '') : (bruto ?? '');
  const limpo = texto
    .replace(/[,()"'\\*%_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return limpo === '' ? null : `*${limpo}*`;
}

/** A página pedida no endereço, a partir de 1. Qualquer coisa torta é a primeira. */
export function paginaPedida(bruto: string | string[] | undefined): number {
  const texto = Array.isArray(bruto) ? bruto[0] : bruto;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}
