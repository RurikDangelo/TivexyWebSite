/**
 * Uma automação dita em português, no vocabulário da empresa.
 *
 * "Quando **Vendas — registro novo**, se **total é pelo menos R$ 1.000,00**,
 * então **avisar quem vê contas a receber**." A regra é guardada como código
 * (`erp.sale.registered`, `gte`, `100000`); a tela nunca mostra o código.
 *
 * Frase com rótulo do nicho não leva artigo — ver `terms/vocabulary.ts`. Por
 * isso "registro novo", e não "nova venda": a clínica chama venda de
 * "atendimento", e "nova atendimento" seria o defeito.
 */

import {
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
  type CampoDoGatilho,
  type ModuleCode,
  PERMISSION_CODES,
  type PermissionCode,
  ROTULO_DO_OPERADOR,
  formatCents,
  moduleOf,
} from '@tivexy/core';

import { dias } from '../format.ts';
import {
  DEFAULT_TERMS,
  type TermKey,
  type Terms,
  capitalizar,
  termOf,
} from '../terms/vocabulary.ts';

/** "Vendas — registro novo". */
export function nomeDoGatilho(gatilho: AutomationTrigger, terms: Terms): string {
  const definicao = AUTOMATION_TRIGGERS[gatilho];
  return `${capitalizar(termOf(terms, definicao.termo).plural)} — ${definicao.evento}`;
}

export function campoDoGatilho(
  gatilho: AutomationTrigger,
  campo: string,
): CampoDoGatilho | undefined {
  const campos: readonly CampoDoGatilho[] = AUTOMATION_TRIGGERS[gatilho].campos;
  return campos.find((c) => c.campo === campo);
}

/** O valor de uma condição como a pessoa escreveria: `R$ 1.000,00`, `"Indicação"`, `ganho`. */
export function valorDaCondicao(campo: CampoDoGatilho, valor: string | number): string {
  if (campo.tipo === 'dinheiro' && typeof valor === 'number') return formatCents(valor);
  if (campo.tipo === 'numero' && typeof valor === 'number') return valor.toLocaleString('pt-BR');
  if (campo.tipo === 'opcao') {
    return campo.opcoes?.find((o) => o.valor === valor)?.rotulo ?? String(valor);
  }
  return `"${String(valor)}"`;
}

/** "total é pelo menos R$ 1.000,00". */
export function descreverCondicao(gatilho: AutomationTrigger, c: AutomationCondition): string {
  const campo = campoDoGatilho(gatilho, c.campo);
  if (campo === undefined) return `${c.campo} ${ROTULO_DO_OPERADOR[c.operador]} ${c.valor}`;
  return `${campo.rotulo.toLowerCase()} ${ROTULO_DO_OPERADOR[c.operador]} ${valorDaCondicao(campo, c.valor)}`;
}

const VERBO: Readonly<Record<string, string>> = {
  read: 'vê',
  write: 'edita',
  delete: 'exclui',
  cancel: 'cancela',
  use: 'usa',
};

/**
 * "quem vê contas a receber" — a permissão como grupo de pessoas.
 *
 * O aviso "para quem tem a permissão" é o jeito de mandar para "o financeiro"
 * sem que exista um cadastro de setores: quem vê contas a receber é, na
 * prática, o financeiro — e continua sendo quando a equipe muda.
 */
export function rotuloDaPermissao(codigo: PermissionCode, terms: Terms): string {
  const [modulo, recurso, acao] = codigo.split('.');
  const chave = `${modulo}.${recurso}`;
  const verbo = VERBO[acao ?? ''] ?? acao;
  const nome = Object.hasOwn(DEFAULT_TERMS, chave) ? termOf(terms, chave as TermKey).plural : chave;
  return `quem ${verbo} ${nome}`;
}

/**
 * As permissões que servem de destinatário: ver cada coisa, nos módulos que a
 * empresa tem. Escrever e excluir ficariam repetidos — quem edita também vê.
 */
export function permissoesDeDestino(
  modulos: ReadonlySet<ModuleCode>,
  terms: Terms,
): { codigo: PermissionCode; rotulo: string }[] {
  return PERMISSION_CODES.filter(
    (p) => p.endsWith('.read') && p !== 'core.audit.read' && modulos.has(moduleOf(p)),
  ).map((codigo) => ({ codigo, rotulo: capitalizar(rotuloDaPermissao(codigo, terms)) }));
}

