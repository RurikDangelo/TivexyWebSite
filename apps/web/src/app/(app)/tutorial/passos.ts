/**
 * Os passos do tutorial, e o que conta como feito.
 *
 * Puro de propósito: recebe as contagens e devolve o estado de cada passo. É
 * o que permite testar "o passo 4 só abre depois do 3" sem banco, e o que
 * impede a tela de inventar progresso.
 */

/** O que o tutorial precisa saber do cliente, tudo em contagem. */
export interface EstadoDoCliente {
  membrosAtivos: number;
  leads: number;
  contas: number;
  atividades: number;
  produtos: number;
  movimentos: number;
  vendasConfirmadas: number;
  lancamentos: number;
  automacoes: number;
}

export const ESTADO_VAZIO: EstadoDoCliente = {
  membrosAtivos: 0,
  leads: 0,
  contas: 0,
  atividades: 0,
  produtos: 0,
  movimentos: 0,
  vendasConfirmadas: 0,
  lancamentos: 0,
  automacoes: 0,
};

/**
 * O que ainda depende de alguém de fora.
 *
 * Aparece no passo, junto do que fazer — não num rodapé. Um tutorial que
 * ensina a convidar alguém e não diz que o e-mail não sai produz exatamente o
 * problema que ele deveria evitar: a pessoa convida, espera, e o convidado
 * nunca recebe nada.
 */
export interface Pendencia {
  texto: string;
  /** O que dá para fazer enquanto isso. Nunca `null`: sem saída, é bloqueio. */
  contorno: string;
}

export interface Passo {
  id: string;
  titulo: string;
  /** O que a pessoa faz, em uma frase. */
  oQueFazer: string;
  /** Por que isso existe. É o que transforma tutorial em entendimento. */
  porQue: string;
  href: string | null;
  /** Quem faz: o cliente, ou a plataforma. */
  quem: 'cliente' | 'plataforma';
  feito: (estado: EstadoDoCliente) => boolean;
  pendencia?: Pendencia;
}

