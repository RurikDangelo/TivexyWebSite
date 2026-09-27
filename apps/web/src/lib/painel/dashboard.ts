/**
 * As contas do painel do negócio. Todas sobre o que veio do banco da empresa
 * — nada aqui inventa, estima ou completa número. Dia sem venda é zero porque
 * o banco disse zero (`erp_sales_daily` devolve todo dia do período).
 */

import { addDays } from '@tivexy/core';

/* ── Período ─────────────────────────────────────────────────────────── */

export const PERIODOS = ['7d', '30d', '90d'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const DIAS_DO_PERIODO: Record<Periodo, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Texto do seletor e das frases de comparação. "7 dias", nunca "7d". */
export const ROTULO_DO_PERIODO: Record<Periodo, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

/**
 * 30 dias por padrão: 7 é curto demais para um comércio com sazonalidade de
 * semana, e 90 pede três chamadas de RPC pesadas para quem só abriu o painel.
 */
export const PERIODO_PADRAO: Periodo = '30d';

export function periodoPedido(valor: unknown): Periodo {
  return typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor)
    ? (valor as Periodo)
    : PERIODO_PADRAO;
}

/**
 * A janela pedida e a imediatamente anterior, de mesmo tamanho.
 *
 * Ambas em datas do calendário da empresa (`AAAA-MM-DD`), inclusivas nas duas
 * pontas. A anterior termina na véspera do início da atual — sem sobreposição
 * de um dia, que inflaria as duas somas com o mesmo movimento.
 *
 * O maior vão que isto produz é de 89 dias, dentro do teto de 92 que
 * `erp_sales_daily` impõe. Por isso as duas janelas são consultadas
 * separadamente, e nunca como um intervalo só.
 */
export interface Janela {
  dias: number;
  inicio: string;
  fim: string;
  inicioAnterior: string;
  fimAnterior: string;
}

export function janelaDoPeriodo(hoje: string, periodo: Periodo): Janela {
  const dias = DIAS_DO_PERIODO[periodo];
  const inicio = addDays(hoje, -(dias - 1));
  const fimAnterior = addDays(inicio, -1);
  return {
    dias,
    inicio,
    fim: hoje,
    inicioAnterior: addDays(fimAnterior, -(dias - 1)),
    fimAnterior,
  };
}

/* ── Série de vendas ─────────────────────────────────────────────────── */

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

/** Só os totais, na ordem do tempo — é o que a sparkline do `<Stat>` consome. */
export function totaisDaSerie(serie: readonly DiaDeVenda[]): number[] {
  return serie.map((d) => d.totalCentavos);
}

/** Ticket médio em centavos, ou `null` sem venda — dividir por zero não é "R$ 0,00". */
export function ticketMedio(totalCentavos: number, vendas: number): number | null {
  return vendas > 0 ? Math.round(totalCentavos / vendas) : null;
}

/**
 * A variação entre a janela atual e a anterior, em pontos percentuais.
 *
 * `null` em dois casos, e os dois significam a mesma coisa para quem lê: não
 * há base de comparação. Sem janela anterior (`anterior === null`, a leitura
 * não foi feita ou falhou) e com janela anterior zerada — "infinitamente mais"
 * não é informação, e `0%` seria afirmar estabilidade que ninguém apurou.
 *
 * É este contrato que o `<Stat variacao>` renderiza como "sem base para
 * comparar" (CLAUDE.md; DESIGN_SYSTEM, risco R7).
 */
export function variacaoPercentual(atual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
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

/* ── Truncamento ─────────────────────────────────────────────────────── */

/**
 * O aviso de que a soma parou no limite da consulta — ou `null` quando ela
 * pegou tudo.
 *
 * O painel tinha `.limit(5000)` em funil e estoque e exibia o resultado como
 * total da empresa. A consulta agora pede `count: 'exact'` junto com as
 * linhas: o banco diz quantas existem, o `.limit()` diz quantas vieram, e
 * quando os dois discordam o número deixa de ser apresentado como total.
 *
 * `total === null` é contagem que não veio; aí também não se pode afirmar que
 * a soma é completa, e o aviso aparece sem o número de fora.
 */
export function avisoDeTruncamento(
  lidas: number,
  total: number | null,
  oQue: string,
): string | null {
  const pt = (n: number) => n.toLocaleString('pt-BR');
  if (total === null) return `somei ${pt(lidas)} ${oQue}; não sei se há mais`;
  return total > lidas ? `somei ${pt(lidas)} de ${pt(total)} ${oQue}` : null;
}

/* ── Funil ───────────────────────────────────────────────────────────── */

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

/* ── Formatação de eixo ──────────────────────────────────────────────── */

const COMPACTO = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Centavos em reais abreviados: `R$ 1,2 mil`.
 *
 * Só para rótulo de eixo, onde a cifra inteira (`R$ 1.234,56`) rouba a calha
 * da esquerda do gráfico. Todo valor que a pessoa vai anotar, conferir ou
 * comparar continua saindo por `formatCents`.
 */
export function reaisCompactos(centavos: number): string {
  if (centavos === 0) return 'R$ 0';
  return `R$ ${COMPACTO.format(centavos / 100)}`;
}
