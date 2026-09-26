/**
 * Os estados do CRM, espelhando o SQL.
 *
 * Mesma regra de `tenancy.ts`: a lista existe em tempo de execução, não só
 * como união de tipos, e um teste de contratos a compara com o enum do banco.
 * Divergir aqui não abre brecha — o banco continua recusando o valor —, mas
 * produz interface que oferece um estado que não existe, ou esconde um que
 * existe.
 */

import { normalizeDecimal } from './decimal.ts';

/**
 * O que uma etapa do funil significa para o negócio.
 *
 * **A oportunidade não guarda situação própria.** Ela é a da etapa em que a
 * oportunidade está, e isso é decisão do esquema: guardar as duas seria manter
 * duas verdades, e elas divergiriam no dia em que alguém movesse a etapa por
 * importação ou por SQL — sem erro nenhum, só relatório errado.
 */
export const CRM_STAGE_KINDS = ['open', 'won', 'lost'] as const;

export type CrmStageKind = (typeof CRM_STAGE_KINDS)[number];

/** Etapa que encerra a oportunidade — ganha ou perdida. */
export function isClosedStage(kind: CrmStageKind): boolean {
  return kind !== 'open';
}

/**
 * O ciclo de um lead.
 *
 * `disqualified` e `converted` são terminais, e por motivos opostos: um não
 * virou nada, o outro virou cliente. Nenhum dos dois volta — reabrir seria
 * reescrever a história de onde vieram os clientes que fecharam.
 */
export const CRM_LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'disqualified',
  'converted',
] as const;

export type CrmLeadStatus = (typeof CRM_LEAD_STATUSES)[number];

const LEAD_TERMINAIS: ReadonlySet<CrmLeadStatus> = new Set(['disqualified', 'converted']);

/** O lead já teve desfecho? */
export function isLeadClosed(status: CrmLeadStatus): boolean {
  return LEAD_TERMINAIS.has(status);
}

/**
 * Para quais estados um lead pode ir a partir daqui.
 *
 * A regra vive aqui, e não numa tela: a mesma transição vai acontecer por
 * importação, por automação e por API, e três cópias da regra divergem.
 *
 * `converted` **não** está em nenhuma lista. Converter não é trocar de estado:
 * é criar conta, pessoa e oportunidade numa transação, e quem faz isso é o
 * servidor — oferecer como transição solta deixaria o lead marcado como
 * convertido sem nada do outro lado.
 */
export function nextLeadStatuses(current: CrmLeadStatus): readonly CrmLeadStatus[] {
  switch (current) {
    case 'new':
      return ['contacted', 'qualified', 'disqualified'];
    case 'contacted':
      return ['qualified', 'disqualified'];
    case 'qualified':
      return ['contacted', 'disqualified'];
    case 'disqualified':
      /* Volta para a fila: enganos acontecem, e o histórico fica no registro. */
      return ['new'];
    case 'converted':
      return [];
  }
}

/* ── Dinheiro ──────────────────────────────────────────────────────────── */

/**
 * Centavos para texto em reais.
 *
 * Vive no Core porque o valor sai do banco em centavos inteiros e **toda**
 * tela que o mostra precisa da mesma conversão. Uma segunda implementação em
 * algum componente é a que vai arredondar diferente.
 *
 * `Intl` faz a formatação; a divisão por 100 é exata para qualquer inteiro
 * seguro, porque o que entra aqui é inteiro e o que sai é texto — em nenhum
 * momento um valor de dinheiro vira ponto flutuante para ser somado.
 */
