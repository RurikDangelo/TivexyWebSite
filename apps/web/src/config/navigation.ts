/**
 * O CATÁLOGO da navegação: que telas existem, com que nome, em que ordem.
 *
 * Decisão de acesso **não** mora aqui. Quem decide é a regra da rota
 * (`config/routes.ts`), aplicada por `matchRule`/`decideAccess` do Core — as
 * mesmas funções que a página executa ao abrir. Este arquivo escolhe o que
 * OFERECER; o motor é o de sempre, e é intocado de propósito.
 *
 * ## Duas superfícies, um catálogo
 *
 * `navigation` é o menu da sidebar, agrupado por módulo. `utilities` é o
 * rodapé da sidebar: as telas que são da pessoa, não do negócio — avisos,
 * conta e troca de empresa. As duas derivam visibilidade da mesma regra de
 * rota e resolvem rótulo pelo mesmo vocabulário; separadas porque são
 * desenhadas em lugares diferentes, não porque seguem regras diferentes.
 *
 * Antes desta onda, `/avisos`, `/conta` e `/empresas` eram telas de primeira
 * ordem sem entrada nenhuma no menu: só o sino levava a uma, só o dropdown à
 * outra, e à terceira não levava nada — chegava-se nela por `redirect()`.
 *
 * ## Por que todo item tem subtítulo
 *
 * O dono abriu o sistema e concluiu que faltavam módulos que existem: o quadro
 * kanban estava atrás de "Oportunidades", e criar e gerir equipe, atrás de
 * "Equipe". Rótulo de uma palavra não conta o que se faz na tela. Cada item
 * carrega uma linha curta, no infinitivo ou no indicativo, que responde "é
 * isto que eu procuro?" sem o clique de teste. Ela descreve o que a tela faz
 * **hoje** — "nenhum conectado", em Integrações, é informação, não ressalva.
 *
 * ## Por que a maquinaria de `status` fica
 *
 * Ela estava construída e desligada: os 16 itens eram `ready`, então o ramo de
 * item não-pronto de `sidebar-nav` nunca renderizava. A saída não é apagá-la —
 * é usá-la. É o mecanismo que a regra inegociável do CLAUDE.md pede: uma
 * capacidade que existe no banco e ainda não tem tela aparece como não
 * construída, em vez de sumir do produto ou, pior, virar um link que promete.
 * `Equipes` é esse caso, e `navigation.test.ts` confere no disco os dois
 * sentidos: item `ready` tem `page.tsx`, item não-pronto não tem.
 */
import { type ModuleCode, type Viewer, decideAccess, matchRule } from '@tivexy/core';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Bell,
  Blocks,
  Boxes,
  Building2,
  ClipboardList,
  Contact,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Target,
  UserRound,
  Users,
  UsersRound,
  Workflow,
  Zap,
} from 'lucide-react';

import { type TermKey, type Terms, capitalizar, customTerm } from '../lib/terms/vocabulary.ts';
import { routeRules } from './routes.ts';

/**
 * Estado real de cada item. Nenhuma rota é apresentada como pronta antes de
 * existir — a navegação mostra a estrutura sem prometer tela que não há.
 * Ver docs/PROJECT_STATE.md, que é a fonte de verdade.
 */
export type NavStatus = 'ready' | 'pending' | 'blocked';

export interface NavItem {
  /**
   * O nome genérico, curto, do jeito que cabe no menu.
   *
   * Um nicho que renomeia o recurso troca este rótulo pelo plural dele — ver
   * `labelOf()`. Sem escolha do nicho, fica este: "Estoque" é melhor no menu
   * do que "Itens de estoque", que é o nome do recurso numa frase.
   */
  label: string;
  /**
   * O que se faz nesta tela, em uma linha.
   *
   * Obrigatório, e por isso o compilador cobra de todo item novo: o defeito
   * que ela conserta é exatamente o de um rótulo curto demais para ser
   * reconhecido. Até ~70 caracteres, que é o que cabe na coluna de 16rem sem
   * virar parágrafo — `navigation.test.ts` mede.
   */
  descricao: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /**
   * O recurso do Core que este item lista, na chave do vocabulário.
   *
   * É o que faz o menu falar a língua do nicho. Sem ela o item fica com o
   * rótulo genérico para sempre, e é esse o defeito que existiu: a página de
   * leads dizia "Interessados" para a clínica e o menu, "Leads".
   */
  term?: TermKey;
  /** Por que está bloqueado. Só para `status: 'blocked'`. */
  blockedBy?: string;
}