export interface Pessoa {
  userId: string;
  nome: string;
}

function nomeDaPessoa(pessoas: readonly Pessoa[], userId: unknown): string {
  return pessoas.find((p) => p.userId === userId)?.nome ?? 'alguém que saiu da empresa';
}

/** "avisar quem vê vendas" / "criar atividade para a pessoa responsável, com prazo em 2 dias". */
export function descreverAcao(
  acao: AutomationAction,
  params: Readonly<Record<string, unknown>>,
  contexto: { terms: Terms; pessoas: readonly Pessoa[] },
): string {
  if (acao === 'crm.activity.create') {
    const n = typeof params.dias === 'number' ? params.dias : 0;
    const dono =
      params.responsavel === 'responsavel'
        ? 'a pessoa responsável'
        : nomeDaPessoa(contexto.pessoas, params.responsavel);
    const prazo = n === 0 ? 'para o mesmo dia' : `com prazo em ${dias(n)}`;
    return `criar ${termOf(contexto.terms, 'crm.activities').singular} para ${dono}, ${prazo}`;
  }
  if (params.destino === 'responsavel') return 'avisar a pessoa responsável';
  if (params.destino === 'usuario')
    return `avisar ${nomeDaPessoa(contexto.pessoas, params.usuario)}`;
  if (params.destino === 'permissao' && typeof params.permissao === 'string') {
    const codigo = PERMISSION_CODES.find((p) => p === params.permissao);
    if (codigo !== undefined) return `avisar ${rotuloDaPermissao(codigo, contexto.terms)}`;
  }
  return 'avisar';
}

/**
 * Valores de exemplo, para a prévia do título. **Rotulados como exemplo na
 * tela** — não são dado de ninguém, só mostram como o texto vai sair.
 */
export const EXEMPLO_DO_EVENTO: Readonly<Record<AutomationTrigger, Record<string, unknown>>> = {
  'crm.lead.created': { nome: 'Maria Souza', origem: 'Indicação' },
  'crm.deal.stage_changed': {
    titulo: 'Contrato anual',
    etapa: 'Proposta',
    valor: 250000,
    situacao: 'open',
  },
  'erp.sale.registered': { numero: 128, total: 15990, cliente: 'Maria Souza' },
  'inventory.stock.low': { produto: 'Café em grão', saldo: 2.5, minimo: 5, unidade: 'kg' },
};

/**
 * O evento que disparou, numa linha, a partir do que ficou gravado na
 * execução: "nº 12 · R$ 150,00", "Café em grão: 2,5 kg".
 */
export function resumoDoEvento(
  gatilho: string,
  payload: Readonly<Record<string, unknown>>,
): string {
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const numero = (v: unknown) =>
    typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : null;
  const partes: (string | null)[] = [];
  switch (gatilho) {
    case 'crm.lead.created':
      partes.push(texto(payload.nome), texto(payload.origem));
      break;
    case 'crm.deal.stage_changed':
      partes.push(
        texto(payload.titulo),
        texto(payload.etapa),
        typeof payload.valor === 'number' ? formatCents(payload.valor) : null,
      );
      break;
    case 'erp.sale.registered':
      partes.push(
        numero(payload.numero) === null ? null : `nº ${numero(payload.numero)}`,
        typeof payload.total === 'number' ? formatCents(payload.total) : null,
        texto(payload.cliente),
      );
      break;
    case 'inventory.stock.low': {
      const saldo = numero(payload.saldo);
      partes.push(
        texto(payload.produto),
        saldo === null ? null : `saldo ${saldo} ${texto(payload.unidade) ?? ''}`.trim(),
      );
      break;
    }
  }
  return partes.filter((p): p is string => p !== null).join(' · ');
}

/** Para onde o evento leva, quando existe página dele. */
export function linkDoEvento(
  gatilho: string,
  payload: Readonly<Record<string, unknown>>,
): string | null {
  const id =
    typeof payload.id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.id) ? payload.id : null;
  if (id === null) return null;
  switch (gatilho) {
    case 'crm.deal.stage_changed':
      return `/crm/oportunidades/${id}`;
    case 'erp.sale.registered':
      return `/erp/vendas/${id}`;
    case 'inventory.stock.low':
      return `/erp/produtos/${id}`;
    default:
      return null;
  }
}