export function formatCents(cents: number, locale = 'pt-BR', currency = 'BRL'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/**
 * Texto digitado para centavos, ou `null` quando não é número.
 *
 * Aceita o que uma pessoa brasileira digita — `1.234,56`, `1234,56`, `1234` —
 * e recusa o resto. Recusar é importante: transformar entrada inválida em zero
 * grava uma oportunidade de R$ 0,00 que ninguém pediu, e ninguém percebe até o
 * relatório de faturamento.
 */
export function parseCents(raw: string): number | null {
  /*
   * O ponto é separador de milhar no Brasil, e a vírgula é o decimal. Tratar
   * o ponto como decimal sempre faria `1.234` virar R$ 1,23 — um erro de mil
   * vezes. Tratá-lo como milhar sempre fazia `5.50`, do teclado do celular,
   * virar R$ 550,00 — um erro de cem vezes, que existiu até 25/09/2026. A
   * regra que resolve os dois está em `normalizeDecimal`.
   */
  const normalizado = normalizeDecimal(raw, 2);
  if (normalizado === null) return null;

  const centavos = Math.round(Number(normalizado) * 100);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/**
 * Centavos para o texto que a pessoa digitaria: `450000` → `4.500,00`.
 *
 * O inverso de `parseCents`, para preencher o campo de edição. Sem símbolo de
 * moeda, que o campo não aceita de volta — e o teste confere a volta completa,
 * porque um formato que `parseCents` não lê faria "salvar sem mudar nada"
 * falhar na validação.
 */
export function formatCentsInput(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(cents / 100);
}

/* ── Funil ─────────────────────────────────────────────────────────────── */

/** O mínimo que uma etapa precisa ter para ser posta no quadro. */
export interface BoardStage {
  id: string;
  name: string;
  kind: CrmStageKind;
  position: number;
}

/** O mínimo que uma oportunidade precisa ter para ser somada. */
export interface BoardDeal {
  stageId: string;
  valueCents: number;
}

const ORDEM_DO_TIPO: Record<CrmStageKind, number> = { open: 0, won: 1, lost: 2 };

/**
 * As colunas do quadro, na ordem em que o negócio anda.
 *
 * As abertas pela posição; depois ganho; depois perda. **O tipo vence a
 * posição**, de propósito: um funil semeado com "Perdido" na posição 3 e
 * "Proposta" na 4 desenharia a perda no meio do caminho, e o quadro contaria
 * uma história em que se perde antes de propor. Empate de posição cai no
 * nome, para a ordem não depender do plano de execução da consulta.
 */
export function orderStages<T extends BoardStage>(stages: readonly T[]): T[] {
  return [...stages].sort(
    (a, b) =>
      ORDEM_DO_TIPO[a.kind] - ORDEM_DO_TIPO[b.kind] ||
      a.position - b.position ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export interface Totals {
  count: number;
  cents: number;
}

/**
 * Quantas oportunidades e quanto dinheiro há em cada etapa.
 *
 * Toda etapa aparece, inclusive as vazias: coluna sem total na tela é
 * ambígua — "zero" ou "não calculado"? E oportunidade numa etapa que não está
 * na lista **não** é somada em lugar nenhum; ela não pertence a este quadro.
 *
 * Soma em centavos inteiros, nunca em reais: ver `formatCents`.
 */
export function stageTotals(
  stages: readonly BoardStage[],
  deals: readonly BoardDeal[],
): Map<string, Totals> {
  const totais = new Map<string, Totals>(stages.map((s) => [s.id, { count: 0, cents: 0 }]));
  for (const deal of deals) {
    const t = totais.get(deal.stageId);
    if (t === undefined) continue;
    t.count += 1;
    t.cents += deal.valueCents;
  }
  return totais;
}

/** Os totais do quadro por situação — que é a da etapa, não da oportunidade. */
export function boardTotals(
  stages: readonly BoardStage[],
  deals: readonly BoardDeal[],
): Record<CrmStageKind, Totals> {
  const porEtapa = stageTotals(stages, deals);
  const soma: Record<CrmStageKind, Totals> = {
    open: { count: 0, cents: 0 },
    won: { count: 0, cents: 0 },
    lost: { count: 0, cents: 0 },
  };
  for (const stage of stages) {
    const t = porEtapa.get(stage.id);
    if (t === undefined) continue;
    soma[stage.kind].count += t.count;
    soma[stage.kind].cents += t.cents;
  }
  return soma;
}

/**
 * O funil tem por onde sair?
 *
 * A mesma regra que `checkBlueprint()` cobra dos documentos de nicho, agora
 * para o funil editado pela tela: sem etapa de ganho nenhum negócio fecha, e
 * sem etapa de perda não há onde registrar quem não comprou. Devolve o que
 * falta, para a tela dizer.
 */
export function missingExits(stages: readonly Pick<BoardStage, 'kind'>[]): CrmStageKind[] {
  const tipos = new Set(stages.map((s) => s.kind));
  return (['won', 'lost'] as const).filter((k) => !tipos.has(k));
}

/**
 * Somas por situação de uma lista qualquer de oportunidades — as de uma conta,
 * as de uma pessoa —, quando cada uma já traz o tipo da etapa em que está.
 *
 * É `boardTotals` sem precisar da lista de etapas: fora do quadro, as
 * oportunidades vêm de funis diferentes, e a situação chega embutida.
 */
export function totalsByKind(
  items: readonly { kind: CrmStageKind; valueCents: number }[],
): Record<CrmStageKind, Totals> {
  const soma: Record<CrmStageKind, Totals> = {
    open: { count: 0, cents: 0 },
    won: { count: 0, cents: 0 },
    lost: { count: 0, cents: 0 },
  };
  for (const item of items) {
    soma[item.kind].count += 1;
    soma[item.kind].cents += item.valueCents;
  }
  return soma;
}
