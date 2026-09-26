export interface Capability {
  /** Nome técnico, exibido pequeno. O título fala do benefício. */
  label: string;
  title: string;
  text: string;
}

export const capabilities: Capability[] = [
  {
    label: 'Cloud',
    title: 'Acesso de qualquer lugar',
    text: 'Sistemas na nuvem, disponíveis no escritório, em casa ou em campo.',
  },
  {
    label: 'Aplicações web e SaaS',
    title: 'Funciona no navegador e no celular',
    text: 'Sem instalação complicada. A equipe usa no dispositivo que já tem.',
  },
  {
    label: 'Integrações e APIs',
    title: 'Ferramentas que conversam',
    text: 'Seus sistemas trocam informações sozinhos, sem digitação em dobro.',
  },
  {
    label: 'Automação',
    title: 'Rotinas que rodam sozinhas',
    text: 'Etapas repetitivas acontecem no momento certo, com menos erros.',
  },
  {
    label: 'Banco de dados moderno',
    title: 'Informação confiável',
    text: 'Dados organizados, protegidos e prontos para virar decisão.',
  },
  {
    label: 'Inteligência artificial',
    title: 'Mais inteligência no dia a dia',
    text: 'IA aplicada onde gera produtividade de verdade, não por modismo.',
  },
];