/** Um modelo pronto: a regra montada, para a pessoa só conferir e salvar. */
export interface ModeloDeAutomacao {
  chave: string;
  titulo: string;
  descricao: string;
  regra: {
    nome: string;
    gatilho: AutomationTrigger;
    condicoes: AutomationCondition[];
    acao: AutomationAction;
    params: Record<string, string | number>;
  };
}

/**
 * Os modelos que a tela oferece — os quatro casos que todo CRM e ERP pequeno
 * automatiza primeiro. Só aparecem os dos módulos que a empresa tem, e a ação
 * de criar atividade só para quem pode criar atividade.
 */
export function modelosDeAutomacao(
  modulos: ReadonlySet<ModuleCode>,
  podeCriarAtividade: boolean,
  terms: Terms,
): ModeloDeAutomacao[] {
  const lead = termOf(terms, 'crm.leads');
  const oportunidade = termOf(terms, 'crm.deals');
  const venda = termOf(terms, 'erp.sales');
  const atividade = termOf(terms, 'crm.activities');
  const modelos: (ModeloDeAutomacao | null)[] = [
    modulos.has('crm') && podeCriarAtividade
      ? {
          chave: 'primeiro-contato',
          titulo: `${capitalizar(lead.singular)} com primeiro contato marcado`,
          descricao: `Cada cadastro novo em ${lead.plural} ganha ${atividade.singular} para o dia seguinte, com a pessoa responsável.`,
          regra: {
            nome: 'Primeiro contato',
            gatilho: 'crm.lead.created',
            condicoes: [],
            acao: 'crm.activity.create',
            params: { titulo: 'Primeiro contato: {{nome}}', dias: 1, responsavel: 'responsavel' },
          },
        }
      : null,
    modulos.has('crm')
      ? {
          chave: 'ganho',
          titulo: `Aviso de ganho em ${oportunidade.plural}`,
          descricao: `Mudança para etapa de ganho em ${oportunidade.plural} avisa ${rotuloDaPermissao('crm.deals.read', terms)}.`,
          regra: {
            nome: 'Ganho no funil',
            gatilho: 'crm.deal.stage_changed',
            condicoes: [{ campo: 'situacao', operador: 'eq', valor: 'won' }],
            acao: 'core.notify',
            params: {
              titulo: 'Ganho: {{titulo}} ({{valor}})',
              destino: 'permissao',
              permissao: 'crm.deals.read',
            },
          },
        }
      : null,
    modulos.has('erp')
      ? {
          chave: 'venda-grande',
          titulo: `${capitalizar(venda.singular)} acima de um valor`,
          descricao: `Registro em ${venda.plural} a partir de R$ 1.000,00 avisa ${rotuloDaPermissao('finance.receivables.read', terms)}. O valor muda antes de salvar.`,
          regra: {
            nome: `${capitalizar(venda.singular)} acima de R$ 1.000`,
            gatilho: 'erp.sale.registered',
            condicoes: [{ campo: 'total', operador: 'gte', valor: 100000 }],
            acao: 'core.notify',
            params: {
              titulo: `${capitalizar(venda.singular)} nº {{numero}}: {{total}}`,
              destino: 'permissao',
              permissao: 'finance.receivables.read',
            },
          },
        }
      : null,
    modulos.has('inventory')
      ? {
          chave: 'estoque-minimo',
          titulo: 'Saldo no mínimo',
          descricao: `Saldo que cruza o mínimo cadastrado avisa ${rotuloDaPermissao('inventory.stock.read', terms)} — uma vez, na travessia, e não a cada saída.`,
          regra: {
            nome: 'Saldo no mínimo',
            gatilho: 'inventory.stock.low',
            condicoes: [],
            acao: 'core.notify',
            params: {
              titulo: '{{produto}} no mínimo: {{saldo}} {{unidade}}',
              destino: 'permissao',
              permissao: 'inventory.stock.read',
            },
          },
        }
      : null,
  ];
  return modelos.filter((m): m is ModeloDeAutomacao => m !== null);
}
