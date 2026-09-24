import type { ErpSaleStatus, ErpUnit } from '@tivexy/core';

/** Os estados dos formulários de venda. Fora de `actions.ts` pela regra do `'use server'`. */

export interface NovaVendaState {
  erro: string | null;
}

export const NOVA_VENDA_INICIAL: NovaVendaState = { erro: null };

export interface ItemFormState {
  erro: string | null;
  campos: Readonly<Partial<Record<'product_id' | 'quantity' | 'unit_price_cents', string>>>;
}

export const ITEM_INICIAL: ItemFormState = { erro: null, campos: {} };

export interface ConfirmarState {
  erro: string | null;
  numero: number | null;
}

export const CONFIRMAR_INICIAL: ConfirmarState = { erro: null, numero: null };

export interface PagamentoFormState {
  erro: string | null;
}

export const PAGAMENTO_INICIAL: PagamentoFormState = { erro: null };

/** Uma venda na listagem. */
export interface VendaListada {
  id: string;
  numero: number | null;
  status: ErpSaleStatus;
  cliente: string | null;
  totalCents: number;
  criadaEm: string;
  vendidaEm: string | null;
}

/** Um item da venda aberta. */
export interface ItemListado {
  id: string;
  produto: string;
  unit: ErpUnit;
  quantity: number;
  unitPriceCents: number;
}

/** Um produto oferecido ao montar a venda. */
export interface ProdutoDeVenda {
  id: string;
  nome: string;
  unit: ErpUnit;
  priceCents: number;
}

/** Um pagamento registrado na venda. */
export interface PagamentoListado {
  id: string;
  forma: string;
  amountCents: number;
}
