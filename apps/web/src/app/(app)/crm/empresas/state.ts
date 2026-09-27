import type { CompanyField } from '@/lib/crm/company-input';

/** Estado dos formulários de conta. Fora de `actions.ts`: ver a regra do Next. */
export interface ContaFormState {
  erro: string | null;
  campos: Partial<Record<CompanyField, string>>;
  salvo: string | null;
}

export const CONTA_INICIAL: ContaFormState = { erro: null, campos: {}, salvo: null };

export interface Opcao {
  id: string;
  nome: string;
}

export const POR_PAGINA = 50;

/**
 * Prefixo dos ids dos campos de conta.
 *
 * A página de detalhe monta o cadastro da conta e o `<NewActivityForm>` no
 * mesmo documento, e os dois têm campo `responsavel` e campo `notas`. Com id
 * repetido o `<label>` casa com o primeiro que encontrar — clicar em
 * "Responsável" do cadastro focava o seletor da atividade. Literal, e não
 * `useEscopo()`, porque a colisão é conhecida: assim se lê no DOM.
 */
export const ESCOPO_DA_CONTA = 'conta';

/**
 * As colunas por onde a lista de contas pode ser ordenada, e o campo real da
 * tabela `crm_companies`.
 *
 * O mapa existe para que `?ordem=` nunca chegue ao `.order()` como texto vindo
 * da URL: o que não estiver aqui não vira consulta.
 */
export const ORDENS_DE_CONTA = {
  nome: 'name',
  razao: 'legal_name',
  documento: 'document',
  email: 'email',
} as const;

export type ChaveDeOrdemDeConta = keyof typeof ORDENS_DE_CONTA;

export interface OrdemDeConta {
  chave: ChaveDeOrdemDeConta;
  ascendente: boolean;
  /**
   * O `?ordem=` como veio no endereço, e `null` quando a URL não pediu nada.
   *
   * É o que o cabeçalho da tabela usa para decidir a seta: sem essa distinção,
   * a coluna Nome apareceria marcada como "ordenada por você" numa lista que
   * ninguém ordenou.
   */
  bruta: string | null;
}

function ehChaveDeOrdem(valor: string): valor is ChaveDeOrdemDeConta {
  return Object.hasOwn(ORDENS_DE_CONTA, valor);
}

/**
 * A ordenação pedida no endereço. `-chave` é descendente.
 *
 * Qualquer coisa torta cai no padrão da consulta (nome, A→Z), que é o que a
 * tela mostrava antes de existir ordenação.
 */
export function ordemDeConta(bruto: string | string[] | undefined): OrdemDeConta {
  const PADRAO: OrdemDeConta = { chave: 'nome', ascendente: true, bruta: null };

  const texto = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof texto !== 'string' || texto === '') return PADRAO;

  const descendente = texto.startsWith('-');
  const chave = descendente ? texto.slice(1) : texto;
  if (!ehChaveDeOrdem(chave)) return PADRAO;

  return { chave, ascendente: !descendente, bruta: texto };
}
