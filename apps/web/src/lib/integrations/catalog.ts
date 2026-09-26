/**
 * As integrações que o Tivexy terá — e o que falta para cada uma existir.
 *
 * **Nenhuma está conectada.** Cada uma depende de conta, credencial ou
 * aprovação de terceiros (🔒 externo) e de um adaptador que a Tivexy ainda
 * vai construir (interno). Este catálogo existe para a tela dizer isso uma
 * por uma, sem simular conexão — ver docs/10-INTEGRATIONS/INTEGRATIONS.md.
 *
 * Não há tabela: não existe conexão possível, então não há o que gravar. A
 * tabela nasce com o primeiro adaptador.
 *
 * O estado é um tipo de um valor só, de propósito. Para uma integração
 * aparecer como conectada, alguém vai ter que criar o estado — e a conexão.
 */

import type { ModuleCode } from '@tivexy/core';

export type EstadoDaIntegracao = 'nao-configurado';

/** O que dá para conferir no banco, do lado da empresa. */
export type Checagem = 'cnpj' | 'razao-social';

export interface Integracao {
  codigo: string;
  nome: string;
  /** O módulo que a usaria. `null` quando é da plataforma, e não da empresa. */
  modulo: ModuleCode | null;
  estado: EstadoDaIntegracao;
  paraQue: string;
  /** O que funciona hoje sem ela — para ninguém achar que o sistema está parado. */
  hojeSemEla: string;
  /** 🔒 Externo: depende da empresa ou de um terceiro. Vazio quando não há nada do lado dela. */
  faltaDaEmpresa: readonly string[];
  /** Interno: trabalho da Tivexy. */
  faltaDaTivexy: readonly string[];
  checagens: readonly Checagem[];
}

/** "Endereço público com HTTPS" é o SaaS publicado num domínio — um pré-requisito de toda escuta. */
const ENDERECO_PUBLICO =
  'Endereço público com HTTPS para receber os avisos do serviço — o sistema publicado num domínio';

