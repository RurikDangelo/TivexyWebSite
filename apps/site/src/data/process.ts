export interface ProcessStep {
  number: string;
  title: string;
  text: string;
  outcome: string;
}

export const processSteps: ProcessStep[] = [
  {
    number: '01',
    title: 'Descoberta',
    text: 'Entendemos seu negócio, processos e objetivos.',
    outcome: 'Diagnóstico do cenário atual',
  },
  {
    number: '02',
    title: 'Estratégia',
    text: 'Definimos a melhor solução tecnológica.',
    outcome: 'Plano com escopo e prioridades',
  },
  {
    number: '03',
    title: 'Desenvolvimento',
    text: 'Construímos, testamos e validamos a solução.',
    outcome: 'Solução validada e pronta para uso',
  },
  {
    number: '04',
    title: 'Evolução',
    text: 'Continuamos melhorando o produto conforme sua empresa cresce.',
    outcome: 'Melhorias contínuas',
  },
];
