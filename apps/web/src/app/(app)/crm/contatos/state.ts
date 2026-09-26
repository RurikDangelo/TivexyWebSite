import type { ContactField } from '@/lib/crm/contact-input';

/** Estado dos formulários de pessoa. Fora de `actions.ts`: ver a regra do Next. */
export interface ContatoFormState {
  erro: string | null;
  campos: Partial<Record<ContactField, string>>;
  salvo: string | null;
}

export const CONTATO_INICIAL: ContatoFormState = { erro: null, campos: {}, salvo: null };

export interface Opcao {
  id: string;
  nome: string;
}

/** Quantas pessoas por página. Lista maior que isso é trabalho para a busca. */
export const POR_PAGINA = 50;

/**
 * Teto da lista de empresas que alimenta o seletor de vínculo.
 *
 * O número mora aqui porque a tela precisa dele duas vezes: para pedir ao banco
 * e para saber que a lista PODE estar cortada — `data.length === TETO` é o
 * único sinal disponível sem uma segunda consulta. Uma lista cortada em
 * silêncio faz a pessoa salvar sem vínculo achando que a empresa não existe.
 */
export const TETO_DE_CONTAS = 500;

/**
 * Colunas por que a lista aceita ordenar → coluna correspondente no banco.
 *
 * Lista fechada de propósito: o valor vem da URL, e mandar `?ordem=` direto
 * para o PostgREST seria deixar o endereço escolher a consulta.
 *
 * A coluna Empresa fica de fora e não ganha cabeçalho clicável: ela vem de um
 * recurso embutido (`crm_companies`), e o `order` do PostgREST sobre embutido
 * ordena o que está DENTRO da relação, não as linhas de cima. Um cabeçalho que
 * parece ordenar e não ordena é pior do que nenhum.
 */
export const ORDENS = {
  nome: 'name',
  cargo: 'title',
  email: 'email',
} as const;

export type ChaveDeOrdem = keyof typeof ORDENS;

export interface OrdemDaLista {
  chave: ChaveDeOrdem;
  ascendente: boolean;
  /** O `?ordem=` normalizado. É o que o `<TH ordem>` compara para acender a seta. */
  atual: string;
}

function ehChave(valor: string): valor is ChaveDeOrdem {
  return Object.hasOwn(ORDENS, valor);
}

/**
 * A ordem pedida no endereço. Qualquer coisa torta cai no padrão.
 *
 * O padrão é devolvido com `atual: 'nome'`, e não com vazio, porque a lista
 * ESTÁ ordenada por nome mesmo sem parâmetro — deixar o cabeçalho sem seta
 * nesse caso esconderia a ordem que está valendo.
 */
export function ordemPedida(bruto: string | string[] | undefined): OrdemDaLista {
  const texto = Array.isArray(bruto) ? bruto[0] : bruto;
  const pedido = typeof texto === 'string' ? texto.trim() : '';
  const ascendente = !pedido.startsWith('-');
  const chave = ascendente ? pedido : pedido.slice(1);

  if (!ehChave(chave)) return { chave: 'nome', ascendente: true, atual: 'nome' };
  return { chave, ascendente, atual: ascendente ? chave : `-${chave}` };
}
