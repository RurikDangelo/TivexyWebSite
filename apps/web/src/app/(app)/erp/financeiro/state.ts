import type { FinanceEntryKind } from '@tivexy/core';

/** O estado do formulário de lançamento. Fora de `actions.ts` pela regra do `'use server'`. */
export interface LancamentoFormState {
  erro: string | null;
  campos: Readonly<Partial<Record<'description' | 'amount_cents' | 'due_date', string>>>;
  criado: string | null;
}

export const LANCAMENTO_INICIAL: LancamentoFormState = { erro: null, campos: {}, criado: null };

/** Um lançamento na listagem. */
export interface LancamentoListado {
  id: string;
  kind: FinanceEntryKind;
  description: string;
  amountCents: number;
  /** `YYYY-MM-DD`, como a coluna `date` devolve. */
  dueDate: string;
  paidAt: string | null;
  empresa: string | null;
  vendaNumero: number | null;
}
