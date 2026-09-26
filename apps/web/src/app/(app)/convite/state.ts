/**
 * O estado do formulário de aceitar convite.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

export interface AceiteState {
  erro: string | null;
}

export const ACEITE_INICIAL: AceiteState = { erro: null };
