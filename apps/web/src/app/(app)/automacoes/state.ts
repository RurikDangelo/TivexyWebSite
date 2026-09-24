import type { AutomationEvent, RuleProblem } from '@tivexy/core';

/** O estado do formulário de regra. Fora de `actions.ts` pela regra do `'use server'`. */
export interface RegraFormState {
  erro: string | null;
  /** Problemas por caminho, no formato de `checkRule`. */
  problemas: readonly RuleProblem[];
  criada: string | null;
}

export const REGRA_INICIAL: RegraFormState = { erro: null, problemas: [], criada: null };

/** Uma regra na listagem. */
export interface RegraListada {
  id: string;
  name: string;
  event: AutomationEvent;
  condicoes: readonly { field: string; operator: string; value?: string }[];
  acoes: readonly { kind: string; params: Record<string, string> }[];
  isActive: boolean;
  /** Quantas vezes disparou, e quantas falharam. */
  disparos: number;
  falhas: number;
}

/** Uma linha do histórico. */
export interface DisparoListado {
  id: string;
  ruleName: string;
  event: string;
  succeeded: boolean;
  error: string | null;
  createdAt: string;
}
