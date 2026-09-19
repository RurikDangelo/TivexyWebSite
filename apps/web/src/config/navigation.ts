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
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Visão geral', href: '/painel', icon: LayoutDashboard, status: 'ready' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Leads', href: '/crm/leads', icon: Target, status: 'pending' },
      { label: 'Contatos', href: '/crm/contatos', icon: Contact, status: 'pending' },
      { label: 'Empresas', href: '/crm/empresas', icon: Building2, status: 'pending' },
      { label: 'Oportunidades', href: '/crm/oportunidades', icon: Workflow, status: 'pending' },
      { label: 'Atividades', href: '/crm/atividades', icon: ClipboardList, status: 'pending' },
    ],
  },
  {
    label: 'ERP',
    items: [
      { label: 'Produtos', href: '/erp/produtos', icon: Package, status: 'pending' },
      { label: 'Vendas', href: '/erp/vendas', icon: ShoppingCart, status: 'pending' },
      { label: 'Estoque', href: '/erp/estoque', icon: Boxes, status: 'pending' },
      { label: 'Financeiro', href: '/erp/financeiro', icon: CreditCard, status: 'pending' },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { label: 'Automações', href: '/automacoes', icon: Zap, status: 'pending' },
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
