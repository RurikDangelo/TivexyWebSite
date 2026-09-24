/** O estado do aceite. Fora de `actions.ts` pela regra do `'use server'`. */
export interface ConviteState {
  erro: string | null;
}

export const CONVITE_INICIAL: ConviteState = { erro: null };
