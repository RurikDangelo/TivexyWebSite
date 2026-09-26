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
 * O teto de cada consulta que alimenta o quadro.
 *
 * Mora aqui, e não solto na página, porque o quadro precisa **saber** que a
 * soma pode estar cortada: a partir de 500 abertas, o número grande no topo
 * deixa de ser o valor do funil e passa a ser o das 500 mais recentes. Exibir
 * isso como total seria afirmar um dado que ninguém apurou (CLAUDE.md).
 *
 * O agregado honesto exige somar no banco (RPC ou `count exact` + `sum` por
 * etapa). Enquanto ele não existe, a tela rotula o que mostra.
 */
export const LIMITE_ABERTAS = 500;
export const LIMITE_FECHADAS = 200;

/**
 * Onde a leitura parou. `true` quando a consulta voltou cheia até o teto — e
 * aí não dá para distinguir "acabou" de "foi cortada", então vale como cortada.
 */
export interface CorteDoQuadro {
  abertas: boolean;
  fechadas: boolean;
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