export const INTEGRACOES: readonly Integracao[] = [
  {
    codigo: 'email',
    nome: 'E-mail',
    modulo: null,
    estado: 'nao-configurado',
    paraQue:
      'Entregar convite, recuperação de senha e troca de e-mail — e, depois, automação por e-mail.',
    hojeSemEla:
      'O convite gera um link de acesso que o administrador repassa. O servidor embutido do Supabase só entrega para a equipe da própria Tivexy, com poucas mensagens por hora.',
    faltaDaEmpresa: [],
    faltaDaTivexy: [
      'Provedor de SMTP contratado',
      'Domínio tivexy.com.br com SPF, DKIM e DMARC',
      'O provedor cadastrado no Supabase (Authentication → SMTP)',
    ],
    checagens: [],
  },
  {
    codigo: 'fiscal',
    nome: 'Emissão fiscal',
    modulo: 'fiscal',
    estado: 'nao-configurado',
    paraQue: 'Emitir NF-e, NFC-e e NFS-e a partir da venda.',
    hojeSemEla:
      'A venda gera um comprovante interno, que diz com todas as letras não ser documento fiscal.',
    faltaDaEmpresa: [
      'Certificado digital A1 da empresa (e-CNPJ)',
      'Inscrição estadual (NF-e, NFC-e) ou municipal (NFS-e)',
      'Código de segurança do contribuinte (CSC) da SEFAZ, para NFC-e',
      'Regime tributário e dados fiscais dos produtos, definidos com o contador',
    ],
    faltaDaTivexy: [
      'Contrato com um provedor de emissão fiscal',
      'O adaptador do provedor',
      'Campos fiscais no cadastro de produto (NCM, CFOP)',
    ],
    checagens: ['cnpj', 'razao-social'],
  },
  {
    codigo: 'whatsapp',
    nome: 'WhatsApp Business',
    modulo: 'integrations',
    estado: 'nao-configurado',
    paraQue:
      'Conversar com o cliente pelo número da empresa, dentro do CRM, e mandar avisos de automação por WhatsApp.',
    hojeSemEla: 'O telefone fica no cadastro do contato; a conversa acontece fora do Tivexy.',
    faltaDaEmpresa: [
      'Conta no Meta Business verificada',
      'Número dedicado — o mesmo número não pode seguir no aplicativo comum do WhatsApp',
      'Modelos de mensagem aprovados pela Meta',
    ],
    faltaDaTivexy: [
      'Aplicativo aprovado na revisão da Meta',
      'O adaptador da API',
      ENDERECO_PUBLICO,
    ],
    checagens: [],
  },
  {
    codigo: 'meta',
    nome: 'Instagram e Facebook',
    modulo: 'integrations',
    estado: 'nao-configurado',
    paraQue: 'Mensagens do Direct e da página, e formulários de anúncio entrando como lead no CRM.',
    hojeSemEla: 'O lead que veio de anúncio se cadastra à mão, com a origem.',
    faltaDaEmpresa: [
      'Página do Facebook e conta profissional do Instagram ligadas ao Meta Business',
      'Autorização para o aplicativo da Tivexy acessar a página',
    ],
    faltaDaTivexy: [
      'Aplicativo com as permissões de mensagens e de leads aprovadas pela Meta',
      'O adaptador',
      ENDERECO_PUBLICO,
    ],
    checagens: [],
  },
  {
    codigo: 'banco',
    nome: 'Banco — Pix e boleto',
    modulo: 'finance',
    estado: 'nao-configurado',
    paraQue:
      'Cobrar por Pix ou boleto, dar baixa sozinho no contas a receber e conciliar o extrato.',
    hojeSemEla: 'A baixa de recebimento é manual, no financeiro.',
    faltaDaEmpresa: [
      'Conta PJ num banco com API aberta a sistemas',
      'Credenciais de API e certificado emitidos pelo banco',
      'Chave Pix da empresa',
    ],
    faltaDaTivexy: ['O adaptador do banco escolhido', ENDERECO_PUBLICO],
    checagens: ['cnpj'],
  },
  {
    codigo: 'pagamentos',
    nome: 'Maquininha e pagamento online',
    modulo: 'erp',
    estado: 'nao-configurado',
    paraQue: 'Mandar o valor da venda para a maquininha e receber de volta a aprovação.',
    hojeSemEla:
      'O balcão registra a forma de pagamento; a cobrança acontece na maquininha, fora do Tivexy.',
    faltaDaEmpresa: ['Contrato com adquirente ou gateway que ofereça integração por API'],
    faltaDaTivexy: ['O adaptador', 'Homologação com o adquirente'],
    checagens: [],
  },
  {
    codigo: 'ia',
    nome: 'Inteligência artificial',
    modulo: 'ai',
    estado: 'nao-configurado',
    paraQue: 'Assistente que resume, sugere e responde, com ferramentas controladas.',
    hojeSemEla: 'Não existe assistente.',
    faltaDaEmpresa: [],
    faltaDaTivexy: [
      'Chave da API da OpenAI, na conta da plataforma',
      'O AI Engine — ferramentas controladas e limite por empresa',
    ],
    checagens: [],
  },
];

export interface DadosDaEmpresa {
  documento: string | null;
  razaoSocial: string | null;
}

/** O que a checagem confere, em uma frase, e se está pronto. */
export function conferir(
  checagem: Checagem,
  empresa: DadosDaEmpresa,
): { texto: string; pronto: boolean } {
  if (checagem === 'cnpj') {
    // CNPJ tem 14 posições; o de letra (2026) também. CPF, com 11, não emite como empresa.
    const pronto = (empresa.documento ?? '').length === 14;
    return { texto: 'CNPJ cadastrado nas configurações', pronto };
  }
  return {
    texto: 'Razão social cadastrada nas configurações',
    pronto: (empresa.razaoSocial ?? '').trim() !== '',
  };
}

/**
 * Quantas estão em uso. Zero por construção hoje — contada mesmo assim, para
 * a frase da tela não precisar ser lembrada no dia em que a primeira ligar.
 */
export function integracoesEmUso(lista: readonly Integracao[]): number {
  return lista.filter((i) => (i.estado as string) !== 'nao-configurado').length;
}
