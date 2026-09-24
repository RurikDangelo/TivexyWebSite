/**
 * Os estados e unidades do ERP, espelhando o SQL.
 *
 * Mesma regra de `tenancy.ts` e `crm.ts`: a lista existe em tempo de execução,
 * não só como união de tipos, e um teste de contratos a compara com o enum do
 * banco. Divergir aqui não abre brecha — o banco continua recusando o valor —,
 * mas produz interface que oferece um estado que não existe, ou esconde um que
 * existe.
 */

/* ── Unidade de medida ─────────────────────────────────────────────────── */

/**
 * Enum, e não texto livre.
 *
 * `KG`, `Kg`, `kg` e `quilo` na mesma base tornam qualquer relatório por
 * unidade uma adivinhação — e a descoberta acontece no fechamento do mês,
 * quando já há mil produtos cadastrados de quatro jeitos.
 */
export const ERP_UNITS = ['un', 'kg', 'g', 'l', 'ml', 'm', 'm2', 'h', 'cx'] as const;

export type ErpUnit = (typeof ERP_UNITS)[number];

/** Como cada unidade se escreve por extenso, para formulário e relatório. */
export const ERP_UNIT_LABEL: Record<ErpUnit, string> = {
  un: 'unidade',
  kg: 'quilo',
  g: 'grama',
  l: 'litro',
  ml: 'mililitro',
  m: 'metro',
  m2: 'metro quadrado',
  h: 'hora',
  cx: 'caixa',
};

/* ── Movimento de estoque ──────────────────────────────────────────────── */

/**
 * O que move estoque.
 *
 * `adjustment` existe separado de `in`/`out` de propósito: inventário e
 * correção não são compra nem venda, e misturá-los faz o relatório de giro
 * contar ajuste como movimento comercial — o produto parece vender o dobro no
 * mês em que alguém acertou a contagem.
 */
export const ERP_MOVEMENT_KINDS = ['in', 'out', 'adjustment'] as const;

export type ErpMovementKind = (typeof ERP_MOVEMENT_KINDS)[number];

export const ERP_MOVEMENT_LABEL: Record<ErpMovementKind, string> = {
  in: 'Entrada',
  out: 'Saída',
  adjustment: 'Ajuste',
};

/**
 * Quanto este movimento soma ao saldo.
 *
 * A quantidade gravada é **sempre positiva** — há constraint provando — e o
 * sinal vem do tipo. Quantidade negativa com tipo `in` seria uma saída
 * disfarçada de entrada, e nenhuma soma perceberia.
 *
 * Esta função espelha o gatilho `erp_apply_stock_movement`. Ela existe para a
 * tela conseguir mostrar o efeito de um lançamento antes de gravá-lo — não
 * para calcular saldo, que é do banco.
 */
export function stockDelta(kind: ErpMovementKind, quantity: number): number {
  return kind === 'out' ? -quantity : quantity;
}

/* ── Venda ─────────────────────────────────────────────────────────────── */

/**
 * O ciclo de uma venda.
 *
 * `draft` não é burocracia: montar uma venda item a item **precisa** de um
 * estado em que nada aconteceu no mundo. Sem ele, cada linha acrescentada
 * mexeria no estoque, e desistir no meio deixaria o inventário errado.
 */
export const ERP_SALE_STATUSES = ['draft', 'confirmed', 'cancelled'] as const;

export type ErpSaleStatus = (typeof ERP_SALE_STATUSES)[number];

export const ERP_SALE_LABEL: Record<ErpSaleStatus, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
};

/** A venda já saiu do rascunho? */
export function isSaleClosed(status: ErpSaleStatus): boolean {
  return status !== 'draft';
}

/* ── Financeiro ────────────────────────────────────────────────────────── */

/**
 * Pagar ou receber.
 *
 * Um enum numa tabela só, e não duas tabelas quase iguais: duas dobrariam
 * toda consulta de fluxo de caixa e fariam o saldo precisar de `union` — e
 * `union` esquecido de um lado é relatório errado que parece certo.
 */
export const FINANCE_ENTRY_KINDS = ['payable', 'receivable'] as const;

export type FinanceEntryKind = (typeof FINANCE_ENTRY_KINDS)[number];

export const FINANCE_ENTRY_LABEL: Record<FinanceEntryKind, string> = {
  payable: 'A pagar',
  receivable: 'A receber',
};

/** O sinal de um lançamento no fluxo de caixa. */
export function financeSign(kind: FinanceEntryKind): 1 | -1 {
  return kind === 'receivable' ? 1 : -1;
}

/* ── Contas ────────────────────────────────────────────────────────────── */

/**
 * O total de um item de venda, em centavos inteiros.
 *
 * `Math.round` porque a quantidade pode ser fracionária — 1,5 kg de café a
 * R$ 45,00 dá 6750 centavos exatos, mas 0,333 kg dá 1498,5. O banco faz
 * `round()` na mesma conta, no gatilho que mantém o total da venda, e as duas
 * precisam concordar: a tela mostraria um centavo a mais que a gravação.
 *
 * Em nenhum momento um valor de dinheiro vira ponto flutuante para ser
 * **somado** — o que passa por `number` aqui é uma multiplicação isolada,
 * arredondada na hora.
 */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

/**
 * Texto digitado para quantidade, ou `null` quando não é número.
 *
 * Irmão de `parseCents`, e com a mesma regra brasileira: ponto é separador de
 * milhar, vírgula é o decimal. Três casas, que é o que a coluna
 * `numeric(14,3)` guarda — `0,5 kg` e `1,250 kg` são pedidos reais, e recusar
 * a terceira casa faria a pessoa arredondar na cabeça.
 */
export function parseQuantity(raw: string): number | null {
  const limpo = raw.trim();
  if (limpo === '') return null;

  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(normalizado)) return null;

  const valor = Number(normalizado);
  /* Zero é recusado: item de venda com quantidade zero não é item. */
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/** Quantidade para texto, sem casas decimais inúteis. `2` e não `2,000`. */
export function formatQuantity(quantity: number, locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(quantity);
}