export const PASSOS: readonly Passo[] = [
  {
    id: 'empresa',
    titulo: 'A empresa existe',
    oQueFazer: 'O Super Admin cria o cliente no painel da plataforma, escolhendo o nicho.',
    porQue:
      'O nicho não é etiqueta: ele decide quais módulos ficam habilitados, quais papéis existem, como as coisas se chamam nas telas e o que já nasce cadastrado. Uma clínica lê “interessados” onde uma consultoria lê “leads”, sem uma segunda tela existir.',
    href: null,
    quem: 'plataforma',
    /* Se você está lendo esta tela logada, este passo aconteceu. */
    feito: () => true,
  },
  {
    id: 'acesso',
    titulo: 'Alguém consegue entrar',
    oQueFazer: 'O Super Admin convida as pessoas na ficha do cliente.',
    porQue:
      'O convite cria a conta e o vínculo como pendente. Enquanto ele estiver pendente, nenhum dado da empresa fica disponível — isso é do banco, não da tela.',
    href: '/admin',
    quem: 'plataforma',
    feito: (e) => e.membrosAtivos > 0,
    pendencia: {
      texto:
        'O convite não sai por e-mail. O projeto ainda usa o servidor embutido do Supabase, que só entrega para membros da equipe.',
      contorno:
        'A tela gera um link de acesso para o Super Admin repassar pelo canal que já usa com o cliente. O link é credencial: vale uma vez e vence.',
    },
  },
  {
    id: 'lead',
    titulo: 'Cadastrar o primeiro lead',
    oQueFazer: 'Em Leads, cadastre alguém que demonstrou interesse.',
    porQue:
      'Só o nome é obrigatório, e isso é decisão de produto: um lead é justamente o contato de quem ainda não se sabe quase nada. Exigir e-mail e telefone faria você inventar valores para conseguir salvar.',
    href: '/crm/leads',
    quem: 'cliente',
    feito: (e) => e.leads > 0,
  },
  {
    id: 'converter',
    titulo: 'Converter o lead',
    oQueFazer: 'Na linha do lead, use Converter e escolha a etapa do funil.',
    porQue:
      'Converter não é trocar de etiqueta: cria a conta, a pessoa e a oportunidade numa transação só. Ou as três nascem, ou nenhuma — o desfecho pela metade seria a oportunidade no funil e o lead ainda na fila, esperando alguém ligar de novo.',
    href: '/crm/leads',
    quem: 'cliente',
    feito: (e) => e.contas > 0,
  },
  {
    id: 'agenda',
    titulo: 'Agendar o retorno',
    oQueFazer: 'Em Atividades, registre a ligação de acompanhamento.',
    porQue:
      'Toda atividade fala de exatamente uma coisa — um lead, um contato, uma conta ou uma oportunidade. O banco exige isso, e por isso a tela tem um campo só: não há como escolher dois, nem nenhum.',
    href: '/crm/atividades',
    quem: 'cliente',
    feito: (e) => e.atividades > 0,
  },
  {
    id: 'produto',
    titulo: 'Cadastrar o que você vende',
    oQueFazer: 'Em Produtos, cadastre um item — ou um serviço.',
    porQue:
      'A primeira pergunta é produto ou serviço, e ela muda o resto: serviço não entra no inventário. Sem essa distinção, “hora de consultoria” apareceria no estoque com saldo negativo para sempre.',
    href: '/erp/produtos',
    quem: 'cliente',
    feito: (e) => e.produtos > 0,
  },
  {
    id: 'estoque',
    titulo: 'Dar entrada no estoque',
    oQueFazer: 'Em Estoque, lance uma entrada com a quantidade que você tem.',
    porQue:
      'O saldo não é digitado: ele nasce do movimento. É por isso que corrigir estoque é lançar um ajuste, e não editar um número — o ajuste fica no histórico, e o histórico é o que responde “por que faltou?” no fim do mês.',
    href: '/erp/estoque',
    quem: 'cliente',
    feito: (e) => e.movimentos > 0,
  },
  {
    id: 'venda',
    titulo: 'Registrar e confirmar uma venda',
    oQueFazer: 'Em Vendas, abra uma, some os itens e confirme.',
    porQue:
      'A venda nasce rascunho porque montar item a item precisa de um estado em que nada aconteceu ainda. Confirmar é o que atribui o número, baixa o estoque e gera o recebimento — as três coisas juntas, numa transação.',
    href: '/erp/vendas',
    quem: 'cliente',
    feito: (e) => e.vendasConfirmadas > 0,
    pendencia: {
      texto:
        'Confirmar a venda não emite nota fiscal, e registrar a forma de pagamento não cobra nada.',
      contorno:
        'O Tivexy registra a venda e o recebimento. A emissão depende de provedor fiscal e certificado digital, e não é simulada de propósito — nota simulada apresentada como real tem consequência legal.',
    },
  },
  {
    id: 'financeiro',
    titulo: 'Ver o recebimento que apareceu sozinho',
    oQueFazer: 'Abra o Financeiro. A conta a receber da venda já está lá.',
    porQue:
      'Ela foi criada dentro da mesma transação da confirmação. Não é uma tarefa que roda depois e às vezes falha: ou a venda confirmou e o recebimento existe, ou nada aconteceu.',
    href: '/erp/financeiro',
    quem: 'cliente',
    feito: (e) => e.lancamentos > 0,
  },
  {
    id: 'automacao',
    titulo: 'Deixar uma regra trabalhando',
    oQueFazer:
      'Em Automações, crie: quando um lead for cadastrado, agendar uma ligação para amanhã.',
    porQue:
      'A partir daí, todo lead novo nasce com o retorno marcado. Se a regra falhar, o lead continua cadastrado — automação não derruba o que a provocou —, e a falha aparece no histórico com o motivo.',
    href: '/automacoes',
    quem: 'cliente',
    feito: (e) => e.automacoes > 0,
    pendencia: {
      texto:
        'As ações são internas: criar atividade e lançar conta. Não há envio de e-mail, WhatsApp nem webhook.',
      contorno:
        'Esses canais dependem de credenciais que o projeto ainda não tem. Uma automação que dissesse “avisei o cliente” sem avisar ninguém seria pior do que nenhuma.',
    },
  },
];

/** Quantos passos já estão feitos. */
export function progresso(estado: EstadoDoCliente): { feitos: number; total: number } {
  return {
    feitos: PASSOS.filter((passo) => passo.feito(estado)).length,
    total: PASSOS.length,
  };
}

/**
 * O primeiro passo que ainda falta.
 *
 * "Primeiro que falta", e não "o próximo depois do último feito": quem pulou
 * o passo 3 e fez o 4 precisa ser levado de volta ao 3, não empurrado para o
 * 5. A ordem existe porque cada passo usa o que o anterior criou.
 */
export function proximoPasso(estado: EstadoDoCliente): Passo | null {
  return PASSOS.find((passo) => !passo.feito(estado)) ?? null;
}
