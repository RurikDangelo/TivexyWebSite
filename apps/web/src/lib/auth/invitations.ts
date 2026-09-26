/**
 * O que a tela de convite mostra, decidido fora dela.
 *
 * `/convite` recebe quem o `member` negou por `membership-inactive` — e esse
 * motivo junta dois casos opostos: o convite que ainda não foi aceito e o
 * acesso que foi suspenso. Um pede um botão; o outro pede que a pessoa fale
 * com quem administra. Mostrar "aceite o convite" para quem foi suspenso é
 * oferecer uma saída que a função do banco vai recusar.
 */

import type { TenantOption } from './active-tenant.ts';

export interface InvitationView {
  /** Convites à espera, a empresa da requisição primeiro. */
  pendentes: readonly TenantOption[];
  /** Vínculos suspensos. Não há o que aceitar; há com quem falar. */
  suspensos: readonly TenantOption[];
}

/**
 * Separa as empresas desta pessoa em convite e suspensão.
 *
 * A empresa da requisição vem primeiro porque é a que a pessoa tentou abrir —
 * quem chegou por `acme.tivexy.com.br` quer aceitar a Acme, não a primeira em
 * ordem alfabética. Empresa cancelada não entra: a função recusaria, e um
 * botão que só serve para dar erro é pior do que nenhum.
 */
export function invitationsOf(
  options: readonly TenantOption[],
  atual: string | null,
): InvitationView {
  const primeiroAtual = (a: TenantOption, b: TenantOption) =>
    Number(b.id === atual) - Number(a.id === atual);

  const vivas = options.filter((o) => o.status !== 'cancelled');
  return {
    pendentes: vivas.filter((o) => o.membership === 'invited').sort(primeiroAtual),
    suspensos: vivas.filter((o) => o.membership === 'suspended').sort(primeiroAtual),
  };
}

/**
 * As mensagens que `accept_invitation()` escreve para gente.
 *
 * Repassar a mensagem do banco é melhor que um texto genérico — mas só as que
 * foram escritas para isso. Erro de infraestrutura não vai para a tela: ele
 * diria à pessoa algo sobre o servidor que ela não tem como resolver.
 */
const DO_BANCO = [
  'convite não encontrado',
  'suspenso',
  'não está mais ativa',
  'entre na sua conta',
] as const;

export function acceptErrorMessage(mensagem: string | null | undefined): string {
  const limpa = (mensagem ?? '').replace(/^error:\s*/i, '').trim();
  if (limpa !== '' && DO_BANCO.some((trecho) => limpa.includes(trecho))) {
    return limpa.charAt(0).toLocaleUpperCase('pt-BR') + limpa.slice(1) + '.';
  }
  return 'Não consegui aceitar agora. Tente de novo em instantes.';
}
