import { STOCK_STATUS_ORDER, type StockStatus } from '@tivexy/core';

import type { MovementField } from '@/lib/erp/movement-input';

/** Estado do formulário de movimentação. Fora de `actions.ts`: ver a regra do Next. */
export interface MovimentoFormState {
  erro: string | null;
  campos: Partial<Record<MovementField, string>>;
  /** O que aconteceu, para quem registrou: "Entrada de 5 kg. Saldo agora: 12 kg." */
  ok: string | null;
  /** Quantos registros deram certo — a `key` que limpa o formulário. */
  rodada: number;
}

export const MOVIMENTO_INICIAL: MovimentoFormState = {
  erro: null,
  campos: {},
  ok: null,
  rodada: 0,
};

/** Quantas linhas por página, no saldo e no razão. */
export const POR_PAGINA = 50;

/**
 * O teto do saldo lido de uma vez. O resumo — quantos no mínimo, quanto vale
 * — precisa de todos os produtos controlados; acima disto a tela avisa que
 * está mostrando uma parte.
 */
export const TETO_DO_SALDO = 2000;

export const FILTROS_DE_SITUACAO = ['todos', 'repor', 'negativo', 'em-dia'] as const;
export type FiltroDeSituacao = (typeof FILTROS_DE_SITUACAO)[number];

export function filtroPedido(valor: unknown): FiltroDeSituacao {
  return typeof valor === 'string' && (FILTROS_DE_SITUACAO as readonly string[]).includes(valor)
    ? (valor as FiltroDeSituacao)
    : 'todos';
}

export interface ProdutoParaMovimentar {
  id: string;
  nome: string;
  unidade: string;
}

/* ── Ordenação do saldo ──────────────────────────────────────────────── */

export const CHAVES_DE_ORDEM = ['situacao', 'nome', 'categoria', 'saldo', 'minimo'] as const;
export type ChaveDeOrdem = (typeof CHAVES_DE_ORDEM)[number];

/**
 * A ordem padrão é a urgência, e ela é **declarada**, não implícita.
 *
 * A pergunta de quem abre esta tela é "o que eu preciso repor", então a lista
 * chega por situação. Escrever isso como o valor padrão de `?ordem=` — em vez
 * de deixar o parâmetro vazio e ordenar por fora — é o que permite ao cabeçalho
 * mostrar a seta certa: `aria-sort="none"` numa coluna que de fato ordena a
 * lista seria uma afirmação falsa para quem usa leitor de tela.
 */
export const ORDEM_PADRAO: ChaveDeOrdem = 'situacao';

/** O `?ordem=` vigente, já validado. `-chave` é descendente. */
export function ordemPedida(valor: unknown): string {
  if (typeof valor !== 'string') return ORDEM_PADRAO;
  const chave = valor.startsWith('-') ? valor.slice(1) : valor;
  return (CHAVES_DE_ORDEM as readonly string[]).includes(chave) ? valor : ORDEM_PADRAO;
}

/** O mínimo necessário para ordenar — a linha da tela tem mais campos que isto. */
export interface LinhaOrdenavel {
  nome: string;
  categoria: string | null;
  saldo: number;
  minimo: number | null;
  situacao: StockStatus;
}

type Comparador = (a: LinhaOrdenavel, b: LinhaOrdenavel) => number;

const POR_CHAVE: Record<ChaveDeOrdem, Comparador> = {
  /* `STOCK_STATUS_ORDER` começa em `negative`: crescente = do mais urgente ao em dia. */
  situacao: (a, b) =>
    STOCK_STATUS_ORDER.indexOf(a.situacao) - STOCK_STATUS_ORDER.indexOf(b.situacao),
  nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  categoria: (a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? '', 'pt-BR'),
  saldo: (a, b) => a.saldo - b.saldo,
  /*
   * Sem mínimo definido vale −1, abaixo de qualquer mínimo real (que nunca é
   * negativo). Um sentinela numérico, e não "sempre no fim", porque "sempre no
   * fim" não se inverte: descendente e crescente colocariam o mesmo grupo no
   * mesmo lugar, e a seta do cabeçalho passaria a mentir.
   */
  minimo: (a, b) => (a.minimo ?? -1) - (b.minimo ?? -1),
};

/** O comparador do `?ordem=`, com desempate estável pelo nome. */
export function compararSaldo(ordem: string): Comparador {
  const descendente = ordem.startsWith('-');
  const chave = (descendente ? ordem.slice(1) : ordem) as ChaveDeOrdem;
  const base = POR_CHAVE[chave] ?? POR_CHAVE[ORDEM_PADRAO];

  return (a, b) => {
    const r = base(a, b);
    if (r !== 0) return descendente ? -r : r;
    /*
     * O desempate é sempre crescente por nome, inclusive na ordem descendente:
     * ele não é parte do critério pedido, é o que impede dois produtos na mesma
     * situação de trocarem de lugar entre um carregamento e outro — e, com
     * paginação, de aparecerem duas vezes ou sumirem.
     */
    return a.nome.localeCompare(b.nome, 'pt-BR');
  };
}
