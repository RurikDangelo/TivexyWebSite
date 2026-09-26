import type { SaleField } from '@/lib/erp/sale-input';

/** Estado do formulário de venda. Fora de `actions.ts`: ver a regra do Next. */
export interface VendaFormState {
  erro: string | null;
  campos: Partial<Record<SaleField, string>>;
}

export const VENDA_INICIAL: VendaFormState = { erro: null, campos: {} };

export interface AcaoState {
  erro: string | null;
  ok: string | null;
}

export const ACAO_INICIAL: AcaoState = { erro: null, ok: null };

/** O cadastro rápido de cliente, de dentro da venda. */
export interface ClienteRapidoState {
  erro: string | null;
  campos: { nome?: string; documento?: string };
  cliente: { id: string; nome: string } | null;
}

export const CLIENTE_INICIAL: ClienteRapidoState = { erro: null, campos: {}, cliente: null };

/** O que a tela de venda precisa saber de cada produto — preço só para mostrar. */
export interface ProdutoNaVenda {
  id: string;
  nome: string;
  unidade: string;
  precoCentavos: number;
  sku: string | null;
  codigoDeBarras: string | null;
}

export interface FormaNaVenda {
  id: string;
  nome: string;
  codigo: string | null;
  prazoEmDias: number;
}

export interface Opcao {
  id: string;
  nome: string;
}

export const POR_PAGINA = 50;

export const PERIODOS = ['hoje', '7d', '30d', 'tudo'] as const;
export type Periodo = (typeof PERIODOS)[number];

export function periodoPedido(valor: unknown): Periodo {
  return typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor)
    ? (valor as Periodo)
    : '30d';
}

export const SITUACOES_DE_VENDA = ['todas', 'concluidas', 'canceladas'] as const;
export type SituacaoDeVenda = (typeof SITUACOES_DE_VENDA)[number];

export function situacaoDeVendaPedida(valor: unknown): SituacaoDeVenda {
  return typeof valor === 'string' && (SITUACOES_DE_VENDA as readonly string[]).includes(valor)
    ? (valor as SituacaoDeVenda)
    : 'todas';
}
