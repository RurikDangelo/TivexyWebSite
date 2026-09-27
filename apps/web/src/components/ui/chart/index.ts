/**
 * A base de gráficos do produto (P12 do DESIGN_SYSTEM).
 *
 * `ChartFrame` e `ChartTooltip` são componentes de cliente — medir e capturar
 * o ponteiro exige o navegador. Quem os usa também precisa ser cliente, porque
 * as marcas são desenhadas por função (`children(area)`) sobre a geometria
 * medida, e função não atravessa a fronteira servidor/cliente. O jeito de
 * manter a folha pequena é o de sempre: a página continua no servidor, busca
 * os dados e passa a série pronta para o gráfico.
 *
 * `Sparkline` não mede nada e é componente de servidor.
 */
export { ChartFrame } from './frame';
export type {
  AreaDoGrafico,
  CalhasDoGrafico,
  ChartFrameProps,
  MarcaDoEixoX,
  MarcaDoEixoY,
} from './frame';

export { ChartTooltip } from './tooltip';
export type { ChartTooltipProps, ColunaDoGrafico, TomDoValor, ValorDaColuna } from './tooltip';

export { Sparkline } from './sparkline';
export type { SparklineProps, TomDaSparkline } from './sparkline';

export { LARGURA_DE_RETAGUARDA, useLarguraMedida } from './use-largura-medida';
export type { LarguraMedida } from './use-largura-medida';
