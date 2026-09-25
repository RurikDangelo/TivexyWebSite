import { type ModuleCode, type Viewer, decideAccess, matchRule } from '@tivexy/core';
import type { LucideIcon } from 'lucide-react';
import {
  Blocks,
  Boxes,
  Building2,
  ClipboardList,
  Contact,
  CreditCard,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Target,
  Users,
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

export const navigation = [
  {
    label: null,
    module: 'core',
    items: [{ label: 'Visão geral', href: '/painel', icon: LayoutDashboard, status: 'ready' }],
  },
  {
    label: 'CRM',
    module: 'crm',
    items: [
      { label: 'Leads', href: '/crm/leads', icon: Target, status: 'ready', term: 'crm.leads' },
      {
        label: 'Oportunidades',
        href: '/crm/oportunidades',
        icon: Workflow,
        status: 'ready',
        term: 'crm.deals',
      },
      {
        label: 'Contatos',
        href: '/crm/contatos',
        icon: Contact,
        status: 'ready',
        term: 'crm.contacts',
      },
      {
        label: 'Empresas',
        href: '/crm/empresas',
        icon: Building2,
        status: 'ready',
        term: 'crm.companies',
      },
      {
        label: 'Atividades',
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
        href: '/erp/produtos',
        icon: Package,
        status: 'pending',
        term: 'erp.products',
      },
      {
        label: 'Vendas',
        href: '/erp/vendas',
        icon: ShoppingCart,
        status: 'pending',
        term: 'erp.sales',
      },
      {
        label: 'Estoque',
        href: '/erp/estoque',
        icon: Boxes,
        status: 'pending',
        term: 'inventory.stock',
      },
      { label: 'Financeiro', href: '/erp/financeiro', icon: CreditCard, status: 'pending' },
    ],
  },
  {
    label: 'Plataforma',
    module: 'core',
    items: [
      {
        label: 'Automações',
        href: '/automacoes',
        icon: Zap,
        status: 'pending',
        term: 'automation.rules',
      },
      {
        label: 'Integrações',
        href: '/integracoes',
        icon: Blocks,
        status: 'pending',
        term: 'integrations.connections',
      },
      { label: 'Equipe', href: '/equipe', icon: Users, status: 'ready' },
      { label: 'Configurações', href: '/configuracoes', icon: Settings, status: 'ready' },
    ],
  },
  {
    label: 'Administração',
    module: 'core',
    items: [{ label: 'Super Admin', href: '/admin', icon: ShieldCheck, status: 'ready' }],
  },
] as const satisfies readonly NavGroup[];

/** Um caminho que existe no menu. Título de página com caminho errado não compila. */
export type NavHref = (typeof navigation)[number]['items'][number]['href'];

/** Os grupos sem os literais do `as const`, para quem só quer percorrer. */
const grupos: readonly NavGroup[] = navigation;

/** Todos os itens, em ordem, num nível só. */
export const navItems: readonly NavItem[] = grupos.flatMap((grupo) => grupo.items);

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
 * O que esta pessoa vê no menu.
 *
 * **A regra é a da rota**, não uma segunda lista de quem pode o quê. Cada item
 * é avaliado por `decideAccess()` contra `routeRules` — a mesma decisão que a
 * página vai tomar ao abrir. Um item que a página negaria não aparece:
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
 * Sem empresa escolhida, os itens da operação somem mesmo para o Super Admin:
 * `decideAccess` o deixaria entrar, e a página não teria de quem mostrar dado.
 */
export function visibleNavigation(viewer: Viewer, terms: Terms): VisibleGroup[] {
  return grupos.flatMap((grupo): VisibleGroup[] => {
    const itens = grupo.items.flatMap((item): VisibleItem[] => {
      const regra = matchRule(routeRules, item.href);
      const daOperacao = regra.kind === 'member' || regra.kind === 'permission';
      if (daOperacao && viewer.tenant === null) return [];
      if (!decideAccess(regra, viewer).allowed) return [];
      return [{ ...item, label: labelOf(item, terms) }];
    });
    return itens.length === 0 ? [] : [{ label: grupo.label, items: itens }];
  });
}
