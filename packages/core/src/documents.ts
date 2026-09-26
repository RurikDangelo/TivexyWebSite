/**
 * CPF e CNPJ — o que é, e se é de verdade.
 *
 * ## O CNPJ tem letra desde julho de 2026
 *
 * A IN RFB nº 2.229/2024 tornou o CNPJ alfanumérico: as doze primeiras
 * posições aceitam letra maiúscula, e os dois dígitos verificadores continuam
 * números. O cálculo segue sendo módulo 11, com cada caractere valendo o
 * código ASCII menos 48 — `0` vale 0, `9` vale 9, `A` vale 17.
 *
 * Um sistema que aceita só dígito recusa **toda empresa aberta a partir de
 * julho de 2026**, e o esquema do Tivexy recusava: `tenants.document` e
 * `crm_companies.document` tinham `^[0-9]+$`. A regra daqui e a do banco são
 * a mesma, e o teste de contratos confere.
 *
 * ## O que se guarda
 *
 * Só os caracteres que contam, sem pontuação e em maiúscula:
 * `12.ABC.345/01DE-35` vira `12ABC34501DE35`. Formatar é da interface.
 */

export type DocumentKind = 'cpf' | 'cnpj';

export type DocumentCheck =
  { ok: true; value: string; kind: DocumentKind } | { ok: false; error: string };

/**
 * A forma que o banco aceita, escrita igual à constraint.
 *
 * CPF: 11 dígitos. CNPJ: 12 posições alfanuméricas e 2 dígitos. O teste de
 * contratos compara esta expressão com a do banco.
 */
export const DOCUMENT_PATTERN = '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$';

/** Tira pontuação e espaço, e sobe para maiúscula. Não valida. */
export function normalizeDocument(raw: string): string {
  return raw.toUpperCase().replace(/[\s./-]/g, '');
}

/** O valor de um caractere no cálculo do dígito: ASCII menos 48. */
const valor = (c: string) => c.charCodeAt(0) - 48;

function digito(base: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += valor(base[i]!) * pesos[i]!;
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CPF com os dígitos verificadores certos. Onze dígitos iguais não valem. */
export function isValidCpf(value: string): boolean {
  if (!/^[0-9]{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const d1 = digito(value.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(value.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return value.endsWith(`${d1}${d2}`);
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * CNPJ — numérico ou alfanumérico — com os dígitos certos.
 *
 * O mesmo cálculo serve para os dois: um CNPJ só de números é o caso em que
 * todo caractere vale ele mesmo, e o resultado é o de sempre.
 */
export function isValidCnpj(value: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(value) || /^(.)\1{13}$/.test(value)) return false;
  const d1 = digito(value.slice(0, 12), PESOS_CNPJ_1);
  const d2 = digito(value.slice(0, 13), PESOS_CNPJ_2);
  return value.endsWith(`${d1}${d2}`);
}

/**
 * Confere um CPF ou CNPJ digitado e devolve o que guardar.
 *
 * O tipo sai do tamanho: 11 é CPF, 14 é CNPJ. A mensagem diz o que está
 * errado — "confira os dígitos" resolve; "documento inválido" manda a pessoa
 * adivinhar.
 */
export function checkDocument(raw: string): DocumentCheck {
  const value = normalizeDocument(raw);
  if (value.length === 11) {
    return isValidCpf(value)
      ? { ok: true, value, kind: 'cpf' }
      : { ok: false, error: 'CPF com dígito verificador errado. Confira os números.' };
  }
  if (value.length === 14) {
    return isValidCnpj(value)
      ? { ok: true, value, kind: 'cnpj' }
      : { ok: false, error: 'CNPJ com dígito verificador errado. Confira os caracteres.' };
  }
  return { ok: false, error: 'Use um CPF (11 dígitos) ou um CNPJ (14 caracteres).' };
}

/** `52998224725` → `529.982.247-25`; `12ABC34501DE35` → `12.ABC.345/01DE-35`. */
export function formatDocument(value: string): string {
  if (value.length === 11) {
    return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
  }
  if (value.length === 14) {
    return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}`;
  }
  return value;
}
