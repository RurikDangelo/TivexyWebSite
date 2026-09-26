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

/**
 * As três colunas que a lista sabe ordenar, e a coluna do banco de cada uma.
 *
 * A lista é do banco, não da página: ordenar precisa ir até a consulta, senão
 * "maior total" ordenaria só os 50 da página atual e mentiria sobre o resto.
 * Por isso a chave da URL é traduzida aqui para o nome real da coluna — nada
 * do que vem no endereço chega ao `.order()` sem passar por este mapa.
 *
 * Cliente e forma de pagamento ficam de fora de propósito: as duas moram em
 * tabelas relacionadas, e ordenar por elas exigiria mudar a consulta de
 * verdade — o que não é redesenho.
 */
const COLUNA_DA_ORDEM = {
  numero: 'number',
  quando: 'sold_at',
  total: 'total_cents',
} as const;

export type ChaveDeOrdemDeVenda = keyof typeof COLUNA_DA_ORDEM;

export interface OrdenacaoDeVenda {
  chave: ChaveDeOrdemDeVenda;
  coluna: (typeof COLUNA_DA_ORDEM)[ChaveDeOrdemDeVenda];
  ascendente: boolean;
}

/** `?ordem=total` sobe, `?ordem=-total` desce. Chave desconhecida vira `null` — a ordem padrão da consulta. */
export function ordenacaoPedida(valor: unknown): OrdenacaoDeVenda | null {
  if (typeof valor !== 'string' || valor === '') return null;
  const ascendente = !valor.startsWith('-');
  const chave = ascendente ? valor : valor.slice(1);
  if (!Object.hasOwn(COLUNA_DA_ORDEM, chave)) return null;
  const conhecida = chave as ChaveDeOrdemDeVenda;
  return { chave: conhecida, coluna: COLUNA_DA_ORDEM[conhecida], ascendente };
}

/** De volta ao texto do endereço. Vazio quando a ordem é a padrão, para não sujar a URL. */
export function ordemNaUrl(ordenacao: OrdenacaoDeVenda | null): string {
  return ordenacao === null ? '' : `${ordenacao.ascendente ? '' : '-'}${ordenacao.chave}`;
}
