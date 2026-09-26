import type { AgendaBucket } from '@tivexy/core';

import type { ActivityField, TipoDeAlvo } from '@/lib/crm/activity-input';

/** Estado e tipos da agenda. Fora de `actions.ts`: ver a regra do Next. */

export interface AtividadeFormState {
  erro: string | null;
  campos: Partial<Record<ActivityField, string>>;
  salvo: string | null;
}

export const ATIVIDADE_INICIAL: AtividadeFormState = { erro: null, campos: {}, salvo: null };

export interface Opcao {
  id: string;
  nome: string;
}

/** O que se oferece no campo "Sobre", agrupado pelo tipo de alvo. */
export type OpcoesDeAlvo = Readonly<Record<TipoDeAlvo, readonly Opcao[]>>;

/** Uma atividade como a agenda desenha: textos já no fuso do tenant. */
export interface ItemDaAgenda {
  id: string;
  assunto: string;
  tipo: string | null;
  faixa: AgendaBucket | 'done';
  /** "14:30", "o dia todo", "sex. 02/10 · 14:30". `null` sem data. */
  quando: string | null;
  /** "há 2 dias" — só para as atrasadas. */
  atraso: string | null;
  alvo: { tipo: TipoDeAlvo; id: string; nome: string } | null;
  responsavel: string | null;
  notas: string | null;
}

export interface ConcluirResultado {
  erro: string | null;
}
