/** Estado dos formulários da conta. Fora de `actions.ts`: ver a regra do Next. */
export interface ContaState {
  erro: string | null;
  campos: Readonly<Partial<Record<'nome' | 'atual' | 'nova' | 'confirmacao', string>>>;
  ok: string | null;
}

export const CONTA_INICIAL: ContaState = { erro: null, campos: {}, ok: null };
