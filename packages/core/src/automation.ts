/**
 * O motor de automações: gatilho → condição → ação.
 *
 * ## A decisão mora aqui; a escrita, não
 *
 * Este arquivo é puro. Ele recebe um evento e as regras, e devolve **a lista
 * de ações a executar** — sem tocar em banco, sem relógio, sem rede. É a
 * mesma divisão de `planProvisioning()`: decidir é do Core, escrever é da
 * aplicação.
 *
 * Não é preferência de estilo. Um motor que decide e escreve junto só pode ser
 * testado com banco, e aí cada caso de condição custa uma transação — então
 * ninguém escreve os casos, e o motor dispara errado em produção. Aqui cada
 * combinação de operador e valor é um teste de milissegundos.
 *
 * ## Só interno, e isso é uma fronteira
 *
 * Nenhuma ação daqui manda e-mail, mensagem de WhatsApp ou chamada de webhook.
 * Não é "ainda não": é **por enquanto proibido**, porque o projeto não tem
 * SMTP próprio nem credencial da Meta, e uma automação que diz "notifiquei o
 * cliente" sem notificar ninguém é pior do que automação nenhuma — ela faz a
 * pessoa parar de conferir.
 *
 * Quando houver canal, a ação nova entra nesta lista e passa a ter execução de
 * verdade. Até lá, o catálogo não a oferece.
 */

/* ── Gatilhos ──────────────────────────────────────────────────────────── */

/**
 * O que pode disparar uma automação.
 *
 * Cada um destes corresponde a um ponto do sistema onde a aplicação
 * **já escreve** e portanto sabe que aconteceu. Não há varredura periódica
 * procurando mudança: gatilho por polling é o que produz automação que roda
 * duas vezes, ou que não roda.
 */
export const AUTOMATION_EVENTS = [
  'crm.lead.created',
  'crm.lead.status_changed',
  'crm.deal.stage_changed',
  'erp.sale.confirmed',
] as const;

export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number];

export const AUTOMATION_EVENT_LABEL: Record<AutomationEvent, string> = {
  'crm.lead.created': 'Quando um lead é cadastrado',
  'crm.lead.status_changed': 'Quando um lead muda de estado',
  'crm.deal.stage_changed': 'Quando uma oportunidade muda de etapa',
  'erp.sale.confirmed': 'Quando uma venda é confirmada',
};

/**
 * Os campos que cada gatilho oferece para condição e para ação.
 *
 * Existe para a tela conseguir oferecer só o que faz sentido — e para
 * `checkRule()` recusar uma regra que olha um campo que aquele evento nunca
 * traz. Sem isto, a regra é salva, nunca dispara, e não dá erro: o defeito
 * sem sintoma.
 */
export const AUTOMATION_EVENT_FIELDS: Record<AutomationEvent, readonly string[]> = {
  'crm.lead.created': ['name', 'source', 'companyName', 'status'],
  'crm.lead.status_changed': ['name', 'source', 'status', 'previousStatus'],
  'crm.deal.stage_changed': ['title', 'valueCents', 'stageKind', 'stageName'],
  'erp.sale.confirmed': ['number', 'totalCents', 'customerName'],
};

/* ── Condições ─────────────────────────────────────────────────────────── */

/**
 * Os operadores.
 *
 * Curto de propósito. Cada operador é uma superfície que precisa ser testada,
 * explicada na tela e mantida — e uma lista de trinta produz uma interface que
 * ninguém entende e um motor onde os casos raros não têm teste.
 */
export const AUTOMATION_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'empty',
] as const;

export type AutomationOperator = (typeof AUTOMATION_OPERATORS)[number];

export const AUTOMATION_OPERATOR_LABEL: Record<AutomationOperator, string> = {
  eq: 'é igual a',
  neq: 'é diferente de',
  contains: 'contém',
  gt: 'é maior que',
  gte: 'é maior ou igual a',
  lt: 'é menor que',
  lte: 'é menor ou igual a',
  exists: 'está preenchido',
  empty: 'está vazio',
};

/** Os operadores que não usam o valor de comparação. */
const SEM_VALOR: ReadonlySet<AutomationOperator> = new Set(['exists', 'empty']);

export function needsValue(operator: AutomationOperator): boolean {
  return !SEM_VALOR.has(operator);
}

export interface AutomationCondition {
  field: string;
  operator: AutomationOperator;
  /** Ignorado por `exists` e `empty`. */
  value?: string;
}

export interface AutomationAction {
  kind: AutomationActionKind;
  /** Os parâmetros da ação, já validados por `checkRule()`. */
  params: Readonly<Record<string, string>>;
}

export interface AutomationRule {
  id: string;
  name: string;
  event: AutomationEvent;
  /** Todas precisam valer. "Qualquer uma" viria como regra separada. */
  conditions: readonly AutomationCondition[];
  actions: readonly AutomationAction[];
  isActive: boolean;
}

/* ── Ações ─────────────────────────────────────────────────────────────── */

