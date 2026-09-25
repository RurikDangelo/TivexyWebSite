/**
 * Os contratos do ERP — produto, estoque, venda e financeiro —, espelhando o SQL.
 *
 * Mesma regra do CRM: as listas existem em tempo de execução, e o teste de
 * contratos compara cada uma com o enum ou a constraint do banco.
 */

/* ── Unidades ──────────────────────────────────────────────────────────── */

/**
 * Como um produto se conta.
 *
 * O mercado vende 0,350 kg de queijo; a cafeteria vende 2 cafés. A unidade
 * decide se a quantidade pode ter fração — e isso é regra, não formatação:
 * vender 1,5 unidade de café é erro de digitação, e o banco recusa.
 */
export const PRODUCT_UNITS = ['un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const UNIT_INFO: Readonly<
  Record<ProductUnit, { singular: string; plural: string; fracionada: boolean }>
> = {
  un: { singular: 'unidade', plural: 'unidades', fracionada: false },
  kg: { singular: 'quilo', plural: 'quilos', fracionada: true },
  g: { singular: 'grama', plural: 'gramas', fracionada: true },
  l: { singular: 'litro', plural: 'litros', fracionada: true },
  ml: { singular: 'mililitro', plural: 'mililitros', fracionada: true },
  m: { singular: 'metro', plural: 'metros', fracionada: true },
  cx: { singular: 'caixa', plural: 'caixas', fracionada: false },
  pct: { singular: 'pacote', plural: 'pacotes', fracionada: false },
};

export function isProductUnit(valor: unknown): valor is ProductUnit {
  return typeof valor === 'string' && (PRODUCT_UNITS as readonly string[]).includes(valor);
}

/* ── Quantidade ────────────────────────────────────────────────────────── */

/** Casas decimais de quantidade — as de `numeric(14,3)` no banco. */
export const QUANTITY_DECIMALS = 3;

/**
 * Texto digitado para quantidade, ou `null`.
 *
 * As mesmas regras de `parseCents`: vírgula é decimal, ponto é milhar. Até três
 * casas — um grama de um quilo. Aceita negativo só quando pedido (ajuste de
 * estoque); zero nunca, porque movimentar zero não é movimento.
 */
export function parseQuantity(raw: string, { negativo = false } = {}): number | null {
  const limpo = raw.trim().replace(/\s/g, '');
  if (limpo === '') return null;
  const sinal = limpo.startsWith('-') ? -1 : 1;
  if (sinal < 0 && !negativo) return null;
  const corpo = limpo.replace(/^[-+]/, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(corpo)) return null;
  const valor = sinal * Number(corpo);
  if (valor === 0 || !Number.isFinite(valor) || Math.abs(valor) >= 1e11) return null;
  return Math.round(valor * 1000) / 1000;
}

/** A quantidade serve para esta unidade? Devolve o motivo, ou `null`. */
export function checkQuantity(quantidade: number, unidade: ProductUnit): string | null {
  if (!UNIT_INFO[unidade].fracionada && !Number.isInteger(quantidade)) {
    return `${UNIT_INFO[unidade].singular} não se vende em fração`;
  }
  return null;
}

/**
 * O total de uma linha: quantidade × preço, arredondado ao centavo.
 *
 * Meio centavo sobe — é o `round()` do Postgres para valor positivo, e o
 * teste de contratos confere que os dois lados dão o mesmo número. A conta é
 * em `BigInt`, em milésimos de quantidade: 12,345 kg × R$ 99.999,99 passa de
 * 2^53 em ponto flutuante, e aí o total erraria no último centavo — o tipo de
 * diferença que só aparece no fechamento do caixa.
 */
export function lineTotalCents(quantidade: number, precoCentavos: number): number {
  // `BigInt(500)` e não `500n`: o app web compila para um alvo anterior ao
  // ES2020, que não aceita o literal — e a conta é a mesma.
  const [zero, meio, mil] = [BigInt(0), BigInt(500), BigInt(1000)];
  const milesimos = BigInt(Math.round(quantidade * 1000));
  const preco = BigInt(Math.round(precoCentavos));
  const produto = milesimos * preco;
  const negativo = produto < zero;
  const absoluto = negativo ? -produto : produto;
  const arredondado = (absoluto + meio) / mil;
  return Number(negativo ? -arredondado : arredondado);
}

/** `1.5` e `kg` → `1,5 kg`; `3` e `un` → `3 un`. */
export function formatQuantity(quantidade: number, unidade: ProductUnit): string {
  const texto = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: QUANTITY_DECIMALS,
  }).format(quantidade);
  return `${texto} ${unidade}`;
}

/* ── Margem ────────────────────────────────────────────────────────────── */

/**
 * A margem bruta sobre o preço, em porcentagem com uma casa: (preço − custo) / preço.
 *
 * `null` quando não dá para calcular — sem custo cadastrado, ou preço zero —,
 * e a tela mostra travessão, não "0%": margem zero é vender pelo custo, que é
 * outra coisa. Margem negativa é informação e aparece: vende-se abaixo do
 * custo.
 */
