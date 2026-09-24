/**
 * Leitura e conferência dos formulários do CRM.
 *
 * Puro de propósito — sem `server-only`, sem Supabase, sem `FormData` do
 * navegador além do que a plataforma já dá. É o que permite testar cada regra
 * aqui embaixo sem subir Next nem banco.
 *
 * ## Isto não é a garantia, é a mensagem
 *
 * O banco já recusa nome em branco (`crm_*_name_not_blank`) e documento com
 * letra (`crm_companies_document_digits`). O que ele **não** faz é dizer a
 * quem preencheu qual campo consertar: uma violação de constraint chega como
 * `23514` e o nome de uma regra em inglês. Estas funções existem para a
 * mensagem. Se alguém apagar este arquivo, os dados continuam íntegros e a
 * experiência fica péssima — que é a divisão certa.
 */

import { checkDocument, formatDocument, onlyDigits } from '@tivexy/core';

/**
 * CPF, CNPJ e limpeza de dígitos vêm do Core, onde vive a regra.
 *
 * O ERP vai cadastrar cliente e fornecedor com os mesmos documentos, e uma
 * segunda implementação aqui seria a que grava com pontuação. Ver
 * `packages/core/src/documento.ts`, que também explica por que o dígito
 * verificador não é conferido.
 */
export {
  checkDocument as conferirDocumento,
  formatDocument as formatarDocumento,
  onlyDigits as soDigitos,
};

/** O valor de um campo, sem espaço nas pontas. Ausente vira `''`. */
export function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * O valor, ou `null` quando vazio.
 *
 * A diferença entre `null` e `''` importa numa coluna opcional: `''` é um
 * valor, conta como preenchido, entra em índice único de e-mail e faz dois
 * contatos sem e-mail colidirem. `null` é ausência, e é o que a coluna espera.
 */
export function opcional(form: FormData, campo: string): string | null {
  const valor = texto(form, campo);
  return valor === '' ? null : valor;
}

/**
 * Um e-mail aceitável, ou o motivo.
 *
 * A expressão é frouxa de propósito. Validar e-mail "direito" é a RFC 5322
 * inteira, e toda tentativa de apertar a regra acaba recusando endereço
 * legítimo — apóstrofo, sinal de mais, domínio novo. O que se quer aqui é
 * pegar o erro de digitação óbvio; quem confirma que o endereço existe é o
 * e-mail que chega nele.
 */
export function conferirEmail(valor: string): string | null {
  if (valor === '') return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor) ? null : 'Não parece um e-mail.';
}

/** Um telefone plausível, ou o motivo. */
export function conferirTelefone(valor: string): string | null {
  if (valor === '') return null;
  return onlyDigits(valor).length >= 8 ? null : 'Curto demais para um telefone.';
}

/** Um endereço de site plausível, ou o motivo. */
export function conferirSite(valor: string): string | null {
  if (valor === '') return null;

  /*
   * Quem digita `tivexy.com.br` está certo, e exigir `https://` seria pedir
   * que a pessoa saiba o que é esquema de URL. O que se recusa é o que não
   * tem ponto nenhum — aí é engano, não abreviação.
   */
  const semEsquema = valor.replace(/^https?:\/\//i, '');
  return /^[^\s./]+(\.[^\s./]+)+(\/\S*)?$/.test(semEsquema) ? null : 'Não parece um endereço.';
}

/**
 * O que traduzir de um erro do PostgREST para quem está na tela.
 *
 * `42501` é negação do RLS — a pessoa não tem a permissão de escrita. É o
 * único código que vale traduzir: os outros são de infraestrutura ou de
 * constraint, e inventar texto amigável para eles esconderia defeito nosso.
 */
export function mensagemDeErro(
  erro: { code?: string; message: string },
  semPermissao: string,
): string {
  return erro.code === '42501' ? semPermissao : `Não consegui salvar: ${erro.message}`;
}
