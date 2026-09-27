import { cn } from '@/lib/utils';

export type TomDaSparkline = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TOM: Record<TomDaSparkline, { traco: string; ponto: string }> = {
  neutral: { traco: 'stroke-content-muted', ponto: 'fill-content-muted' },
  accent: { traco: 'stroke-content-accent', ponto: 'fill-content-accent' },
  success: { traco: 'stroke-success', ponto: 'fill-success' },
  warning: { traco: 'stroke-warning', ponto: 'fill-warning' },
  danger: { traco: 'stroke-danger', ponto: 'fill-danger' },
};

/* Meia espessura do traço mais o raio do ponto final: sem isso a última marca sai cortada. */
const MARGEM = 2.5;

export interface SparklineProps {
  /** A série inteira, na ordem do tempo. Vazia desenha o estado vazio, não uma linha reta. */
  serie: readonly number[];
  largura?: number;
  altura?: number;
  tom?: TomDaSparkline;
  /**
   * Nome acessível. Sem ele a figura é decorativa (`aria-hidden`) — que é o
   * caso dentro de um `<Stat>`, onde o número ao lado já diz tudo.
   */
  rotulo?: string;
  className?: string;
}

/**
 * A linha miúda do cartão de KPI: sem eixo, sem grade e sem rótulo.
 *
 * Tem tamanho fixo em pixels de propósito. É o caso em que o `viewBox` fixo
 * está certo, porque a caixa também é fixa: uma unidade do desenho é um pixel
 * da tela, o mesmo fator 1,0 que o `<ChartFrame>` persegue medindo.
 *
 * Série vazia não vira linha de base cheia — isso leria como "tudo zero", que
 * é outra afirmação. Vira um tracejado, e diz que não há histórico.
 */
export function Sparkline({
  serie,
  largura = 64,
  altura = 20,
  tom = 'accent',
  rotulo,
  className,
}: SparklineProps) {
  const cores = TOM[tom];
  const acessivel = rotulo !== undefined;
  const comum = {
    width: largura,
    height: altura,
    viewBox: `0 0 ${largura} ${altura}`,
    role: acessivel ? ('img' as const) : undefined,
    'aria-label': rotulo,
    'aria-hidden': acessivel ? undefined : true,
    className: cn('block shrink-0 overflow-visible', className),
  };

  if (serie.length === 0) {
    return (
      <svg {...comum}>
        <line
          x1={MARGEM}
          x2={largura - MARGEM}
          y1={altura / 2}
          y2={altura / 2}
          strokeWidth={1}
          strokeDasharray="2 3"
          className="stroke-line-strong"
        />
      </svg>
    );
  }

  const menor = Math.min(...serie);
  const maior = Math.max(...serie);
  const amplitude = maior - menor;
  const util = altura - MARGEM * 2;
  // Série constante não tem topo nem fundo: a linha vai pelo meio, sem exagerar
  // uma variação que não existe.
  const y = (valor: number) =>
    amplitude === 0 ? altura / 2 : altura - MARGEM - ((valor - menor) / amplitude) * util;
  const passo = serie.length > 1 ? (largura - MARGEM * 2) / (serie.length - 1) : 0;
  const x = (indice: number) => MARGEM + passo * indice;

  const ultimo = serie.length - 1;

  return (
    <svg {...comum}>
      {serie.length > 1 && (
        <path
          d={serie.map((v, i) => `${i === 0 ? 'M' : 'L'}${arred(x(i))} ${arred(y(v))}`).join(' ')}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cores.traco}
        />
      )}
      {/* O ponto final marca onde a série está agora — é o que se lê primeiro. */}
      <circle
        cx={arred(x(ultimo))}
        cy={arred(y(serie[ultimo] ?? 0))}
        r={1.75}
        className={cores.ponto}
      />
    </svg>
  );
}

/** Duas casas bastam em 64px e encurtam o `d` em uma ordem de grandeza. */
function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