export function grossMargin(precoCentavos: number, custoCentavos: number | null): number | null {
  if (custoCentavos === null || precoCentavos <= 0) return null;
  return Math.round(((precoCentavos - custoCentavos) / precoCentavos) * 1000) / 10;
}

/**
 * Quantidade para o campo de edição: `1.5` → `1,5`; `1234` → `1234`.
 *
 * O inverso de `parseQuantity`, sem separador de milhar — que `parseQuantity`
 * leria, mas que num campo de quantidade só confunde. O teste confere a volta
 * completa: salvar sem mudar nada não pode falhar na validação.
 */
export function formatQuantityInput(quantidade: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: QUANTITY_DECIMALS,
    useGrouping: false,
  }).format(quantidade);
}

/* ── Estoque ───────────────────────────────────────────────────────────── */

/**
 * A situação do saldo de um produto, para a tela destacar o que precisa de ação.
 *
 * `low` é "chegou no mínimo", e não "passou dele": o mínimo é o ponto de
 * repor, e esperar ficar abaixo é repor atrasado. Produto que não controla
 * estoque não tem situação — serviço e item feito na hora não acabam.
 */
export type StockStatus = 'untracked' | 'negative' | 'out' | 'low' | 'ok';

export function stockStatus(produto: {
  trackStock: boolean;
  quantity: number | null;
  minStock: number | null;
}): StockStatus {
  if (!produto.trackStock) return 'untracked';
  const saldo = produto.quantity ?? 0;
  if (saldo < 0) return 'negative';
  if (saldo === 0) return 'out';
  if (produto.minStock !== null && produto.minStock > 0 && saldo <= produto.minStock) return 'low';
  return 'ok';
}

/**
 * O que moveu o estoque.
 *
 * `sale` e `sale_return` só nascem da venda e do cancelamento dela — a tela de
 * estoque não oferece, e o RLS não aceita que alguém os escreva à mão.
 */
export const INVENTORY_MOVEMENT_KINDS = ['in', 'out', 'adjustment', 'sale', 'sale_return'] as const;

export type InventoryMovementKind = (typeof INVENTORY_MOVEMENT_KINDS)[number];

/** O sinal que a quantidade de cada tipo precisa ter. */
export function movementSign(kind: InventoryMovementKind): 1 | -1 | 0 {
  switch (kind) {
    case 'in':
    case 'sale_return':
      return 1;
    case 'out':
    case 'sale':
      return -1;
    case 'adjustment':
      return 0;
  }
}

/** Da situação que mais pede ação para a que menos pede — a ordem da lista. */
export const STOCK_STATUS_ORDER: readonly StockStatus[] = [
  'negative',
  'out',
  'low',
  'ok',
  'untracked',
];

export interface StockSummary {
  porSituacao: Record<StockStatus, number>;
  /** Saldo positivo × custo, em centavos. Saldo negativo não vale dinheiro. */
  valorACusto: number;
  /** Quantos têm saldo e não têm custo — ficaram fora do valor, e a tela diz. */
  semCusto: number;
}

/**
 * O resumo do estoque: quantos em cada situação, e quanto vale a custo.
 *
 * O valor usa `lineTotalCents` — a mesma conta da venda —, para que 0,335 kg ×
 * R$ 52,90 dê o mesmo centavo aqui e em qualquer outro lugar.
 */
export function stockSummary(
  linhas: readonly {
    trackStock: boolean;
    quantity: number | null;
    minStock: number | null;
    costCents: number | null;
  }[],
): StockSummary {
  const porSituacao: Record<StockStatus, number> = {
    negative: 0,
    out: 0,
    low: 0,
    ok: 0,
    untracked: 0,
  };
  let valorACusto = 0;
  let semCusto = 0;
  for (const l of linhas) {
    porSituacao[stockStatus(l)] += 1;
    const saldo = l.quantity ?? 0;
    if (!l.trackStock || saldo <= 0) continue;
    if (l.costCents === null) semCusto += 1;
    else valorACusto += lineTotalCents(saldo, l.costCents);
  }
  return { porSituacao, valorACusto, semCusto };
}

/* ── Venda ─────────────────────────────────────────────────────────────── */

export const ERP_SALE_STATUSES = ['completed', 'cancelled'] as const;

export type ErpSaleStatus = (typeof ERP_SALE_STATUSES)[number];

/* ── Financeiro ────────────────────────────────────────────────────────── */

export const FINANCE_DIRECTIONS = ['receivable', 'payable'] as const;

export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];

export type FinanceStatus = 'paid' | 'cancelled' | 'overdue' | 'open';

/**
 * A situação de um lançamento, lida das datas — ele não guarda situação.
 *
 * Mesma decisão da oportunidade: guardar "vencido" numa coluna exigiria
 * alguém atualizá-la à meia-noite, e no dia em que o processo falhasse a
 * tela mostraria em dia o que venceu. Vencido é `vencimento < hoje`, e hoje
 * é o dia do tenant.
 */
export function financeStatus(
  entry: { paidAt: string | null; cancelledAt: string | null; dueDate: string },
  hoje: string,
): FinanceStatus {
  if (entry.cancelledAt !== null) return 'cancelled';
  if (entry.paidAt !== null) return 'paid';
  return entry.dueDate < hoje ? 'overdue' : 'open';
}