export interface NavGroup {
  /** `null` para itens soltos no topo, sem cabeçalho de seção. */
  label: string | null;
  /** Módulo a que o grupo pertence, no vocabulário do Core. */
  module: ModuleCode;
  items: readonly NavItem[];
}

/** Um item do rodapé da sidebar. */
export interface UtilityItem extends NavItem {
  /**
   * Só aparece para quem participa de mais de uma empresa.
   *
   * Um vínculo só não tem para onde trocar, e o item seria uma porta para uma
   * lista de um elemento. É a única condição de visibilidade deste arquivo que
   * a regra de rota não sabe responder — `/empresas` é `authenticated` para
   * todo mundo, de propósito, porque quem chega nela ainda não escolheu.
   */
  exigeVariasEmpresas?: boolean;
}

export const navigation = [
  {
    label: null,
    module: 'core',
    items: [
      {
        label: 'Visão geral',
        descricao: 'Os números do período e o que precisa de atenção',
        href: '/painel',
        icon: LayoutDashboard,
        status: 'ready',
      },
      {
        label: 'Tutorial',
        descricao: 'Da empresa criada à primeira venda, passo a passo',
        href: '/tutorial',
        icon: GraduationCap,
        status: 'ready',
      },
    ],
  },
  {
    label: 'CRM',
    module: 'crm',
    items: [
      {
        label: 'Leads',
        descricao: 'Primeiro contato: registrar, qualificar e converter',
        href: '/crm/leads',
        icon: Target,
        status: 'ready',
        term: 'crm.leads',
      },
      {
        /* O dono procurou "Kanban" e não achou: o quadro é esta tela. */
        label: 'Oportunidades',
        descricao: 'O funil em quadro kanban, arrastando entre etapas',
        href: '/crm/oportunidades',
        icon: Workflow,
        status: 'ready',
        term: 'crm.deals',
      },
      {
        label: 'Contatos',
        descricao: 'As pessoas com quem a empresa fala',
        href: '/crm/contatos',
        icon: Contact,
        status: 'ready',
        term: 'crm.contacts',
      },
      {
        label: 'Empresas',
        descricao: 'As organizações a que os contatos pertencem',
        href: '/crm/empresas',
        icon: Building2,
        status: 'ready',
        term: 'crm.companies',
      },
      {
        label: 'Atividades',
        descricao: 'A agenda do que foi combinado com cada um',
        href: '/crm/atividades',
        icon: ClipboardList,
        status: 'ready',
        term: 'crm.activities',
      },
    ],
  },
  {
    label: 'ERP',
    module: 'erp',
    items: [
      {
        label: 'Produtos',
        descricao: 'Catálogo, preços e categorias',
        href: '/erp/produtos',
        icon: Package,
        status: 'ready',
        term: 'erp.products',
      },
      {
        label: 'Vendas',
        descricao: 'Registrar no balcão e consultar o que já saiu',
        href: '/erp/vendas',
        icon: ShoppingCart,
        status: 'ready',
        term: 'erp.sales',
      },
      {
        label: 'Estoque',
        descricao: 'Saldo por item e as movimentações que o mudaram',
        href: '/erp/estoque',
        icon: Boxes,
        status: 'ready',
        term: 'inventory.stock',
      },
      {
        label: 'Financeiro',
        descricao: 'Contas a receber, a pagar e o fluxo de caixa',
        href: '/erp/financeiro',
        icon: CreditCard,
        status: 'ready',
      },
    ],
  },
  {
    label: 'Plataforma',
    module: 'core',
    items: [
      {
        label: 'Automações',
        descricao: 'Regras internas: gatilho, condição e ação',
        href: '/automacoes',
        icon: Zap,
        status: 'ready',
        term: 'automation.rules',
      },
      {
        /* A tela não conecta nada, e o subtítulo não deixa parecer que sim. */
        label: 'Integrações',
        descricao: 'O que cada serviço externo exige — nenhum conectado',
        href: '/integracoes',
        icon: Blocks,
        status: 'ready',
        term: 'integrations.connections',
      },
      {
        /*
         * Era "Equipe", o único item da Plataforma sem `term`, e o substantivo
         * estava emprestado de outra entidade: "equipe/equipes" é o termo de
         * `core.teams`, e esta tela lista `core.users`. Quem procurava equipes
         * abria aqui, via uma lista de gente e concluía — corretamente — que a
         * tela de equipes não existia.
         */
        label: 'Pessoas',
        descricao: 'Convidar, trocar papel e encerrar acesso',
        href: '/equipe',
        icon: Users,
        status: 'ready',
        term: 'core.users',
      },
      {
        /*
         * Capacidade real sem porta: `teams` e `team_members` existem no banco,
         * com RLS e com `core.teams.read` concedida a Administrador, Gestor e
         * Colaborador — e nenhuma tela. Declarar como `pending` é o oposto de
         * fingir: diz que a capacidade existe e a tela não, em vez de deixar o
         * recurso invisível. `sidebar-nav` desenha isto sem link.
         *
         * O caminho é filho de `/equipe` porque é o único jeito de a regra de
         * rota continuar declarada (`routes.ts` não é desta onda): hoje ele
         * herda `core.users.read`, que na prática é o mesmo público de
         * `core.teams.read`. Ao nascer a tela, a rota ganha regra própria com
         * `core.teams.read` e o item vira `ready` — e aí o teste volta a exigir
         * que o termo bata com a permissão da rota.
         */
        label: 'Equipes',
        descricao: 'Agrupar pessoas em equipes',
        href: '/equipe/times',
        icon: UsersRound,
        status: 'pending',
        term: 'core.teams',
      },
      {
        label: 'Configurações',
        descricao: 'Moeda, fuso e as regras de cada módulo',
        href: '/configuracoes',
        icon: Settings,
        status: 'ready',
      },
    ],
  },
  {
    label: 'Administração',
    module: 'core',
    items: [
      {
        label: 'Super Admin',
        descricao: 'As empresas clientes e as automações que falharam',
        href: '/admin',
        icon: ShieldCheck,
        status: 'ready',
      },
    ],
  },
] as const satisfies readonly NavGroup[];

