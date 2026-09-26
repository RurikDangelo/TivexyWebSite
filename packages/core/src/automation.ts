/**
 * Os contratos das automações, espelhando `20260925130000_automation_engine.sql`.
 *
 * O motor roda no banco. Aqui está o que a tela precisa para montar uma regra
 * que o banco aceite — os gatilhos, os campos de cada um, os operadores, as
 * ações — e duas funções que refazem o que o banco faz, para a tela mostrar
 * antes de salvar: `automationMatches` e `renderAutomationTemplate`. O teste
 * de contratos roda as duas contra as funções SQL nos mesmos casos.
 */

import { PERMISSION_CODES, type PermissionCode } from './catalog.ts';

export type TipoDeCampo = 'texto' | 'dinheiro' | 'numero' | 'opcao';

export interface CampoDoGatilho {
  campo: string;
  rotulo: string;
  tipo: TipoDeCampo;
  /** Só para `opcao`. */
  opcoes?: readonly { valor: string; rotulo: string }[];
}

export interface DefinicaoDeGatilho {
  /** O recurso do vocabulário — a tela escreve "Vendas" ou "Pedidos". */
  termo: string;
  /** O que aconteceu, sem artigo nem concordância: "cadastro novo". */
  evento: string;
  modulo: 'crm' | 'erp' | 'inventory';
  campos: readonly CampoDoGatilho[];
  /** As variáveis que o título e o texto podem usar: `{{nome}}`. */
  variaveis: readonly string[];
  /** O evento traz um responsável — a ação pode ir para ele. */
  temResponsavel: boolean;
}

