import type { CrmStageKind } from '@tivexy/core';

/**
 * O estado da tela do funil.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

/** Os campos que a conferência sabe apontar. */
export type CampoOportunidade = 'title' | 'stage_id' | 'value_cents' | 'expected_close_date';

export interface OportunidadeFormState {
  erro: string | null;
  campos: Readonly<Partial<Record<CampoOportunidade, string>>>;
  /** O título da que acabou de entrar, para a confirmação. */
  criado: string | null;
}

export const OPORTUNIDADE_INICIAL: OportunidadeFormState = {
  erro: null,
  campos: {},
  criado: null,
};

/** Um funil na barra de escolha. */
export interface FunilListado {
  id: string;
  nome: string;
  padrao: boolean;
}

/** Uma etapa, e o que ela significa para o negócio. */
export interface EtapaDoFunil {
  id: string;
  nome: string;
  tipo: CrmStageKind;
  posicao: number;
}

/** Uma oportunidade no quadro. */
export interface OportunidadeListada {
  id: string;
  titulo: string;
  valorCentavos: number;
  etapaId: string;
  /** Quem está do outro lado: a conta, a pessoa, ou nada ainda. */
  empresa: string | null;
  contato: string | null;
  /**
   * `YYYY-MM-DD`, como a coluna `date` devolve.
   *
   * Texto, não `Date`, e de propósito: uma coluna `date` não tem hora nem
   * fuso — ela é o dia que alguém escreveu. `new Date('2026-09-24')` é
   * meia-noite **UTC**, e formatar isso em `America/Sao_Paulo` mostra dia 23.
   *
   * `closed_at` não está aqui porque é `timestamptz`: mostrá-lo exige o fuso
   * do tenant (`core.timezone`), que nenhuma tela lê ainda. Exibir num fuso
   * chutado é pior do que não exibir.
   */
  previsao: string | null;
}

/**
 * Como cada tipo de etapa se apresenta.
 *
 * `open` não ganha cor: o quadro inteiro é de oportunidades abertas, e pintar
 * todas de azul não distingue nada. O contraste que interessa é entre as duas
 * colunas de desfecho.
 */
export const TIPO_ETAPA_TOM: Record<CrmStageKind, 'neutral' | 'success' | 'danger'> = {
  open: 'neutral',
  won: 'success',
  lost: 'danger',
};

export const TIPO_ETAPA_LABEL: Record<CrmStageKind, string> = {
  open: 'Em aberto',
  won: 'Ganha',
  lost: 'Perdida',
};