/**
 * O rodapé da sidebar: o que é da pessoa, não do negócio.
 *
 * Fora dos grupos de módulo de propósito. "Minha conta" no meio do CRM seria
 * ruído; no rodapé, junto de avisos e da troca de empresa, é o bloco que
 * responde "e eu?". O sino do header continua sendo atalho para `/avisos` — o
 * item existe para a tela não depender dele, já que sem aviso não lido o sino
 * perde o número e deixa de convidar.
 */
export const utilities = [
  {
    label: 'Avisos',
    descricao: 'O que as automações registraram para você',
    href: '/avisos',
    icon: Bell,
    status: 'ready',
  },
  {
    label: 'Minha conta',
    descricao: 'Seu nome, sua senha e as suas sessões',
    href: '/conta',
    icon: UserRound,
    status: 'ready',
  },
  {
    /*
     * "Trocar de empresa", e não "Empresas": já existe um "Empresas" no CRM,
     * que é outra coisa — as organizações dos contatos. Dois itens com o mesmo
     * substantivo e destinos diferentes na mesma coluna é a classe de confusão
     * que esta onda está consertando.
     */
    label: 'Trocar de empresa',
    descricao: 'Ir para outra empresa em que você tem acesso',
    href: '/empresas',
    icon: ArrowLeftRight,
    status: 'ready',
    exigeVariasEmpresas: true,
  },
] as const satisfies readonly UtilityItem[];

/** Um caminho que existe no menu. Título de página com caminho errado não compila. */
export type NavHref =
  (typeof navigation)[number]['items'][number]['href'] | (typeof utilities)[number]['href'];

/** Os grupos sem os literais do `as const`, para quem só quer percorrer. */
const grupos: readonly NavGroup[] = navigation;

/** O rodapé sem os literais do `as const`. */
const rodape: readonly UtilityItem[] = utilities;

/** Todos os itens declarados — menu e rodapé —, em ordem, num nível só. */
export const navItems: readonly NavItem[] = [...grupos.flatMap((grupo) => grupo.items), ...rodape];

export const statusLabel: Record<NavStatus, string> = {
  ready: 'disponível',
  pending: 'em construção',
  blocked: 'bloqueado',
};

/**
 * O rótulo deste item para este tenant.
 *
 * O nome do nicho vence; sem ele, o rótulo curto do menu. É a mesma função que
 * dá título às páginas (`sectionTitle`), então menu e página não têm como
 * discordar — que é o único jeito de garantir que não vão.
 */
