/**
 * O que a pessoa lê quando é negada.
 *
 * `decideAccess` devolve um `DenialReason` — `module-disabled`,
 * `missing-permission`. Isso serve para o código decidir; não serve para
 * ninguém ler. Esta é a tradução, e ela importa mais do que parece: a diferença
 * entre "sua empresa não contratou este módulo" e "você não tem permissão para
 * isto" é a diferença entre a pessoa falar com o comercial ou com o
 * administrador da própria empresa. Texto genérico de acesso negado transfere
 * esse trabalho de triagem para o suporte.
 *
 * Duas regras que o teste garante:
 *
 *   1. Todo motivo tem texto. O `Record` completo faz o TypeScript recusar um
 *      motivo novo sem tradução — e o teste pega o caso de alguém preencher
 *      com string vazia só para compilar.
 *   2. Nenhum texto diz o que existe do outro lado. "Você não tem permissão
 *      para ver os leads da Acme" confirma que a Acme existe e tem leads.
 */

import type { DenialReason } from '@tivexy/core';

export interface DenialCopy {
  /** Cabeçalho. Direto, sem "Ops!" nem ponto de exclamação. */
  title: string;
  /** O que aconteceu e por quê, em uma ou duas frases. */
  description: string;
  /** O próximo passo de quem está lendo — quem procurar, não o que clicar. */
  nextStep: string;
}

const COPY: Record<DenialReason, DenialCopy> = {
  unauthenticated: {
    title: 'Sessão encerrada',
    description: 'Sua sessão expirou ou você ainda não entrou.',
    nextStep: 'Entre de novo para continuar de onde parou.',
  },
  'no-tenant': {
    title: 'Nenhuma empresa vinculada',
    description: 'Sua conta existe, mas ainda não está ligada a nenhuma empresa.',
    nextStep: 'Se você recebeu um convite, abra o link do e-mail. Se não, fale com quem contratou.',
  },
  'membership-inactive': {
    title: 'Convite pendente',
    description: 'Seu acesso a esta empresa ainda não foi ativado.',
    nextStep: 'Aceite o convite para ativar. Se ele expirou, peça um novo ao administrador.',
  },
  'tenant-not-operational': {
    title: 'Empresa indisponível',
    description: 'Esta empresa não está operando no momento.',
    nextStep: 'Fale com o administrador da empresa — ele consegue ver o motivo e resolver.',
  },
  'module-disabled': {
    title: 'Módulo não contratado',
    description: 'Este módulo não está habilitado para a sua empresa.',
    nextStep: 'Quem contratou o plano pode habilitá-lo. Permissão sua não resolveria.',
  },
  'missing-permission': {
    title: 'Sem permissão',
    description: 'Seu perfil de acesso não inclui esta área.',
    nextStep: 'Se você precisa dela para trabalhar, peça ao administrador da sua empresa.',
  },
};

export function denialCopy(reason: DenialReason): DenialCopy {
  return COPY[reason];
}

/** O nome do parâmetro que o middleware usa para passar o motivo. */
export const REASON_PARAM = 'motivo';

/**
 * Lê um motivo vindo da URL.
 *
 * O middleware passa o motivo como parâmetro, e parâmetro de URL é digitável:
 * qualquer pessoa pode trocar `?motivo=` por outro valor. Isso **não** muda
 * acesso nenhum — a guarda já negou, e o RLS negaria de novo. Muda só qual
 * texto aparece. Ainda assim, valor desconhecido precisa virar um padrão em vez
 * de quebrar a página ou aparecer cru na tela.
 */
export function parseDenialReason(raw: string | null | undefined): DenialReason {
  if (typeof raw === 'string' && Object.hasOwn(COPY, raw)) return raw as DenialReason;
  return 'missing-permission';
}
