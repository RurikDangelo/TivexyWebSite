import type { IconName } from '@/components/ui/icons';

export interface Problem {
  icon: IconName;
  title: string;
  detail: string;
}

export const problems: Problem[] = [
  {
    icon: 'sheet',
    title: 'Planilhas espalhadas',
    detail: 'Cada área com uma versão diferente da mesma informação.',
  },
  {
    icon: 'pen',
    title: 'Processos manuais',
    detail: 'Horas da equipe gastas em etapas que poderiam acontecer sozinhas.',
  },
  {
    icon: 'unlink',
    title: 'Sistemas que não conversam entre si',
    detail: 'O mesmo dado digitado duas, três vezes, em ferramentas diferentes.',
  },
  {
    icon: 'eye-off',
    title: 'Falta de visibilidade',
    detail: 'Decisões tomadas sem saber o que realmente está acontecendo.',
  },
  {
    icon: 'repeat',
    title: 'Tarefas repetitivas',
    detail: 'Copiar, colar, conferir. Todos os dias, do mesmo jeito.',
  },
  {
    icon: 'scatter',
    title: 'Informações descentralizadas',
    detail: 'O que importa está no e-mail, no WhatsApp ou na cabeça de alguém.',
  },
  {
    icon: 'legacy',
    title: 'Sistemas ultrapassados',
    detail: 'Softwares antigos que travam a empresa em vez de acompanhar o crescimento.',
  },
];