export function labelOf(item: NavItem, terms: Terms): string {
  if (item.term === undefined) return item.label;
  const escolhido = customTerm(terms, item.term);
  return escolhido === null ? item.label : capitalizar(escolhido.plural);
}

const PORCAMINHO = new Map<string, NavItem>(navItems.map((item) => [item.href, item]));

/** O título da página de uma seção do menu, no vocabulário do tenant. */
export function sectionTitle(terms: Terms, href: NavHref): string {
  const item = PORCAMINHO.get(href);
  /* O tipo de `href` impede o caminho errado; isto é a rede para o `as const` sumir um dia. */
  if (item === undefined) throw new Error(`"${href}" não está no menu`);
  return labelOf(item, terms);
}

/** Um item do menu já resolvido para quem está vendo. */
export interface VisibleItem extends NavItem {
  label: string;
}

export interface VisibleGroup {
  label: string | null;
  items: readonly VisibleItem[];
}

/**
 * Esta pessoa alcançaria esta tela?
 *
 * **A regra é a da rota**, não uma segunda lista de quem pode o quê. O item é
 * avaliado por `decideAccess()` contra `routeRules` — a mesma decisão que a
 * página vai tomar ao abrir. É uma função só porque o menu e o rodapé
 * precisam da mesma resposta, e duas cópias dela é que seriam o defeito.
 *
 * Sem empresa escolhida, os itens da operação somem mesmo para o Super Admin:
 * `decideAccess` o deixaria entrar, e a página não teria de quem mostrar dado.
 */
function alcanca(item: NavItem, viewer: Viewer): boolean {
  const regra = matchRule(routeRules, item.href);
  const daOperacao = regra.kind === 'member' || regra.kind === 'permission';
  if (daOperacao && viewer.tenant === null) return false;
  return decideAccess(regra, viewer).allowed;
}

/**
 * O que esta pessoa vê no menu.
 *
 * Um item que a página negaria não aparece:
 *
 * - **Módulo não contratado** some. A cafeteria não tem CRM, e um grupo CRM no
 *   menu dela seria uma porta para "módulo não contratado".
 * - **Sem permissão** some. O barista não precisa de um "Financeiro" que o
 *   manda para a página de acesso negado.
 * - **O grupo de administração não existe para quem não é Super Admin.** Não
 *   desabilitado, não com cadeado — ausente. Um item "Super Admin" acinzentado
 *   no menu de um cliente conta a ele que existe um painel acima do dele.
 *
 * Esconder não é a proteção. A página nega, e o RLS nega abaixo dela; o menu
 * só não oferece o que vai ser negado.
 *
 * Item `pending` continua aqui: ele não é uma porta, é um aviso de que a tela
 * não existe — e quem não alcançaria a rota também não precisa do aviso.
 */
export function visibleNavigation(viewer: Viewer, terms: Terms): VisibleGroup[] {
  return grupos.flatMap((grupo): VisibleGroup[] => {
    const itens = grupo.items.flatMap((item): VisibleItem[] => {
      if (!alcanca(item, viewer)) return [];
      return [{ ...item, label: labelOf(item, terms) }];
    });
    return itens.length === 0 ? [] : [{ label: grupo.label, items: itens }];
  });
}

/** O que a pessoa pode alcançar além do menu — quantas empresas, por ora. */
export interface AlcanceDaPessoa {
  /**
   * Quantas empresas esta pessoa pode abrir. É `options.length` de
   * `requireSession()`, o mesmo número que o seletor de empresa já recebe.
   */
  empresas: number;
}

/**
 * O rodapé da sidebar desta pessoa.
 *
 * Mesma derivação do menu, mesma resolução de rótulo — por isso devolve
 * `VisibleItem`, e quem desenha trata os dois blocos igual. O padrão
 * conservador é uma empresa: sem saber o número, o item de troca não aparece,
 * porque oferecê-lo a quem tem um vínculo só é pior do que omiti-lo.
 */
export function utilityNavigation(
  viewer: Viewer,
  terms: Terms,
  alcance: AlcanceDaPessoa = { empresas: 1 },
): VisibleItem[] {
  return rodape.flatMap((item): VisibleItem[] => {
    if (item.exigeVariasEmpresas === true && alcance.empresas < 2) return [];
    if (!alcanca(item, viewer)) return [];
    return [{ ...item, label: labelOf(item, terms) }];
  });
}
