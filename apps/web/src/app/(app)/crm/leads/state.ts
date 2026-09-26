import type { CrmLeadStatus } from '@tivexy/core';

/**
 * O estado dos formulários de lead.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

export interface LeadFormState {
  erro: string | null;
  /** Problemas por campo, para marcar o input em vez de só avisar em cima. */
  campos: Readonly<Partial<Record<'name' | 'email' | 'phone', string>>>;
  /** Nome de quem acabou de entrar, para a confirmação. */
  criado: string | null;
}

export const LEAD_INICIAL: LeadFormState = { erro: null, campos: {}, criado: null };

/** O resultado de converter. */
export interface ConversaoState {
  erro: string | null;
  /** O nome de quem virou cliente, para a confirmação. */
  convertido: string | null;
}

export const CONVERSAO_INICIAL: ConversaoState = { erro: null, convertido: null };

/** Uma etapa oferecida na conversão. */
export interface EtapaOferecida {
  id: string;
  nome: string;
  funil: string;
}

/** O que cada estado de lead se chama na tela. */
export const LEAD_STATUS_LABEL: Record<CrmLeadStatus, string> = {
  new: 'Novo',
  contacted: 'Em contato',
  qualified: 'Qualificado',
  disqualified: 'Descartado',
  converted: 'Convertido',
};

/** A cor de cada estado. `converted` é o único sucesso; `disqualified`, o fim sem venda. */
export const LEAD_STATUS_TONE: Record<CrmLeadStatus, 'neutral' | 'brand' | 'success' | 'warning'> =
  {
    new: 'brand',
    contacted: 'warning',
    qualified: 'warning',
    disqualified: 'neutral',
    converted: 'success',
  };
