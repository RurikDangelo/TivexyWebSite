import type { ModuleCode } from '@tivexy/core';
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
  Sparkles,
  ShoppingCart,
  Target,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

/**
 * Estado real de cada item. Nenhuma rota é apresentada como pronta antes de
 * existir — a navegação mostra a estrutura sem prometer tela que não há.
 * Ver docs/PROJECT_STATE.md, que é a fonte de verdade.
 */
export type NavStatus = 'ready' | 'pending' | 'blocked';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /** Por que está bloqueado. Só para `status: 'blocked'`. */
  blockedBy?: string;
}

export interface NavGroup {
  /** `null` para itens soltos no topo, sem cabeçalho de seção. */
  label: string | null;
  /**
   * Módulo a que o grupo pertence, no vocabulário do Core. Quando houver
   * tenant, é por aqui que a casca esconde o que não está habilitado —
   * `tenant_modules` é a verdade sobre acesso, não o plano.
   */
  module: ModuleCode;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    label: null,
    module: 'core',
    items: [
      { label: 'Visão geral', href: '/painel', icon: LayoutDashboard, status: 'ready' },
      { label: 'Primeiros passos', href: '/tutorial', icon: Sparkles, status: 'ready' },
    ],
  },
  {
    label: 'CRM',
    module: 'crm',
    items: [
      { label: 'Leads', href: '/crm/leads', icon: Target, status: 'ready' },
      { label: 'Contatos', href: '/crm/contatos', icon: Contact, status: 'ready' },
      { label: 'Empresas', href: '/crm/empresas', icon: Building2, status: 'ready' },
      { label: 'Oportunidades', href: '/crm/oportunidades', icon: Workflow, status: 'ready' },
      { label: 'Atividades', href: '/crm/atividades', icon: ClipboardList, status: 'ready' },
    ],
  },
  {
    label: 'ERP',
    module: 'erp',
    items: [
      { label: 'Produtos', href: '/erp/produtos', icon: Package, status: 'ready' },
      { label: 'Vendas', href: '/erp/vendas', icon: ShoppingCart, status: 'ready' },
      { label: 'Estoque', href: '/erp/estoque', icon: Boxes, status: 'ready' },
      { label: 'Financeiro', href: '/erp/financeiro', icon: CreditCard, status: 'ready' },
    ],
  },
  {
    label: 'Plataforma',
    module: 'integrations',
    items: [
      { label: 'Automações', href: '/automacoes', icon: Zap, status: 'ready' },
      {
        label: 'Integrações',
        href: '/integracoes',
        icon: Blocks,
        status: 'blocked',
        blockedBy: 'Credenciais Meta, fiscal e bancárias',
      },
      { label: 'Equipe', href: '/equipe', icon: Users, status: 'pending' },
      { label: 'Configurações', href: '/configuracoes', icon: Settings, status: 'pending' },
    ],
  },
  {
    label: 'Administração',
    module: 'core',
    items: [
      {
        label: 'Super Admin',
        href: '/admin',
        icon: ShieldCheck,
        status: 'blocked',
        blockedBy: 'Provisionamento e RBAC',
      },
    ],
  },
];

export const statusLabel: Record<NavStatus, string> = {
  ready: 'disponível',
  pending: 'em construção',
  blocked: 'bloqueado',
};
