/** O resultado das ações do editor de funil. Fora de `actions.ts`: ver a regra do Next. */
export interface AcaoState {
  erro: string | null;
  ok: string | null;
}

export const ACAO_INICIAL: AcaoState = { erro: null, ok: null };

export const TIPOS_DE_ETAPA = [
  { valor: 'open', rotulo: 'Em andamento' },
  { valor: 'won', rotulo: 'Ganho' },
  { valor: 'lost', rotulo: 'Perda' },
] as const;
