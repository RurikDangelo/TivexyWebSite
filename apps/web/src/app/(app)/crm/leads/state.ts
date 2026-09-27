import { CRM_LEAD_STATUSES, type CrmLeadStatus, isLeadClosed } from '@tivexy/core';

/**
 * O estado dos formulários de lead e o contrato da URL da lista.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

export interface LeadFormState {
  erro: string | null;
  /** Problemas por campo, para marcar o input em vez de só avisar em cima. */
  campos: Readonly<Partial<Record<'name' | 'email' | 'phone', string>>>;
  /** Nome de quem acabou de entrar, para a confirmação. */
  criado: string | null;
}

export const LEAD_INICIAL: LeadFormState = { erro: null, campos: {}, criado: null };

/** O resultado de converter. */
export interface ConversaoState {
  erro: string | null;
  /** O nome de quem virou cliente, para a confirmação. */
  convertido: string | null;
}

export const CONVERSAO_INICIAL: ConversaoState = { erro: null, convertido: null };

/**
 * O resultado de mover o lead de estado.
 *
 * Antes `moverLead` devolvia `void` e descartava o retorno do banco: recusa do
 * RLS e linha que não casou (outra aba já tinha movido) davam exatamente o
 * mesmo resultado na tela — nada. O estado existe para que a linha possa dizer
 * o que houve, e é por isso que a ação virou `useActionState`.
 */
export interface MoverState {
  erro: string | null;
  /** O estado que a linha passou a ter. Só para o realce de confirmação. */
  movido: CrmLeadStatus | null;
}

export const MOVER_INICIAL: MoverState = { erro: null, movido: null };

/** Uma etapa oferecida na conversão. */
export interface EtapaOferecida {
  id: string;
  nome: string;
  funil: string;
}

/** O que cada estado de lead se chama na tela. */
export const LEAD_STATUS_LABEL: Record<CrmLeadStatus, string> = {
  new: 'Novo',
  contacted: 'Em contato',
  qualified: 'Qualificado',
  disqualified: 'Descartado',
  converted: 'Convertido',
};

/** A cor de cada estado. `converted` é o único sucesso; `disqualified`, o fim sem venda. */
export const LEAD_STATUS_TONE: Record<CrmLeadStatus, 'neutral' | 'brand' | 'success' | 'warning'> =
  {
    new: 'brand',
    contacted: 'warning',
    qualified: 'warning',
    disqualified: 'neutral',
    converted: 'success',
  };

/* ------------------------------------------------------------------ *
 * O contrato da URL da lista: quantos, quais e em que ordem.
 * ------------------------------------------------------------------ */

/** O mesmo tamanho de página das outras listas do CRM (contatos, empresas). */
export const POR_PAGINA = 50;

/**
 * Quais estados entram na lista.
 *
 * Derivados de `isLeadClosed`, e não escritos à mão: um sexto estado no Core
 * entra na partição certa sem que ninguém precise lembrar desta tela.
 */
export const STATUS_ABERTOS: readonly CrmLeadStatus[] = CRM_LEAD_STATUSES.filter(
  (status) => !isLeadClosed(status),
);
export const STATUS_FECHADOS: readonly CrmLeadStatus[] = CRM_LEAD_STATUSES.filter(isLeadClosed);

export type SituacaoDeLead = 'todos' | 'abertos' | 'fechados';

export const SITUACAO_LABEL: Record<SituacaoDeLead, string> = {
  todos: 'Todos',
  abertos: 'Em aberto',
  fechados: 'Com desfecho',
};

/**
 * A situação pedida no endereço. O padrão é `todos`, de propósito.
 *
 * Filtrar para a fila de trabalho por padrão esconderia descartado e
 * convertido — e é justamente o lead com desfecho que responde "o que
 * aconteceu com aquele contato de terça". Quem quer só a fila diz isso no
 * seletor, e o seletor mostra que disse.
 */
export function situacaoPedida(bruto: string | string[] | undefined): SituacaoDeLead {
  const texto = Array.isArray(bruto) ? bruto[0] : bruto;
  return texto === 'abertos' || texto === 'fechados' ? texto : 'todos';
}

/**
 * As colunas por onde a lista pode ser ordenada, e a coluna real de cada uma.
 *
 * O nome no endereço é em português e não é o nome da coluna: `?ordem=nome`
 * sobrevive a uma renomeação no banco, e nada em `crm_leads` que não esteja
 * aqui pode ser injetado no `order` pela URL.
 */
export const COLUNAS_ORDENAVEIS = {
  nome: 'name',
  estado: 'status',
  empresa: 'company_name',
  origem: 'source',
  entrou: 'created_at',
} as const;

export type ChaveDeOrdem = keyof typeof COLUNAS_ORDENAVEIS;

/** Mais recente primeiro — a mesma ordem que a tela tinha antes da tabela. */
export const ORDEM_PADRAO = '-entrou';

export interface OrdemAplicada {
  /** O `?ordem=` vigente, já validado. É ele que o `<TH>` compara. */
  bruta: string;
  /** A coluna do banco. */
  coluna: string;
  ascendente: boolean;
}

function chaveConhecida(texto: string): texto is ChaveDeOrdem {
  return Object.hasOwn(COLUNAS_ORDENAVEIS, texto);
}

/** A ordenação pedida no endereço. Qualquer coisa torta cai no padrão. */
export function ordemPedida(bruto: string | string[] | undefined): OrdemAplicada {
  const texto = (Array.isArray(bruto) ? bruto[0] : bruto) ?? '';
  const ascendente = !texto.startsWith('-');
  const chave = ascendente ? texto : texto.slice(1);

  if (!chaveConhecida(chave)) {
    return { bruta: ORDEM_PADRAO, coluna: COLUNAS_ORDENAVEIS.entrou, ascendente: false };
  }
  return { bruta: texto, coluna: COLUNAS_ORDENAVEIS[chave], ascendente };
}
