/**
 * Como o ERP se escreve na tela.
 *
 * Os valores vêm do Core (`PRODUCT_UNITS`, `UNIT_INFO`, `StockStatus`); aqui
 * fica só o texto. Cor nunca carrega a informação sozinha: toda situação tem
 * rótulo escrito, e a tela põe um ícone junto.
 */

import {
  type InventoryMovementKind,
  PRODUCT_UNITS,
  type ProductUnit,
  type StockStatus,
  UNIT_INFO,
} from '@tivexy/core';

/** As unidades para um `<select>`: "kg — quilo, aceita fração". */
export const OPCOES_DE_UNIDADE: readonly { valor: ProductUnit; rotulo: string }[] =
  PRODUCT_UNITS.map((u) => ({
    valor: u,
    rotulo: `${u} — ${UNIT_INFO[u].singular}${UNIT_INFO[u].fracionada ? ', aceita fração' : ''}`,
  }));

export type Tom = 'neutral' | 'success' | 'warning' | 'danger';

export const SITUACAO_DO_ESTOQUE: Readonly<Record<StockStatus, { rotulo: string; tom: Tom }>> = {
  untracked: { rotulo: 'Sem controle de estoque', tom: 'neutral' },
  negative: { rotulo: 'Saldo negativo', tom: 'danger' },
  out: { rotulo: 'Sem estoque', tom: 'warning' },
  low: { rotulo: 'No mínimo', tom: 'warning' },
  ok: { rotulo: 'Em dia', tom: 'success' },
};

/** Margem para ler: `40,0%`, `−20,0%`. `null` vira travessão na tela. */
export function formatMargin(margem: number | null): string | null {
  if (margem === null) return null;
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(margem)}%`;
}

/**
 * O nome de cada tipo de movimentação. `sale` e `sale_return` a tela troca
 * pelo vocabulário do nicho ("Pedido nº 12"); estes são os genéricos.
 */
export const MOVIMENTO: Readonly<Record<InventoryMovementKind, string>> = {
  in: 'Entrada',
  out: 'Saída',
  adjustment: 'Contagem',
  sale: 'Venda',
  sale_return: 'Devolução de venda',
};