export const AUTOMATION_TRIGGERS = {
  'crm.lead.created': {
    termo: 'crm.leads',
    evento: 'cadastro novo',
    modulo: 'crm',
    campos: [
      { campo: 'origem', rotulo: 'Origem', tipo: 'texto' },
      { campo: 'nome', rotulo: 'Nome', tipo: 'texto' },
    ],
    variaveis: ['nome', 'origem'],
    temResponsavel: true,
  },
  'crm.deal.stage_changed': {
    termo: 'crm.deals',
    evento: 'mudança de etapa',
    modulo: 'crm',
    campos: [
      {
        campo: 'situacao',
        rotulo: 'Situação da etapa',
        tipo: 'opcao',
        opcoes: [
          { valor: 'open', rotulo: 'em andamento' },
          { valor: 'won', rotulo: 'ganho' },
          { valor: 'lost', rotulo: 'perda' },
        ],
      },
      { campo: 'etapa', rotulo: 'Nome da etapa', tipo: 'texto' },
      { campo: 'valor', rotulo: 'Valor', tipo: 'dinheiro' },
    ],
    variaveis: ['titulo', 'etapa', 'valor'],
    temResponsavel: true,
  },
  'erp.sale.registered': {
    termo: 'erp.sales',
    evento: 'registro novo',
    modulo: 'erp',
    campos: [
      { campo: 'total', rotulo: 'Total', tipo: 'dinheiro' },
      { campo: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
    ],
    variaveis: ['numero', 'total', 'cliente'],
    temResponsavel: true,
  },
  'inventory.stock.low': {
    termo: 'inventory.stock',
    evento: 'saldo chegou no mínimo',
    modulo: 'inventory',
    campos: [{ campo: 'produto', rotulo: 'Nome', tipo: 'texto' }],
    variaveis: ['produto', 'saldo', 'minimo', 'unidade'],
    temResponsavel: false,
  },
} as const satisfies Record<string, DefinicaoDeGatilho>;

export type AutomationTrigger = keyof typeof AUTOMATION_TRIGGERS;

export const AUTOMATION_TRIGGER_CODES = Object.keys(AUTOMATION_TRIGGERS) as AutomationTrigger[];

export function isAutomationTrigger(valor: unknown): valor is AutomationTrigger {
  return typeof valor === 'string' && Object.hasOwn(AUTOMATION_TRIGGERS, valor);
}

export const AUTOMATION_ACTIONS = ['core.notify', 'crm.activity.create'] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

/** A ação de criar atividade precisa de um lead ou de uma oportunidade. */
export function actionAllowedFor(acao: AutomationAction, gatilho: AutomationTrigger): boolean {
  return acao !== 'crm.activity.create' || AUTOMATION_TRIGGERS[gatilho].modulo === 'crm';
}

export const CONDITION_OPERATORS = ['eq', 'neq', 'gte', 'lte', 'contains'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const OPERADORES_POR_TIPO: Readonly<Record<TipoDeCampo, readonly ConditionOperator[]>> = {
  texto: ['eq', 'neq', 'contains'],
  opcao: ['eq', 'neq'],
  dinheiro: ['gte', 'lte', 'eq'],
  numero: ['gte', 'lte', 'eq'],
};

export const ROTULO_DO_OPERADOR: Readonly<Record<ConditionOperator, string>> = {
  eq: 'é',
  neq: 'não é',
  gte: 'é pelo menos',
  lte: 'é no máximo',
  contains: 'contém',
};

export interface AutomationCondition {
  campo: string;
  operador: ConditionOperator;
  valor: string | number;
}

/**
 * As condições, todas (E), sobre o que o evento traz.
 *
 * Texto compara sem caixa; número compara número; campo ausente ou nulo não
 * satisfaz nada. É `public.automation_matches()`, linha por linha.
 */
export function automationMatches(
  condicoes: readonly AutomationCondition[],
  evento: Readonly<Record<string, unknown>>,
): boolean {
  return condicoes.every((c) => {
    const atual = evento[c.campo];
    if (atual === undefined || atual === null) return false;
    if (c.valor === undefined || c.valor === null) return false;
    switch (c.operador) {
      case 'eq':
        return String(atual).toLowerCase() === String(c.valor).toLowerCase();
      case 'neq':
        return String(atual).toLowerCase() !== String(c.valor).toLowerCase();
      case 'gte':
      case 'lte':
        if (typeof atual !== 'number' || typeof c.valor !== 'number') return false;
        return c.operador === 'gte' ? atual >= c.valor : atual <= c.valor;
      case 'contains':
        return String(atual).toLowerCase().includes(String(c.valor).toLowerCase());
    }
  });
}

/** R$ 1.234,56, como `public.format_brl()`. */
function brl(centavos: number): string {
  const [inteiro = '0', fracao = '00'] = (Math.round(centavos) / 100).toFixed(2).split('.');
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracao}`;
}

/**
 * O modelo com as variáveis do evento: `{{nome}} chegou por {{origem}}`.
 *
 * Dinheiro (`valor`, `total`) sai formatado; número sai com vírgula e sem
 * zeros à direita; variável ausente vira vazio. Uma passada só: o valor que
 * entra não é relido como modelo. É `public.automation_render()`.
 */
export function renderAutomationTemplate(
  modelo: string,
  evento: Readonly<Record<string, unknown>>,
): string {
  return modelo.replace(/\{\{([a-z_]+)\}\}/g, (_todo, chave: string) => {
    // `{{constructor}}` não pode achar o que o objeto herda.
    const valor = Object.hasOwn(evento, chave) ? evento[chave] : undefined;
    if (valor === undefined || valor === null) return '';
    if ((chave === 'valor' || chave === 'total') && typeof valor === 'number') return brl(valor);
    if (typeof valor === 'number') {
      return String(Math.round(valor * 1000) / 1000).replace('.', ',');
    }
    return String(valor);
  });
}

/* ── Conferência de uma regra, antes do banco ─────────────────────────── */

export type AutomationRuleInput = {
  nome: string;
  gatilho: string;
  condicoes: readonly { campo: string; operador: string; valor: unknown }[];
  acao: string;
  params: Readonly<Record<string, unknown>>;
};

export type AutomationRuleCheck =
  | {
      ok: true;
      regra: {
        nome: string;
        gatilho: AutomationTrigger;
        condicoes: AutomationCondition[];
        acao: AutomationAction;
        params: Record<string, string | number>;
      };
    }
  | { ok: false; problemas: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tudo que o banco recusaria, dito antes e no campo certo — e o que ele não
 * recusaria mas não faria sentido: condição sobre campo que o gatilho não
 * tem, "contém" num valor em dinheiro, aviso para o responsável de um evento
 * que não tem responsável.
 */
export function checkAutomationRule(entrada: AutomationRuleInput): AutomationRuleCheck {
  const problemas: Record<string, string> = {};
  const nome = entrada.nome.trim();
  if (nome === '') problemas.nome = 'Dê um nome à automação.';
  else if (nome.length > 120) problemas.nome = 'No máximo 120 caracteres.';

  if (!isAutomationTrigger(entrada.gatilho)) {
    problemas.gatilho = 'Escolha quando a automação dispara.';
    return { ok: false, problemas };
  }
  const gatilho = entrada.gatilho;
  const definicao: DefinicaoDeGatilho = AUTOMATION_TRIGGERS[gatilho];

  const condicoes: AutomationCondition[] = [];
  if (entrada.condicoes.length > 10) problemas.condicoes = 'No máximo 10 condições.';
  entrada.condicoes.forEach((c, i) => {
    const campo = definicao.campos.find((d) => d.campo === c.campo);
    if (campo === undefined) {
      problemas[`condicoes.${i}`] = 'Este campo não existe neste gatilho.';
      return;
    }
    const operador = c.operador as ConditionOperator;
    if (!OPERADORES_POR_TIPO[campo.tipo].includes(operador)) {
      problemas[`condicoes.${i}`] =
        `"${ROTULO_DO_OPERADOR[operador] ?? c.operador}" não vale para ${campo.rotulo.toLowerCase()}.`;
      return;
    }
    if (campo.tipo === 'dinheiro' || campo.tipo === 'numero') {
      if (typeof c.valor !== 'number' || !Number.isFinite(c.valor) || c.valor < 0) {
        problemas[`condicoes.${i}`] = 'Informe um número.';
        return;
      }
      condicoes.push({ campo: campo.campo, operador, valor: c.valor });
      return;
    }
    const texto = typeof c.valor === 'string' ? c.valor.trim() : '';
    if (texto === '') {
      problemas[`condicoes.${i}`] = 'Informe o valor.';
      return;
    }
    if (campo.tipo === 'opcao' && !(campo.opcoes ?? []).some((o) => o.valor === texto)) {
      problemas[`condicoes.${i}`] = 'Escolha da lista.';
      return;
    }
    condicoes.push({ campo: campo.campo, operador, valor: texto.slice(0, 120) });
  });

  const acao = entrada.acao as AutomationAction;
  if (!(AUTOMATION_ACTIONS as readonly string[]).includes(entrada.acao)) {
    problemas.acao = 'Escolha o que a automação faz.';
    return { ok: false, problemas };
  }
  if (!actionAllowedFor(acao, gatilho)) {
    problemas.acao = 'Atividade no CRM só nasce de evento do CRM.';
  }

  const p = entrada.params;
  const titulo = typeof p.titulo === 'string' ? p.titulo.trim() : '';
  if (titulo === '') problemas.titulo = 'Escreva o título.';
  else if (titulo.length > 200) problemas.titulo = 'No máximo 200 caracteres.';
  const params: Record<string, string | number> = { titulo };

  if (acao === 'core.notify') {
    const texto = typeof p.texto === 'string' ? p.texto.trim() : '';
    if (texto.length > 1000) problemas.texto = 'No máximo 1000 caracteres.';
    if (texto !== '') params.texto = texto;
    const destino = p.destino;
    if (destino === 'responsavel') {
      if (!definicao.temResponsavel) problemas.destino = 'Este evento não tem responsável.';
      params.destino = 'responsavel';
    } else if (destino === 'usuario') {
      if (typeof p.usuario !== 'string' || !UUID.test(p.usuario)) {
        problemas.destino = 'Escolha a pessoa.';
      } else params.usuario = p.usuario;
      params.destino = 'usuario';
    } else if (destino === 'permissao') {
      if (
        typeof p.permissao !== 'string' ||
        !(PERMISSION_CODES as readonly string[]).includes(p.permissao)
      ) {
        problemas.destino = 'Escolha quem recebe.';
      } else params.permissao = p.permissao as PermissionCode;
      params.destino = 'permissao';
    } else {
      problemas.destino = 'Escolha quem recebe o aviso.';
    }
  }

  if (acao === 'crm.activity.create') {
    const dias = typeof p.dias === 'number' ? p.dias : Number(p.dias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
      problemas.dias = 'Em quantos dias vence — de 0 a 365.';
    } else params.dias = dias;
    const responsavel = p.responsavel;
    if (responsavel === 'responsavel') params.responsavel = 'responsavel';
    else if (typeof responsavel === 'string' && UUID.test(responsavel)) {
      params.responsavel = responsavel;
    } else problemas.responsavel = 'Escolha para quem é a atividade.';
  }

  if (Object.keys(problemas).length > 0) return { ok: false, problemas };
  return { ok: true, regra: { nome, gatilho, condicoes, acao, params } };
}
