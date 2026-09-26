import type { CrmStageKind } from '@tivexy/core';

import type { DealField } from '@/lib/crm/deal-input';

/**
 * Tipos e estados da tela do funil.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona.
 */

export interface EtapaDoQuadro {
  id: string;
  name: string;
  kind: CrmStageKind;
  position: number;
}

/** Uma oportunidade como o cartão precisa: nomes já resolvidos, datas já no fuso. */
export interface CartaoDeNegocio {
  id: string;
  titulo: string;
  valorCentavos: number;
  etapaId: string;
  conta: string | null;
  pessoa: string | null;
  responsavelId: string | null;
  responsavel: string | null;
  /** Previsão de fechamento, `AAAA-MM-DD`. */
  previsao: string | null;
  /** Dias desde a última mudança, no calendário do tenant. */
  diasParado: number;
}

export interface Opcao {
  id: string;
  nome: string;
}

export interface NegocioFormState {
  erro: string | null;
  campos: Partial<Record<DealField, string>>;
  /** O título de quem acabou de entrar, para a confirmação. */
  salvo: string | null;
}

export const NEGOCIO_INICIAL: NegocioFormState = { erro: null, campos: {}, salvo: null };

export interface MoverResultado {
  erro: string | null;
}

/**
 * Quantos dias de negócio fechado o quadro mostra.
 *
 * As colunas de ganho e perda não podem crescer para sempre — em um ano, a de
 * ganho teria centenas de cartões e esconderia o funil vivo. O quadro é para
 * o que está andando; o histórico inteiro fica para relatório.
 */
export const JANELA_FECHADAS_DIAS = 30;

/** A partir de quantos dias sem mudança o cartão diz que está parado. */
export const PARADO_A_PARTIR_DE = 7;