/**
 * O que uma automação pode fazer.
 *
 * **Só escrita interna.** Não há ação de e-mail, de WhatsApp nem de webhook, e
 * a ausência é a fronteira descrita no topo deste arquivo.
 */
export const AUTOMATION_ACTIONS = ['crm.activity.create', 'finance.entry.create'] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTIONS)[number];

export const AUTOMATION_ACTION_LABEL: Record<AutomationActionKind, string> = {
  'crm.activity.create': 'Criar uma atividade na agenda',
  'finance.entry.create': 'Lançar uma conta no financeiro',
};

/** Os parâmetros obrigatórios de cada ação. */
export const AUTOMATION_ACTION_PARAMS: Record<AutomationActionKind, readonly string[]> = {
  'crm.activity.create': ['subject', 'dueInDays'],
  'finance.entry.create': ['kind', 'description', 'amountCents', 'dueInDays'],
};

/* ── O evento que chega ────────────────────────────────────────────────── */

export interface AutomationTriggerEvent {
  type: AutomationEvent;
  /**
   * O que aconteceu, em campos simples. Nunca a linha inteira do banco: o
   * motor compara texto e número, e passar objeto aninhado convidaria a
   * condição a olhar um caminho que a tela não sabe oferecer.
   */
  data: Readonly<Record<string, string | number | null>>;
}

/* ── A decisão ─────────────────────────────────────────────────────────── */

/** Compara como texto quando um dos lados é texto; como número quando dá. */
function comparavel(valor: string | number | null): { texto: string; numero: number | null } {
  if (valor === null) return { texto: '', numero: null };
  if (typeof valor === 'number') return { texto: String(valor), numero: valor };

  const limpo = valor.trim();
  /*
   * Texto que parece número **é** comparado como número: quem escreve
   * "valor maior que 1000" na tela digita `1000`, e comparar isso como texto
   * faria `"900" > "1000"` ser verdadeiro — a comparação lexicográfica de
   * números é o erro clássico, e silencioso.
   */
  const numero = limpo !== '' && /^-?\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : null;
  return { texto: limpo, numero };
}

/** Uma condição vale para este evento? */
export function matchesCondition(
  condition: AutomationCondition,
  data: AutomationTriggerEvent['data'],
): boolean {
  const bruto = Object.hasOwn(data, condition.field) ? data[condition.field] : undefined;
  const presente = bruto !== undefined && bruto !== null && String(bruto).trim() !== '';

  if (condition.operator === 'exists') return presente;
  if (condition.operator === 'empty') return !presente;

  /*
   * Campo ausente **nunca casa** nos operadores de comparação. A alternativa
   * — tratar ausente como string vazia — faria "origem é diferente de
   * Instagram" disparar para todo lead sem origem, que é justamente o
   * contrário do que quem escreveu a regra quis dizer.
   */
  if (bruto === undefined || bruto === null) return false;

  const esquerda = comparavel(bruto as string | number);
  const direita = comparavel(condition.value ?? '');

  switch (condition.operator) {
    case 'eq':
      return esquerda.texto.toLowerCase() === direita.texto.toLowerCase();
    case 'neq':
      return esquerda.texto.toLowerCase() !== direita.texto.toLowerCase();
    case 'contains':
      return esquerda.texto.toLowerCase().includes(direita.texto.toLowerCase());
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      /*
       * Comparação de ordem exige que **os dois** lados sejam número. Sem
       * isso, "valor maior que abc" viraria uma comparação de texto que às
       * vezes dá verdadeiro — e a regra dispararia por acaso.
       */
      if (esquerda.numero === null || direita.numero === null) return false;
      if (condition.operator === 'gt') return esquerda.numero > direita.numero;
      if (condition.operator === 'gte') return esquerda.numero >= direita.numero;
      if (condition.operator === 'lt') return esquerda.numero < direita.numero;
      return esquerda.numero <= direita.numero;
    }
  }
}

/** A regra inteira vale para este evento? */
export function matchesRule(rule: AutomationRule, event: AutomationTriggerEvent): boolean {
  if (!rule.isActive) return false;
  if (rule.event !== event.type) return false;
  /* Sem condição, a regra vale para todo evento daquele tipo. É o caso comum
     — "toda venda confirmada agenda o pós-venda" — e exigir uma condição
     vazia seria burocracia. */
  return rule.conditions.every((condicao) => matchesCondition(condicao, event.data));
}

/** Uma ação decidida, pronta para a aplicação executar. */
export interface PlannedAction {
  ruleId: string;
  ruleName: string;
  action: AutomationAction;
}

/**
 * O que fazer quando este evento acontece.
 *
 * A ordem é a das regras, e dentro delas a das ações — determinística de
 * propósito: uma automação que roda em ordem diferente a cada vez é
 * impossível de depurar quando o cliente diz "às vezes não funciona".
 */
export function planAutomations(
  event: AutomationTriggerEvent,
  rules: readonly AutomationRule[],
): PlannedAction[] {
  return rules
    .filter((regra) => matchesRule(regra, event))
    .flatMap((regra) =>
      regra.actions.map((action) => ({ ruleId: regra.id, ruleName: regra.name, action })),
    );
}

