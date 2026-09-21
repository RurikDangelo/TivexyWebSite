/**
 * Os estados do CRM, espelhando o SQL.
 *
 * Mesma regra de `tenancy.ts`: a lista existe em tempo de execução, não só
 * como união de tipos, e um teste de contratos a compara com o enum do banco.
 * Divergir aqui não abre brecha — o banco continua recusando o valor —, mas
 * produz interface que oferece um estado que não existe, ou esconde um que
 * existe.
 */

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
  const limpo = raw.trim();
  if (limpo === '') return null;

  /*
   * O ponto é separador de milhar no Brasil, e a vírgula é o decimal. Tratar
   * o ponto como decimal faria `1.234` virar R$ 1,23 — um erro de mil vezes
   * que passa despercebido justamente porque o número continua plausível.
   */
  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;

  const centavos = Math.round(Number(normalizado) * 100);
  return Number.isSafeInteger(centavos) ? centavos : null;
}
