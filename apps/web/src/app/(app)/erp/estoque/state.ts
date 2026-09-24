import type { ErpMovementKind, ErpUnit } from '@tivexy/core';

/** O estado do lançamento de movimento. Fora de `actions.ts` pela regra do `'use server'`. */
export interface MovimentoFormState {
  erro: string | null;
  campos: Readonly<Partial<Record<'product_id' | 'quantity' | 'kind', string>>>;
  criado: string | null;
}

export const MOVIMENTO_INICIAL: MovimentoFormState = { erro: null, campos: {}, criado: null };

/** Uma linha do inventário. */
export interface SaldoListado {
  productId: string;
  nome: string;
  sku: string | null;
  unit: ErpUnit;
  quantidade: number;
  custoCents: number;
}

/** Uma linha do razão. */
export interface MovimentoListado {
  id: string;
  produto: string;
  kind: ErpMovementKind;
  quantity: number;
  reason: string | null;
  /** Preenchido quando o movimento veio de uma venda. */
  vendaNumero: number | null;
  createdAt: string;
}

/** Um produto oferecido no lançamento. Só os que controlam estoque. */
export interface ProdutoDeEstoque {
  id: string;
  nome: string;
  unit: ErpUnit;
}
