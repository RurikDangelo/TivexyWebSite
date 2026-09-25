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
