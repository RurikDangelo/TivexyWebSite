/**
 * CPF e CNPJ.
 *
 * Vive no Core pelo mesmo motivo que `parseCents`: **toda** tela que cadastra
 * alguém — conta de CRM hoje, cliente e fornecedor de ERP depois — precisa da
 * mesma limpeza e da mesma formatação. Uma segunda implementação em algum
 * formulário é a que vai gravar com pontuação, e aí a mesma empresa cadastrada
 * de dois jeitos parece duas.
 *
 * ## O que é gravado, e o que é mostrado
 *
 * Grava-se **só dígito**. Não é preferência de estilo: a coluna exige, em
 * `crm_companies_document_digits`, e há teste contra o Postgres provando que o
 * que sai de `onlyDigits()` entra. A pontuação é do leitor, e quem a repõe na
 * hora de mostrar é `formatDocument()`.
 *
 * ## O dígito verificador não é conferido
 *
 * Está escrito aqui para não ser confundido com validação de verdade:
 * `11111111111` passa. Conferir o dígito é regra que vale a pena e é uma
 * decisão separada — enquanto não for tomada, dizer que existe seria pior do
 * que não ter.
 */

/** Quantos dígitos cada documento tem. */
export const CPF_LENGTH = 11;
export const CNPJ_LENGTH = 14;

/** Só os dígitos. `12.345.678/0001-95` vira `12345678000195`. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * O documento serve? Devolve o motivo, ou `null` quando serve.
 *
 * Texto em vez de booleano, como `checkSettingValue`: quem chama precisa dizer
 * **o que** está errado. "Documento inválido" manda a pessoa adivinhar se o
 * problema é o tamanho, a pontuação ou a letra que escapou.
 *
 * Vazio serve. O documento é opcional em todo lugar onde aparece hoje, e quem
 * cadastra um contato no meio de uma ligação não tem o CNPJ à mão.
 */
export function checkDocument(raw: string): string | null {
  const limpo = raw.trim();
  if (limpo === '') return null;

  const digitos = onlyDigits(limpo);

  /*
   * Recusar antes de olhar o tamanho: `abc` vira string vazia em `onlyDigits`,
   * e sem esta linha a mensagem falaria de quantidade de dígitos para quem não
   * digitou nenhum.
   */
  if (digitos === '') return 'Informe os números do CPF ou do CNPJ.';

  if (digitos.length !== CPF_LENGTH && digitos.length !== CNPJ_LENGTH) {
    return `Informe um CPF (${CPF_LENGTH} dígitos) ou CNPJ (${CNPJ_LENGTH} dígitos).`;
  }

  return null;
}

/**
 * O documento como gente lê: `12.345.678/0001-95`.
 *
 * O que não tem 11 nem 14 dígitos volta como veio. Não é descuido: dado antigo
 * e importação existem, e esconder o valor atrás de uma pontuação inventada é
 * pior do que mostrá-lo torto — quem vê torto vai conferir.
 */
export function formatDocument(digits: string): string {
  if (digits.length === CPF_LENGTH) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (digits.length === CNPJ_LENGTH) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return digits;
}
