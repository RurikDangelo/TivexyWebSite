/**
 * As contas do painel do negócio. Todas sobre o que veio do banco da empresa
 * — nada aqui inventa, estima ou completa número. Dia sem venda é zero porque
 * o banco disse zero (`erp_sales_daily` devolve todo dia do período).
 */

export interface DiaDeVenda {
  /** `2026-09-25`, dia do fuso da empresa. */
  dia: string;
  vendas: number;
  totalCentavos: number;
}

/** As linhas de `erp_sales_daily`, com número de verdade — o PostgREST devolve bigint como texto às vezes. */
export function serieDeVendas(
  linhas: readonly { day: unknown; sales_count: unknown; total_cents: unknown }[],
): DiaDeVenda[] {
  return linhas.map((l) => ({
    dia: String(l.day).slice(0, 10),
    vendas: Number(l.sales_count ?? 0) || 0,
    totalCentavos: Number(l.total_cents ?? 0) || 0,
  }));
}

/** Ticket médio em centavos, ou `null` sem venda — dividir por zero não é "R$ 0,00". */
export function ticketMedio(totalCentavos: number, vendas: number): number | null {
  return vendas > 0 ? Math.round(totalCentavos / vendas) : null;
}

/**
 * Os sete dias mais recentes contra os sete anteriores, da mesma série.
 *
 * Sem venda nos sete anteriores não há base: "infinitamente mais" não é
 * informação, e "0%" seria mentira.
 */
export function comparacaoSemanal(serie: readonly DiaDeVenda[]): {
  atual: number;
  anterior: number;
  variacao: number | null;
} {
  const ultimos = serie.slice(-7);
  const anteriores = serie.slice(-14, -7);
  const soma = (xs: readonly DiaDeVenda[]) => xs.reduce((t, d) => t + d.totalCentavos, 0);
  const atual = soma(ultimos);
  const anterior = soma(anteriores);
  return {
    atual,
    anterior,
    variacao: anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 100),
  };
}

/**
 * A altura de cada barra, proporcional ao maior valor. Valor maior que zero
 * nunca some — ganha ao menos `minimo` —, e zero é zero: uma barra de R$ 3
 * ao lado de uma de R$ 3.000 precisa existir, e um dia sem venda não pode
 * parecer que vendeu.
 */
export function alturasDasBarras(
  valores: readonly number[],
  alturaMaxima: number,
  minimo = 2,
): number[] {
  const maior = Math.max(0, ...valores);
  if (maior === 0) return valores.map(() => 0);
  return valores.map((v) => (v <= 0 ? 0 : Math.max(minimo, (v / maior) * alturaMaxima)));
}

export interface EtapaDoFunil {
  id: string;
  nome: string;
  quantidade: number;
  valorCentavos: number;
}

/**
 * O funil aberto por etapa, na ordem das etapas. Só etapas em andamento:
 * ganho e perda não são funil, são resultado.
 */
export function funilAberto(
  etapas: readonly { id: string; nome: string; tipo: string; posicao: number }[],
  negocios: readonly { etapaId: string; valorCentavos: number | null }[],
): EtapaDoFunil[] {
  return [...etapas]
    .filter((e) => e.tipo === 'open')
    .sort((a, b) => a.posicao - b.posicao)
    .map((e) => {
      const daqui = negocios.filter((n) => n.etapaId === e.id);
      return {
        id: e.id,
        nome: e.nome,
        quantidade: daqui.length,
        valorCentavos: daqui.reduce((t, n) => t + (n.valorCentavos ?? 0), 0),
      };
    });
}
