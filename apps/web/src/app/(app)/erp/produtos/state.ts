import type { ProductField } from '@/lib/erp/product-input';

/** Estado dos formulários de produto. Fora de `actions.ts`: ver a regra do Next. */
export interface ProdutoFormState {
  erro: string | null;
  campos: Partial<Record<ProductField, string>>;
  salvo: string | null;
  /**
   * Quantas vezes o cadastro deu certo. O formulário de cadastro usa como
   * `key`: cada produto salvo remonta os campos limpos, inclusive a prévia da
   * margem e o interruptor de estoque, que um `reset()` não alcança.
   */
  rodada: number;
}

export const PRODUTO_INICIAL: ProdutoFormState = { erro: null, campos: {}, salvo: null, rodada: 0 };

/** Retorno das ações curtas — situação, exclusão, categoria. */
export interface AcaoState {
  erro: string | null;
  ok: string | null;
}

export const ACAO_INICIAL: AcaoState = { erro: null, ok: null };

export interface Opcao {
  id: string;
  nome: string;
}

/** Quantos produtos por página. Lista maior que isso é trabalho para a busca. */
export const POR_PAGINA = 50;

export const SITUACOES = ['ativos', 'fora', 'todos'] as const;
export type Situacao = (typeof SITUACOES)[number];

export function situacaoPedida(valor: unknown): Situacao {
  return typeof valor === 'string' && (SITUACOES as readonly string[]).includes(valor)
    ? (valor as Situacao)
    : 'ativos';
}
