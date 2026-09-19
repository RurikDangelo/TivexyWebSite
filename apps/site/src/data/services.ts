import type { IconName } from '@/components/ui/icons';
import type { MiniPreviewKind } from '@/components/ui/mini-preview';

export type ServiceSlug = 'sistemas-sob-medida' | 'saas' | 'automacao' | 'inteligencia-artificial';

export interface Service {
  slug: ServiceSlug;
  icon: IconName;
  /** Miniatura ilustrativa exibida no topo da página da solução. */
  preview: MiniPreviewKind;
  title: string;
  summary: string;
  examples: string[];
  page: {
    metaTitle: string;
    metaDescription: string;
    headline: string;
    intro: string;
    signals: string[];
    deliverablesTitle: string;
    deliverables: { title: string; text: string }[];
    faq: { question: string; answer: string }[];
  };
}

export const services: Service[] = [
  {
    slug: 'sistemas-sob-medida',
    icon: 'blueprint',
    preview: 'os',
    title: 'Sistemas sob medida',
    summary:
      'Software desenvolvido de acordo com os processos, necessidades e objetivos da sua empresa.',
    examples: ['Sistemas de gestão', 'Portais para clientes', 'Painéis de acompanhamento'],
    page: {
      metaTitle: 'Sistemas sob medida para empresas — Tivexy',
      metaDescription:
        'Sistemas desenvolvidos a partir dos processos da sua empresa: gestão, portais, painéis e fluxos de aprovação que crescem com o negócio.',
      headline: 'Um sistema construído a partir de como a sua empresa trabalha.',
      intro:
        'Quando nenhum software pronto encaixa na operação, a equipe se adapta com planilhas e improvisos. Um sistema sob medida faz o caminho inverso: nasce dos seus processos e cresce junto com eles.',
      signals: [
        'Vocês usam vários softwares e nenhum resolve o processo inteiro.',
        'Parte importante da operação roda em planilhas compartilhadas.',
        'O sistema atual limita o que a empresa quer fazer.',
        'Informações se perdem entre áreas, e-mails e mensagens.',
      ],
      deliverablesTitle: 'O que dá para construir',
      deliverables: [
        {
          title: 'Sistemas de gestão',
          text: 'Pedidos, estoque, produção, contratos ou qualquer rotina central da empresa reunidos em um só lugar.',
        },
        {
          title: 'Portais e áreas do cliente',
          text: 'Clientes, parceiros e fornecedores acompanham solicitações e documentos sem depender de ligações e e-mails.',
        },
        {
          title: 'Painéis de gestão',
          text: 'Os números que importam, atualizados e organizados para quem precisa decidir.',
        },
        {
          title: 'Fluxos de aprovação',
          text: 'Compras, pagamentos e pedidos com etapas claras, responsáveis definidos e histórico.',
        },
      ],
      faq: [
        {
          question: 'Preciso entender de tecnologia para contratar?',
          answer:
            'Não. Você explica como a empresa funciona e o que precisa melhorar. Traduzir isso em tecnologia é o trabalho da Tivexy.',
        },
        {
          question: 'Quanto custa um sistema sob medida?',
          answer:
            'Depende do escopo. Depois da descoberta, você recebe uma proposta clara com o que será construído, em quais etapas e com qual investimento.',
        },
        {
          question: 'Quanto tempo leva?',
          answer:
            'O prazo é definido na etapa de estratégia, junto com as prioridades do projeto, antes de qualquer desenvolvimento começar.',
        },
        {
          question: 'O sistema pode crescer depois?',
          answer:
            'Sim. A etapa de evolução existe para isso: melhorar e ampliar a solução conforme a empresa cresce.',
        },
      ],
    },
  },
  {
    slug: 'saas',
    icon: 'layers',
    preview: 'crm',
    title: 'SaaS',
    summary: 'Produtos digitais escaláveis para simplificar operações e acelerar resultados.',
    examples: ['Plataformas por assinatura', 'Produtos para o seu mercado', 'Ecossistema Tivexy'],
    page: {
      metaTitle: 'Desenvolvimento de SaaS — Tivexy',
      metaDescription:
        'Plataformas SaaS escaláveis para empresas que querem transformar conhecimento do seu mercado em produto digital por assinatura.',
      headline: 'Produtos digitais preparados para crescer com muitos clientes.',
      intro:
        'SaaS é o software acessado pela internet, normalmente por assinatura. A Tivexy desenvolve plataformas assim para empresas que querem transformar o que sabem do seu mercado em produto digital, e também constrói produtos próprios.',
      signals: [
        'Sua empresa domina um processo que outras empresas também precisam resolver.',
        'Você quer oferecer um serviço digital recorrente para seus clientes.',
        'Uma solução interna já funciona bem e pode virar produto.',
        'O produto precisa atender muitos clientes, cada um com seus dados separados.',
      ],
      deliverablesTitle: 'O que entregamos',
      deliverables: [
        {
          title: 'Plataforma completa',
          text: 'Cadastro, planos, permissões e a área principal do produto, prontos para receber clientes.',
        },
        {
          title: 'Painel administrativo',
          text: 'Visão de clientes, uso e operação do produto para quem administra o negócio.',
        },
        {
          title: 'Base para crescer',
          text: 'Estrutura preparada para aumentar o número de clientes sem precisar refazer o sistema.',
        },
        {
          title: 'Evolução contínua',
          text: 'Novas funcionalidades lançadas com segurança, sem interromper quem já usa o produto.',
        },
      ],
      faq: [
        {
          question: 'Qual a diferença entre sistema sob medida e SaaS?',
          answer:
            'O sistema sob medida resolve a operação de uma empresa. O SaaS é um produto usado por várias empresas, cada uma com a sua conta.',
        },
        {
          question: 'A Tivexy tem produtos próprios?',
          answer:
            'Sim. O ecossistema Tivexy reúne Tivexy OS, CRM, Flow e AI, com lançamentos em breve. Você pode pedir para ser avisado.',
        },
        {
          question: 'Posso começar com uma versão menor?',
          answer:
            'Pode. Na estratégia, definimos a primeira versão do produto com o essencial para validar a ideia com clientes reais.',
        },
      ],
    },
  },
  {
    slug: 'automacao',
    icon: 'flow',
    preview: 'flow',
    title: 'Automação',
    summary: 'Automatize tarefas repetitivas e conecte as ferramentas que sua empresa já utiliza.',
    examples: ['Integração entre sistemas', 'Documentos automáticos', 'Alertas e relatórios'],
    page: {
      metaTitle: 'Automação de processos para empresas — Tivexy',
      metaDescription:
        'Automação de tarefas repetitivas e integração entre as ferramentas da sua empresa: menos digitação, menos erros e mais tempo para o que importa.',
      headline: 'Menos tarefas repetitivas. Mais tempo para o que importa.',
      intro:
        'Toda empresa tem rotinas que se repetem: copiar dados de um lugar para outro, enviar o mesmo e-mail, conferir planilhas, cobrar retornos. A automação faz essas etapas acontecerem sozinhas, com menos erros.',
      signals: [
        'A equipe digita a mesma informação em mais de uma ferramenta.',
        'Relatórios são montados à mão toda semana.',
        'Clientes esperam retorno porque alguém precisa lembrar de responder.',
        'Erros de digitação geram retrabalho.',
      ],
      deliverablesTitle: 'O que dá para automatizar',
      deliverables: [
        {
          title: 'Integração entre ferramentas',
          text: 'ERP, CRM, planilhas, e-mail e outras ferramentas trocando informações automaticamente.',
        },
        {
          title: 'Documentos automáticos',
          text: 'Propostas, contratos, cobranças e comprovantes gerados e enviados sem trabalho manual.',
        },
        {
          title: 'Alertas para a pessoa certa',
          text: 'Avisos quando algo sai do esperado: atraso, estoque baixo, pagamento pendente.',
        },
        {
          title: 'Relatórios que se montam sozinhos',
          text: 'Números consolidados e enviados na frequência que a gestão precisa.',
        },
      ],
      faq: [
        {
          question: 'Preciso trocar os sistemas que já uso?',
          answer:
            'Nem sempre. Muitas ferramentas podem ser conectadas como estão. Isso é avaliado na etapa de descoberta.',
        },
        {
          question: 'Por onde começar a automatizar?',
          answer:
            'Pelas tarefas mais repetitivas e com mais impacto no dia a dia. Esse mapeamento acontece antes de qualquer desenvolvimento.',
        },
        {
          question: 'E se um processo mudar?',
          answer:
            'As automações são ajustadas na etapa de evolução, acompanhando as mudanças da empresa.',
        },
      ],
    },
  },
  {
    slug: 'inteligencia-artificial',
    icon: 'spark',
    preview: 'ai',
    title: 'Inteligência Artificial',
    summary:
      'Aplicamos IA aos processos certos para gerar produtividade, inteligência e vantagem competitiva.',
    examples: ['Atendimento com IA', 'Leitura de documentos', 'Assistentes para a equipe'],
    page: {
      metaTitle: 'Inteligência artificial para empresas — Tivexy',
      metaDescription:
        'Inteligência artificial aplicada a processos específicos: atendimento, documentos, assistentes internos e análises que geram produtividade.',
      headline: 'Inteligência artificial onde ela realmente faz diferença.',
      intro:
        'IA não precisa estar em tudo. O valor aparece quando ela é aplicada a processos específicos: responder, classificar, resumir, extrair informações e apoiar decisões.',
      signals: [
        'A equipe gasta horas lendo e organizando documentos, e-mails ou mensagens.',
        'O atendimento recebe as mesmas perguntas todos os dias.',
        'Existem muitos dados, mas pouca análise.',
        'Você quer usar IA, mas não sabe por onde começar com segurança.',
      ],
      deliverablesTitle: 'Onde a IA entra',
      deliverables: [
        {
          title: 'Atendimento assistido',
          text: 'Respostas rápidas para dúvidas frequentes, com passagem para uma pessoa quando necessário.',
        },
        {
          title: 'Documentos e informações',
          text: 'Leitura, classificação e extração de dados de contratos, notas, formulários e e-mails.',
        },
        {
          title: 'Assistentes internos',
          text: 'A equipe consulta procedimentos, histórico e informações da empresa em linguagem natural.',
        },
        {
          title: 'Análises e resumos',
          text: 'Relatórios e resumos que transformam volume de dados em pontos de atenção.',
        },
      ],
      faq: [
        {
          question: 'Meus dados ficam seguros?',
          answer:
            'Privacidade e segurança fazem parte da definição da solução desde a estratégia, incluindo quais dados a IA pode acessar.',
        },
        {
          question: 'A IA substitui minha equipe?',
          answer:
            'O objetivo é tirar da equipe as tarefas repetitivas, para que as pessoas foquem no que exige análise e relacionamento.',
        },
        {
          question: 'Preciso ter muitos dados para usar IA?',
          answer:
            'Não necessariamente. Muitas aplicações funcionam com documentos e informações que a empresa já tem.',
        },
      ],
    },
  },
];

export function getService(slug: string): Service | undefined {
  return services.find((service) => service.slug === slug);
}
