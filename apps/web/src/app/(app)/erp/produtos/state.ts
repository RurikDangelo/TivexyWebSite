import type { ErpUnit } from '@tivexy/core';

/**
 * O estado da tela de produtos.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

export type CampoProduto = 'name' | 'sku' | 'price_cents' | 'cost_cents';

export interface ProdutoFormState {
  erro: string | null;
  campos: Readonly<Partial<Record<CampoProduto, string>>>;
  criado: string | null;
}

export const PRODUTO_INICIAL: ProdutoFormState = { erro: null, campos: {}, criado: null };

/** Um produto na listagem, com o saldo já resolvido. */
export interface ProdutoListado {
  id: string;
  name: string;
  sku: string | null;
  unit: ErpUnit;
  priceCents: number;
  costCents: number;
  trackStock: boolean;
  isActive: boolean;
  categoria: string | null;
  /** `null` quando o produto não controla estoque, ou nunca teve movimento. */
  saldo: number | null;
}

/** Uma categoria oferecida no formulário e no filtro. */
export interface CategoriaOferecida {
  id: string;
  nome: string;
}
