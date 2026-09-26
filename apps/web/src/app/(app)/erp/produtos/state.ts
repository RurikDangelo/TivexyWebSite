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

/**
 * As colunas por onde a lista pode ser ordenada, e a coluna do banco de cada uma.
 *
 * Só entra aqui o que o banco sabe ordenar na mesma consulta que pagina. Margem
 * é calculada em JavaScript depois do `range()`, e categoria mora em outra
 * tabela: ordenar por qualquer uma das duas ordenaria só os 50 desta página e
 * mentiria sobre o resto da lista.
 */
export const COLUNA_DA_ORDEM = {
  nome: 'name',
  preco: 'price_cents',
} as const;

export type ChaveDeOrdem = keyof typeof COLUNA_DA_ORDEM;

/** `-chave` é descendente, como no contrato do `<TH ordem>`. */
export type Ordem = ChaveDeOrdem | `-${ChaveDeOrdem}`;

/** A ordem da consulta quando o endereço não pede nenhuma. */
export const ORDEM_PADRAO: Ordem = 'nome';

function ehChave(valor: string): valor is ChaveDeOrdem {
  return Object.keys(COLUNA_DA_ORDEM).includes(valor);
}

/**
 * A ordem pedida no endereço, ou `null` quando ele não pede nada.
 *
 * `null` e `'nome'` não são a mesma coisa para quem monta o link: o primeiro
 * mantém `?ordem=` fora da URL, e é o que evita encher o endereço com o valor
 * que já é o padrão.
 */
export function ordemPedida(valor: unknown): Ordem | null {
  if (typeof valor !== 'string' || valor === '') return null;
  const chave = valor.startsWith('-') ? valor.slice(1) : valor;
  if (!ehChave(chave)) return null;
  return valor as Ordem;
}

/** Decompõe a ordem no que a consulta precisa: coluna do banco e sentido. */
export function colunaDaOrdem(ordem: Ordem): { coluna: string; ascendente: boolean } {
  const descendente = ordem.startsWith('-');
  const chave = (descendente ? ordem.slice(1) : ordem) as ChaveDeOrdem;
  return { coluna: COLUNA_DA_ORDEM[chave], ascendente: !descendente };
}