/* ── Validação ─────────────────────────────────────────────────────────── */

export interface RuleProblem {
  path: string;
  message: string;
}

/**
 * A regra faz sentido? Relata **todos** os problemas de uma vez.
 *
 * Mesma forma de `checkBlueprint()`, e pelo mesmo motivo: corrigir um
 * problema por vez, salvando e vendo o próximo, é o que faz alguém desistir
 * no terceiro.
 *
 * O que ela pega e que o banco não pegaria: condição sobre campo que aquele
 * gatilho **nunca traz**. Sem isso a regra é salva, nunca dispara e não dá
 * erro — o defeito sem sintoma.
 */
export function checkRule(rule: {
  name?: unknown;
  event?: unknown;
  conditions?: unknown;
  actions?: unknown;
}): RuleProblem[] {
  const problemas: RuleProblem[] = [];

  if (typeof rule.name !== 'string' || rule.name.trim() === '') {
    problemas.push({ path: 'name', message: 'a regra precisa de um nome' });
  }

  const evento = rule.event;
  if (typeof evento !== 'string' || !(AUTOMATION_EVENTS as readonly string[]).includes(evento)) {
    problemas.push({ path: 'event', message: 'gatilho desconhecido' });
    /* Sem gatilho válido não dá para conferir campo nenhum: os campos
       disponíveis são justamente os daquele gatilho. */
    return problemas;
  }

  const campos = AUTOMATION_EVENT_FIELDS[evento as AutomationEvent];

  const condicoes = Array.isArray(rule.conditions) ? rule.conditions : [];
  condicoes.forEach((bruto, i) => {
    const condicao = bruto as Partial<AutomationCondition>;

    if (typeof condicao.field !== 'string' || !campos.includes(condicao.field)) {
      problemas.push({
        path: `conditions[${i}].field`,
        message: `"${String(condicao.field)}" não existe neste gatilho — disponíveis: ${campos.join(', ')}`,
      });
    }

    const operador = condicao.operator;
    if (
      typeof operador !== 'string' ||
      !(AUTOMATION_OPERATORS as readonly string[]).includes(operador)
    ) {
      problemas.push({ path: `conditions[${i}].operator`, message: 'operador desconhecido' });
      return;
    }

    if (
      needsValue(operador as AutomationOperator) &&
      (typeof condicao.value !== 'string' || condicao.value.trim() === '')
    ) {
      problemas.push({
        path: `conditions[${i}].value`,
        message: `"${AUTOMATION_OPERATOR_LABEL[operador as AutomationOperator]}" precisa de um valor`,
      });
    }
  });

  const acoes = Array.isArray(rule.actions) ? rule.actions : [];
  if (acoes.length === 0) {
    problemas.push({ path: 'actions', message: 'uma regra sem ação não faz nada' });
  }

  acoes.forEach((bruto, i) => {
    const acao = bruto as Partial<AutomationAction>;
    const tipo = acao.kind;

    if (typeof tipo !== 'string' || !(AUTOMATION_ACTIONS as readonly string[]).includes(tipo)) {
      problemas.push({ path: `actions[${i}].kind`, message: 'ação desconhecida' });
      return;
    }

    const params = (acao.params ?? {}) as Record<string, unknown>;
    for (const obrigatorio of AUTOMATION_ACTION_PARAMS[tipo as AutomationActionKind]) {
      const valor = params[obrigatorio];
      if (typeof valor !== 'string' || valor.trim() === '') {
        problemas.push({
          path: `actions[${i}].params.${obrigatorio}`,
          message: 'obrigatório',
        });
      }
    }
  });

  return problemas;
}

/* ── Substituição de campos ────────────────────────────────────────────── */

/**
 * Troca `{{campo}}` pelo valor do evento.
 *
 * É o que faz a ação ser útil: "Comissão da venda #{{number}}" vira
 * "Comissão da venda #7". Sem isso, toda atividade criada por automação teria
 * o mesmo assunto, e quem abrisse a agenda veria dez linhas iguais sem saber
 * de qual cliente é cada uma.
 *
 * ## O que ela deliberadamente não faz
 *
 * Não avalia expressão, não tem condicional, não chama função. É substituição
 * de texto, e parar aqui é decisão: um mecanismo de modelo com expressões vira
 * uma linguagem, e uma linguagem dentro de um campo de formulário é
 * superfície que ninguém consegue validar nem explicar.
 *
 * **Campo que não existe vira texto vazio, não fica como está.** Deixar
 * `{{inventado}}` aparecer na agenda do cliente mostraria a implementação a
 * quem não tem nada com isso — e mostraria como um defeito, que é o que é.
 */
export function applyTemplate(texto: string, data: AutomationTriggerEvent['data']): string {
  return texto.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, campo: string) => {
    const valor = Object.hasOwn(data, campo) ? data[campo] : undefined;
    return valor === undefined || valor === null ? '' : String(valor);
  });
}
