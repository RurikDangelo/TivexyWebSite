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

/* ── Janela do fluxo de caixa ───────────────────────────────────────────
 *
 * A aba Visão tinha nove semanas cravadas no código (`addDays(segunda, -28)`
 * a `addDays(segunda, 34)`), sem controle na tela e sem dizer na tela qual era
 * o período — o achado `financeiro/page.tsx:93` do UI_AUDIT pede exatamente
 * este seletor. O parâmetro é GET, como todo o resto do módulo: a janela
 * escolhida sobrevive a recarregar e cabe num link.
 */

export const PERIODOS = ['9s', '13s', '26s'] as const;
export type Periodo = (typeof PERIODOS)[number];

/** O padrão reproduz exatamente a janela que estava fixa no código. */
export const PERIODO_PADRAO: Periodo = '9s';

export interface JanelaDoFluxo {
  /** Semanas inteiras antes da semana corrente. */
  atras: number;
  /** Semanas inteiras depois da semana corrente. */
  adiante: number;
  rotulo: string;
}

export const JANELA: Readonly<Record<Periodo, JanelaDoFluxo>> = {
  '9s': { atras: 4, adiante: 4, rotulo: '9 semanas' },
  '13s': { atras: 6, adiante: 6, rotulo: '13 semanas' },
  '26s': { atras: 13, adiante: 12, rotulo: '26 semanas' },
};

export function periodoPedido(valor: unknown): Periodo {
  return typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor)
    ? (valor as Periodo)
    : PERIODO_PADRAO;
}

/* ── Ordenação da lista ─────────────────────────────────────────────────
 *
 * Coluna ordenável é `<Link>` com `?ordem=`, não estado de cliente: a ordem
 * fica no endereço, a página continua Server Component e a lista funciona sem
 * JavaScript. `-chave` é descendente, como o primitivo de tabela define.
 */

export const COLUNAS_DE_ORDEM = {
  descricao: 'description',
  vencimento: 'due_date',
  valor: 'amount_cents',
} as const;

export type ColunaDeOrdem = keyof typeof COLUNAS_DE_ORDEM;

const NOMES_DE_ORDEM = Object.keys(COLUNAS_DE_ORDEM) as readonly ColunaDeOrdem[];

export interface OrdemPedida {
  coluna: ColunaDeOrdem;
  crescente: boolean;
  /** O valor canônico de `?ordem=`, para repassar à paginação. */
  texto: string;
}

/**
 * A ordem pedida no endereço, ou `null` para a ordem padrão da consulta.
 *
 * `Object.keys` em vez de `chave in COLUNAS_DE_ORDEM`: o operador `in` percorre
 * a cadeia de protótipos, e `?ordem=toString` passaria na validação.
 */
export function ordemPedida(valor: unknown): OrdemPedida | null {
  const texto = typeof valor === 'string' ? valor : '';
  const crescente = !texto.startsWith('-');
  const chave = crescente ? texto : texto.slice(1);
  if (!NOMES_DE_ORDEM.includes(chave as ColunaDeOrdem)) return null;
  const coluna = chave as ColunaDeOrdem;
  return { coluna, crescente, texto: crescente ? coluna : `-${coluna}` };
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
