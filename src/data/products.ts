export type ProductId = 'os' | 'crm' | 'flow' | 'ai';

export interface Product {
  id: ProductId;
  name: string;
  description: string;
  status: 'Em breve' | 'Disponível';
}

export const products: Product[] = [
  {
    id: 'os',
    name: 'Tivexy OS',
    description: 'Tecnologia para centralizar e simplificar a gestão.',
    status: 'Em breve',
  },
  {
    id: 'crm',
    name: 'Tivexy CRM',
    description: 'Relacionamento, vendas e clientes em um só lugar.',
    status: 'Em breve',
  },
  {
    id: 'flow',
    name: 'Tivexy Flow',
    description: 'Automação inteligente para processos empresariais.',
    status: 'Em breve',
  },
  {
    id: 'ai',
    name: 'Tivexy AI',
    description: 'Inteligência artificial aplicada ao dia a dia da empresa.',
    status: 'Em breve',
  },
];
