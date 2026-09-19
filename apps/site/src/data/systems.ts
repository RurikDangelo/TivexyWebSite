/**
 * Sistemas base da Tivexy, apresentados na seção "Cases e projetos".
 *
 * São modelos que a Tivexy adapta aos processos de cada negócio, não cases de clientes.
 * Os valores que aparecem nas telas (src/components/ui/SystemPreview.astro) são ilustrativos.
 */
import type { IconName } from '@/components/ui/icons';

export type SystemId = 'cafeteria' | 'mercado' | 'erp' | 'crm';

export interface SystemShowcase {
  id: SystemId;
  /** Rótulo curto da aba. */
  tab: string;
  /** Complemento da aba, visível só em telas largas. */
  tabHint: string;
  icon: IconName;
  segment: string;
  name: string;
  description: string;
  features: string[];
}

export const systems: SystemShowcase[] = [
  {
    id: 'cafeteria',
    tab: 'Cafeterias',
    tabHint: 'Comandas e caixa',
    icon: 'coffee',
    segment: 'Cafeterias e padarias',
    name: 'Sistema para cafeterias',
    description:
      'Comandas, cardápio e caixa no mesmo lugar. O pedido sai do balcão ou da mesa e aparece na hora na tela de preparo.',
    features: [
      'Comandas por mesa e balcão',
      'Cardápio com adicionais',
      'Tela de preparo',
      'Fechamento de caixa',
    ],
  },
  {
    id: 'mercado',
    tab: 'Mercados',
    tabHint: 'Caixa e estoque',
    icon: 'cart',
    segment: 'Mercados e mercearias',
    name: 'Sistema para mercados',
    description:
      'Frente de caixa ligada ao estoque. Cada venda dá baixa no produto, e o sistema avisa quando é hora de repor.',
    features: [
      'Frente de caixa',
      'Estoque em tempo real',
      'Alerta de reposição',
      'Pedidos de compra',
    ],
  },
  {
    id: 'erp',
    tab: 'ERP',
    tabHint: 'Gestão integrada',
    icon: 'grid',
    segment: 'Gestão empresarial',
    name: 'ERP essencial',
    description:
      'Financeiro, estoque e compras integrados, com relatórios que mostram como a empresa está hoje, sem juntar planilhas.',
    features: [
      'Contas a pagar e receber',
      'Fluxo de caixa',
      'Estoque e compras',
      'Relatórios gerenciais',
    ],
  },
  {
    id: 'crm',
    tab: 'CRM',
    tabHint: 'Funil e clientes',
    icon: 'users',
    segment: 'Vendas e relacionamento',
    name: 'CRM essencial',
    description:
      'Cada oportunidade em uma etapa do funil, com o histórico do cliente e lembretes para nenhum contato ficar sem resposta.',
    features: [
      'Funil de vendas',
      'Histórico do cliente',
      'Tarefas e lembretes',
      'Integração com WhatsApp',
    ],
  },
];
