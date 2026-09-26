/**
 * O tutorial de ponta a ponta: a empresa nasce no Admin, a equipe entra, o
 * CRM e o ERP ganham o primeiro registro, e a primeira automação liga.
 *
 * **"Feito" é contado no banco, não marcado à mão.** Um passo está feito
 * quando o que ele pede existe — um produto, uma venda. Marcar com um clique
 * seria o tutorial dizendo que a empresa vende quando ela nunca vendeu.
 *
 * O acesso a cada passo é o da própria rota (`routeRules`): o tutorial não
 * tem uma segunda lista de quem pode o quê. Módulo não contratado aparece
 * como tal; passo que é de outra pessoa diz isso, em vez de mandar para a
 * página de acesso negado.
 */

import {
  type ModuleCode,
  type PermissionCode,
  type Viewer,
  can,
  decideAccess,
  matchRule,
} from '@tivexy/core';

import { routeRules } from '../../config/routes.ts';
import { type Terms, capitalizar, termOf } from '../terms/vocabulary.ts';

/** O que se conta no banco para saber se o passo está feito. */
export type Contagem =
  | 'dados-da-empresa'
  | 'equipe'
  | 'crm-leads'
  | 'crm-deals'
  | 'crm-activities'
  | 'erp-products'
  | 'inventory-in'
  | 'erp-sales'
  | 'finance-entries'
  | 'automation-rules';

export type SecaoDoTutorial = 'empresa' | 'crm' | 'erp' | 'automacoes';

export interface Passo {
  codigo: string;
  secao: SecaoDoTutorial;
  titulo: string;
  como: string;
  /** Como o tutorial sabe que está feito — dito na tela, para ninguém achar que é mágica. */
  prontoQuando: string;
  href: string;
  contagem: Contagem;
  /** Quantos precisam existir: a equipe precisa de dois — quem entrou e mais alguém. */
  minimo: number;
  /** Para contar é preciso ler. `null`: a linha da própria empresa, que todo membro lê. */
  leitura: PermissionCode | null;
}

export type EstadoDoPasso =
  | 'feito'
  | 'a-fazer'
  /** Falta, e quem faz é outra pessoa: esta não alcança a tela. */
  | 'com-outra-pessoa'
  | 'sem-modulo'
  /** Não dá para saber: esta pessoa não lê o que se contaria. */
  | 'sem-acesso'
  /** A contagem falhou. */
  | 'desconhecido'
  | 'sem-empresa';

export const SECOES: readonly { codigo: SecaoDoTutorial; titulo: string; modulo: ModuleCode }[] = [
  { codigo: 'empresa', titulo: 'Primeiro acesso', modulo: 'core' },
  { codigo: 'crm', titulo: 'CRM', modulo: 'crm' },
  { codigo: 'erp', titulo: 'ERP', modulo: 'erp' },
  { codigo: 'automacoes', titulo: 'Automações', modulo: 'automation' },
];

