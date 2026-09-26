/**
 * O erro do chat, traduzido para quem está na tela.
 *
 * Existe aqui, e não em `lib/db-errors.ts`, por duas razões:
 *
 *   1. as frases são do módulo, e o arquivo central já cresceu para 40 padrões
 *      — cada módulo novo empurrando uma lista compartilhada é como ela vira
 *      um lugar que ninguém ousa mexer;
 *   2. `chat_channel_visible()` responde "não existe" para canal restrito que
 *      a pessoa não alcança, e isso chega como `no_data_found` (SQLSTATE
 *      P0002), que o tradutor genérico não conhece — ele devolveria "não
 *      consegui salvar agora", que é falso: o pedido foi entendido e recusado.
 *
 * O fallback continua sendo `dbErrorMessage`: o que não é do chat é de
 * infraestrutura, e a tradução disso já está resolvida em um lugar só.
 */

import { type DbError, dbErrorMessage } from '../db-errors.ts';

/**
 * As frases que as funções `chat_*` levantam, reconhecidas pelo começo.
 *
 * Elas já vêm escritas para gente — foram escritas assim de propósito no SQL —
 * então o trabalho aqui é deixá-las passar, não reescrevê-las. O que não casa
 * é nome de constraint, de tabela ou de coluna, e isso não vai para a tela.
 */
const ESCRITAS_PARA_GENTE: readonly RegExp[] = [
  /^o canal /,
  /^canal não encontrado/,
  /^já existe um canal /,
  /^você não pode /,
  /^você não participa /,
  /^essa pessoa /,
  /^a mensagem /,
  /^mensagem não encontrada/,
  /^mensagem apagada /,
  /^só quem escreveu /,
  /^a janela de edição /,
  /^não dá para mencionar /,
];

function frase(texto: string): string {
  const limpo = texto.replace(/^error:\s*/i, '').trim();
  const comMaiuscula = limpo.charAt(0).toLocaleUpperCase('pt-BR') + limpo.slice(1);
  return /[.!?]$/.test(comMaiuscula) ? comMaiuscula : `${comMaiuscula}.`;
}

/**
 * O que a tela mostra quando uma função do chat recusa.
 *
 * `repetido` tem padrão próprio porque a única violação de unicidade possível
 * aqui é o nome do canal — a mensagem genérica ("já existe um cadastro igual")
 * não diria o que fazer, que é escolher outro nome.
 */
export function mensagemDeErroDoChat(
  erro: DbError,
  repetido = 'Já existe um canal com esse nome nesta empresa.',
): string {
  const mensagem = (erro.message ?? '').replace(/^error:\s*/i, '').trim();

  if (ESCRITAS_PARA_GENTE.some((padrao) => padrao.test(mensagem))) return frase(mensagem);

  /*
   * P0002 é o `no_data_found` que as funções levantam para canal e mensagem
   * que a pessoa não alcança. A frase é deliberadamente a mesma para "não
   * existe" e para "existe e é restrito": dizer "sem permissão" confirmaria a
   * existência de um canal privado para quem só chutou o endereço.
   */
  if (erro.code === 'P0002') return 'Não encontrei isso — ou ele não existe, ou não é seu.';

  /* O corpo maior que 4000 chega como truncamento de texto. */
  if (erro.code === '22001') return 'A mensagem é longa demais. O limite é de 4.000 caracteres.';

  return dbErrorMessage(erro, repetido);
}
