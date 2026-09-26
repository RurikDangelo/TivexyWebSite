/**
 * O erro do banco, traduzido para quem está na tela.
 *
 * As funções e gatilhos do Tivexy levantam mensagens escritas para gente —
 * "a etapa "Proposta" tem oportunidades; mova-as antes" — e essas devem
 * chegar. O resto é infraestrutura: nome de constraint, de tabela, de coluna.
 * Isso não ajuda quem usa e conta demais sobre o esquema a quem não devia.
 */

export interface DbError {
  code?: string | null;
  message?: string | null;
}

/** Frases levantadas pelo próprio esquema, reconhecidas pelo começo. */
const ESCRITAS_PARA_GENTE = [
  /^a etapa /,
  /^o lead /,
  /^o produto /,
  /^a venda /,
  /^a conta /,
  /^o título /,
  /^o estoque /,
  /^a automação /,
  /^funil não encontrado/,
  /^etapa não encontrada/,
  /^lead não encontrado/,
  /^você não tem permissão/,
  /^você não pode /,
  /^converter cria/,
  /^convite não encontrado/,
  /^seu acesso /,
  /^a empresa /,
  /^o valor /,
  /^a quantidade /,
  /^o pagamento /,
  // ERP — as mensagens dos gatilhos e funções de 20260925070000 em diante.
  /^"[^"]+" (está desativad[ao]|se vende por|se conta por|não controla estoque)/,
  /^(produto|venda|cliente|forma de pagamento) não encontrad[ao]/,
  /^esta empresa exige /,
  /^os (itens|pagamentos) /,
  /^o desconto /,
  /^quantidade precisa /,
  /^diga o motivo/,
  /^(este )?lançamento /,
  /^a data do pagamento /,
  /^a contagem /,
  // Admin — 20260925140000.
  /^só o Super Admin /,
  /^empresa (não encontrada|em provisionamento|cancelada)/,
  /^por aqui /,
  /^suspender pede /,
  /^o motivo /,
  /^plano desconhecido/,
];

function frase(texto: string): string {
  const limpo = texto.replace(/^error:\s*/i, '').trim();
  const comMaiuscula = limpo.charAt(0).toLocaleUpperCase('pt-BR') + limpo.slice(1);
  return /[.!?]$/.test(comMaiuscula) ? comMaiuscula : `${comMaiuscula}.`;
}

export function dbErrorMessage(erro: DbError, repetido = 'Já existe um cadastro igual.'): string {
  const mensagem = (erro.message ?? '').replace(/^error:\s*/i, '').trim();

  if (ESCRITAS_PARA_GENTE.some((padrao) => padrao.test(mensagem))) return frase(mensagem);

  switch (erro.code) {
    case '42501':
      return 'Você não tem permissão para fazer isso aqui.';
    case '23505':
      return repetido;
    case '23503':
      return 'Há outros registros ligados a este. Desfaça a ligação antes.';
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
      return 'Algum valor não passou na conferência do banco. Revise os campos.';
    default:
      return 'Não consegui salvar agora. Tente de novo em instantes.';
  }
}