/** Os passos, no vocabulário da empresa. Sem artigo junto do nome do nicho. */
export function passosDoTutorial(terms: Terms): Passo[] {
  const t = (chave: Parameters<typeof termOf>[1]) => termOf(terms, chave);
  return [
    {
      codigo: 'dados',
      secao: 'empresa',
      titulo: 'Conferir os dados da empresa',
      como: 'Razão social e CNPJ ou CPF em Configurações — e o fuso, que decide o "hoje" da agenda e do caixa.',
      prontoQuando: 'Pronto quando razão social e documento estão cadastrados.',
      href: '/configuracoes',
      contagem: 'dados-da-empresa',
      minimo: 1,
      leitura: null,
    },
    {
      codigo: 'equipe',
      secao: 'empresa',
      titulo: 'Chamar a equipe',
      como: 'Em Equipe, convide cada pessoa com o papel dela. O convite gera um link — o envio por e-mail ainda depende do SMTP, que é externo.',
      prontoQuando: 'Pronto quando há mais alguém além de você, mesmo que só convidado.',
      href: '/equipe',
      contagem: 'equipe',
      minimo: 2,
      leitura: 'core.users.read',
    },
    {
      codigo: 'lead',
      secao: 'crm',
      titulo: `Cadastrar ${t('crm.leads').singular}`,
      como: `Quem chegou e ainda não virou negócio: nome, contato e origem. Em ${capitalizar(t('crm.leads').plural)}.`,
      prontoQuando: `Pronto com o primeiro cadastro em ${t('crm.leads').plural}.`,
      href: '/crm/leads',
      contagem: 'crm-leads',
      minimo: 1,
      leitura: 'crm.leads.read',
    },
    {
      codigo: 'oportunidade',
      secao: 'crm',
      titulo: `Levar ${t('crm.deals').singular} pelo funil`,
      como: 'Crie no quadro e arraste de etapa em etapa até o ganho ou a perda. O funil veio pronto do Blueprint.',
      prontoQuando: `Pronto com o primeiro cadastro em ${t('crm.deals').plural}.`,
      href: '/crm/oportunidades',
      contagem: 'crm-deals',
      minimo: 1,
      leitura: 'crm.deals.read',
    },
    {
      codigo: 'atividade',
      secao: 'crm',
      titulo: `Agendar ${t('crm.activities').singular}`,
      como: 'Ligação, visita, retorno — com prazo e responsável. A agenda separa o atrasado do que é hoje.',
      prontoQuando: `Pronto com o primeiro registro em ${t('crm.activities').plural}.`,
      href: '/crm/atividades',
      contagem: 'crm-activities',
      minimo: 1,
      leitura: 'crm.activities.read',
    },
    {
      codigo: 'produto',
      secao: 'erp',
      titulo: `Cadastrar ${t('erp.products').singular}`,
      como: 'Nome, preço, custo, unidade e estoque mínimo. As categorias vieram do Blueprint.',
      prontoQuando: `Pronto com o primeiro cadastro em ${t('erp.products').plural}.`,
      href: '/erp/produtos',
      contagem: 'erp-products',
      minimo: 1,
      leitura: 'erp.products.read',
    },
    {
      codigo: 'estoque',
      secao: 'erp',
      titulo: 'Dar entrada no estoque',
      como: 'Uma entrada ou uma contagem. A venda baixa sozinha depois — e o saldo pode ficar negativo, de propósito, para a venda nunca parar.',
      prontoQuando: 'Pronto com a primeira entrada ou contagem.',
      href: '/erp/estoque',
      contagem: 'inventory-in',
      minimo: 1,
      leitura: 'inventory.movements.read',
    },
    {
      codigo: 'venda',
      secao: 'erp',
      titulo: `Registrar ${t('erp.sales').singular}`,
      como: 'No balcão: busque ou leia o código, informe o pagamento, registre. O comprovante é interno — não é nota fiscal.',
      prontoQuando: `Pronto com o primeiro registro em ${t('erp.sales').plural}.`,
      href: '/erp/vendas/nova',
      contagem: 'erp-sales',
      minimo: 1,
      leitura: 'erp.sales.read',
    },
    {
      codigo: 'financeiro',
      secao: 'erp',
      titulo: 'Ver o dinheiro no financeiro',
      como: 'O pagamento vira conta a receber sozinho — já recebida quando é à vista. Lance ali também o que a empresa paga.',
      prontoQuando: 'Pronto com o primeiro lançamento — o da venda conta.',
      href: '/erp/financeiro',
      contagem: 'finance-entries',
      minimo: 1,
      leitura: 'finance.cashflow.read',
    },
    {
      codigo: 'automacao',
      secao: 'automacoes',
      titulo: `Ligar ${t('automation.rules').singular}`,
      como: 'Comece por um modelo: aviso de venda acima de um valor, saldo no mínimo. Tudo interno — nada sai por e-mail ou WhatsApp.',
      prontoQuando: `Pronto com o primeiro cadastro em ${t('automation.rules').plural}.`,
      href: '/automacoes',
      contagem: 'automation-rules',
      minimo: 1,
      leitura: 'automation.rules.read',
    },
  ];
}

/** O estado de um passo para esta pessoa, com as contagens do banco. */
export function estadoDoPasso(
  passo: Passo,
  viewer: Viewer,
  contagens: ReadonlyMap<Contagem, number | null>,
): EstadoDoPasso {
  if (viewer.tenant === null) return 'sem-empresa';
  const acesso = decideAccess(matchRule(routeRules, passo.href), viewer);
  if (!acesso.allowed && acesso.reason === 'module-disabled') return 'sem-modulo';
  if (passo.leitura !== null && !can(viewer, passo.leitura)) return 'sem-acesso';
  const n = contagens.get(passo.contagem);
  if (n === undefined || n === null) return 'desconhecido';
  if (n >= passo.minimo) return 'feito';
  return acesso.allowed ? 'a-fazer' : 'com-outra-pessoa';
}

/**
 * "4 de 9": os feitos sobre os que dá para fazer ou conferir. Módulo não
 * contratado e o que não se pode ler ficam fora — contar como pendente seria
 * cobrar o que a empresa não tem.
 */
export function progresso(estados: readonly EstadoDoPasso[]): { feitos: number; total: number } {
  const contam = estados.filter(
    (e) => e === 'feito' || e === 'a-fazer' || e === 'com-outra-pessoa',
  );
  return { feitos: contam.filter((e) => e === 'feito').length, total: contam.length };
}
