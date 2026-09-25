/**
 * O vocabulário padrão do Tivexy, e como o de um tenant se sobrepõe a ele.
 *
 * Puro de propósito: roda no servidor, que lê `tenants.terms`, e no cliente,
 * que desenha o menu. Uma segunda cópia desta regra no menu é exatamente o
 * defeito que existiu — a página dizia "Interessados" e o menu, "Leads",
 * porque cada um resolvia o nome do seu jeito, e o menu não resolvia.
 *
 * ## Uma chave para cada recurso do Core, e nenhuma a mais
 *
 * `DEFAULT_TERMS` cobre exatamente `TERM_KEYS`, e o teste compara as duas nos
 * dois sentidos. Assim toda tela pede o nome de um recurso sem precisar
 * carregar o próprio padrão — que é como o padrão diverge de uma tela para a
 * outra.
 *
 * ## Frase com rótulo não leva artigo
 *
 * O gênero muda com o nicho: a consultoria tem **uma** oportunidade, a clínica
 * tem **um** tratamento. "Nenhuma {singular}" vira "Nenhuma tratamento" na tela
 * da clínica. Por isso as frases que recebem rótulo usam verbo e substantivo —
 * "Cadastrar {singular}", "Ainda não há {plural}" — e nunca artigo, pronome ou
 * adjetivo flexionado junto do nome.
 */

import type { Term } from '@tivexy/core';

export type Terms = Readonly<Record<string, Term>>;

export const SEM_TERMOS: Terms = Object.freeze({});

/**
 * Como cada recurso se chama quando o nicho não diz nada.
 *
 * Minúsculo, porque é assim que o nome aparece no meio da frase. O título usa
 * `capitalizar()`.
 */
export const DEFAULT_TERMS = {
  'ai.assistant': { singular: 'assistente', plural: 'assistentes' },
  'automation.rules': { singular: 'automação', plural: 'automações' },
  'core.audit': { singular: 'registro de auditoria', plural: 'registros de auditoria' },
  'core.roles': { singular: 'papel', plural: 'papéis' },
  'core.settings': { singular: 'configuração', plural: 'configurações' },
  'core.teams': { singular: 'equipe', plural: 'equipes' },
  'core.tenant': { singular: 'empresa', plural: 'empresas' },
  'core.users': { singular: 'pessoa da equipe', plural: 'pessoas da equipe' },
  'crm.activities': { singular: 'atividade', plural: 'atividades' },
  'crm.companies': { singular: 'empresa', plural: 'empresas' },
  'crm.contacts': { singular: 'contato', plural: 'contatos' },
  'crm.deals': { singular: 'oportunidade', plural: 'oportunidades' },
  'crm.leads': { singular: 'lead', plural: 'leads' },
  'erp.customers': { singular: 'cliente', plural: 'clientes' },
  'erp.products': { singular: 'produto', plural: 'produtos' },
  'erp.purchases': { singular: 'compra', plural: 'compras' },
  'erp.sales': { singular: 'venda', plural: 'vendas' },
  'erp.suppliers': { singular: 'fornecedor', plural: 'fornecedores' },
  'finance.cashflow': { singular: 'lançamento', plural: 'lançamentos' },
  'finance.payables': { singular: 'conta a pagar', plural: 'contas a pagar' },
  'finance.receivables': { singular: 'conta a receber', plural: 'contas a receber' },
  'fiscal.documents': { singular: 'documento fiscal', plural: 'documentos fiscais' },
  'integrations.connections': { singular: 'integração', plural: 'integrações' },
  'inventory.movements': { singular: 'movimentação', plural: 'movimentações' },
  'inventory.stock': { singular: 'item de estoque', plural: 'itens de estoque' },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof DEFAULT_TERMS;

/**
 * O nome que este tenant **escolheu** para o recurso, ou `null`.
 *
 * Separado de `termOf()` porque o menu precisa distinguir as duas coisas: sem
 * escolha do nicho, ele mantém o rótulo curto que já tem ("Estoque"); com
 * escolha, passa a usar o nome do nicho ("Insumos").
 *
 * Veio do banco, então pode ter qualquer forma. Rótulo vazio, ou só com
 * espaço, conta como ausente — um espaço em branco no menu é pior que o
 * nome genérico.
 */
export function customTerm(terms: Terms, key: string): Term | null {
  const escolhido = terms[key] as unknown;
  if (escolhido === null || typeof escolhido !== 'object') return null;

  const { singular, plural } = escolhido as Record<string, unknown>;
  const s = typeof singular === 'string' ? singular.trim() : '';
  const p = typeof plural === 'string' ? plural.trim() : '';
  if (s === '' || p === '') return null;

  return { singular: s, plural: p };
}

/** O nome do recurso neste tenant, caindo no padrão do Tivexy. */
export function termOf(terms: Terms, key: TermKey): Term {
  return customTerm(terms, key) ?? DEFAULT_TERMS[key];
}

/** Primeira letra maiúscula, para começo de frase e título. */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}
