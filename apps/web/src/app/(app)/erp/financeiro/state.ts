import type { FinanceStatus } from '@tivexy/core';

import type { FinanceEntryField } from '@/lib/erp/finance-input';

/** Estado dos formulários do financeiro. Fora de `actions.ts`: ver a regra do Next. */
export interface LancamentoFormState {
  erro: string | null;
  campos: Partial<Record<FinanceEntryField, string>>;
  ok: string | null;
  /** Quantas vezes o cadastro deu certo — a `key` que limpa o formulário. */
  rodada: number;
}

export const LANCAMENTO_INICIAL: LancamentoFormState = {
  erro: null,
  campos: {},
  ok: null,
  rodada: 0,
};

export interface AcaoState {
  erro: string | null;
  ok: string | null;
}

export const ACAO_INICIAL: AcaoState = { erro: null, ok: null };

export const ABAS = ['visao', 'receber', 'pagar'] as const;
export type Aba = (typeof ABAS)[number];

export function abaPedida(valor: unknown): Aba {
  return typeof valor === 'string' && (ABAS as readonly string[]).includes(valor)
    ? (valor as Aba)
    : 'visao';
}

export const FILTROS = ['abertos', 'vencidos', 'pagos', 'cancelados', 'todos'] as const;
export type Filtro = (typeof FILTROS)[number];

export function filtroPedido(valor: unknown): Filtro {
  return typeof valor === 'string' && (FILTROS as readonly string[]).includes(valor)
    ? (valor as Filtro)
    : 'abertos';
}

export interface LancamentoNaTela {
  id: string;
  descricao: string;
  /** Cliente cadastrado, ou a contraparte escrita. */
  quem: string | null;
  categoria: string | null;
  valorCentavos: number;
  vencimento: string;
  /** "25/10/2026". */
  vencimentoTexto: string;
  /** "vence em 30 dias", "venceu há 2 dias". */
  prazoTexto: string;
  pagoEm: string | null;
  situacao: FinanceStatus;
  motivoDoCancelamento: string | null;
  /** O lançamento nasceu de uma venda: segue a venda. */
  venda: { id: string; numero: number } | null;
}

export const POR_PAGINA = 50;
