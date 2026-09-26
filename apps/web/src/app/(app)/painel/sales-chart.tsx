import { formatCents } from '@tivexy/core';

import { formatDate } from '@/lib/format';
import { type DiaDeVenda, alturasDasBarras } from '@/lib/painel/dashboard';
import { cn } from '@/lib/utils';

const ALTURA = 200;
const TOPO = 24;
const BASE = 28;
const LADO = 4;

/**
 * As vendas de cada dia, em SVG próprio: uma barra por dia, hoje destacado.
 *
 * Dia sem venda é uma marca rente ao eixo — zero é dado, e sumir com ele
 * faria a semana parecer mais curta. Cada barra tem título com o valor, e a
 * tabela abaixo diz tudo em números para quem não vê o gráfico. A cor não
 * carrega nada sozinha: hoje também tem rótulo.
 */
export function SalesChart({ dias, hoje }: { dias: readonly DiaDeVenda[]; hoje: string }) {
  return (
    <figure className="flex flex-col gap-2">
      {/* Duas larguras: o SVG escala o texto com a figura, e 640 unidades num celular dariam rótulos minúsculos. */}
      <Grafico
        dias={dias}
        hoje={hoje}
        id="vendas-estreito"
        largura={360}
        rotuloACada={2}
        className="sm:hidden"
      />
      <Grafico
        dias={dias}
        hoje={hoje}
        id="vendas-largo"
        largura={640}
        rotuloACada={1}
        className="hidden sm:block"
      />
    </figure>
  );
}

function Grafico({
  dias,
  hoje,
  id,
  largura,
  rotuloACada,
  className,
}: {
  dias: readonly DiaDeVenda[];
  hoje: string;
  id: string;
  largura: number;
  rotuloACada: number;
  className?: string;
}) {
  const n = Math.max(dias.length, 1);
  const altura = ALTURA - TOPO - BASE;
  const eixo = TOPO + altura;
  const grupo = (largura - LADO * 2) / n;
  const barra = Math.min(grupo * 0.62, 30);
  const alturas = alturasDasBarras(
    dias.map((d) => d.totalCentavos),
    altura,
  );
  const maior = Math.max(0, ...dias.map((d) => d.totalCentavos));
  const total = dias.reduce((t, d) => t + d.totalCentavos, 0);

  return (
    <svg
      viewBox={`0 0 ${largura} ${ALTURA}`}
      role="img"
      aria-labelledby={`${id}-titulo ${id}-desc`}
      className={cn('h-auto w-full overflow-visible', className)}
    >
      <title id={`${id}-titulo`}>Vendas por dia</title>
      <desc id={`${id}-desc`}>
        {`${dias.length} dias, ${formatCents(total)} no total; o maior dia somou ${formatCents(maior)}. Os valores de cada dia estão na tabela abaixo.`}
      </desc>
      {dias.map((d, i) => {
        const x = LADO + i * grupo;
        const meio = x + grupo / 2;
        const h = alturas[i] ?? 0;
        const ehHoje = d.dia === hoje;
        return (
          <g key={d.dia}>
            <title>
              {`${formatDate(d.dia)}: ${formatCents(d.totalCentavos)} em ${d.vendas} ${d.vendas === 1 ? 'registro' : 'registros'}`}
            </title>
            {ehHoje && (
              <text
                x={meio}
                y={Math.max(12, eixo - h - 8)}
                textAnchor="middle"
                className="fill-content-accent text-[11px] font-medium"
              >
                hoje
              </text>
            )}
            {h > 0 ? (
              <rect
                x={meio - barra / 2}
                y={eixo - h}
                width={barra}
                height={h}
                rx={3}
                className="animate-grow origin-bottom fill-content-accent"
                fillOpacity={ehHoje ? 1 : 0.45}
                style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}
              />
            ) : (
              <rect
                x={meio - barra / 2}
                y={eixo - 2}
                width={barra}
                height={2}
                rx={1}
                className="fill-line-strong"
              />
            )}
            {(i % rotuloACada === (n - 1) % rotuloACada || ehHoje) && (
              <text
                x={meio}
                y={ALTURA - 9}
                textAnchor="middle"
                className={cn(
                  'text-[11px]',
                  ehHoje ? 'fill-content-accent font-medium' : 'fill-content-muted',
                )}
              >
                {d.dia.slice(8, 10)}
              </text>
            )}
          </g>
        );
      })}
      <line
        x1={LADO}
        x2={largura - LADO}
        y1={eixo}
        y2={eixo}
        strokeWidth={1}
        className="stroke-line-strong"
      />
    </svg>
  );
}

/** Os mesmos números, em tabela — para quem não vê o gráfico. */
export function SalesTable({ dias }: { dias: readonly DiaDeVenda[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-content-accent hover:underline">
        Ver os números de cada dia
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Vendas por dia</caption>
          <thead className="text-xs text-content-muted">
            <tr>
              <th scope="col" className="py-1.5 font-medium">
                Dia
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Registros
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {[...dias].reverse().map((d) => (
              <tr key={d.dia}>
                <th scope="row" className="py-1.5 font-normal text-content-default">
                  {formatDate(d.dia)}
                </th>
                <td className="py-1.5 text-right text-content-muted">{d.vendas}</td>
                <td className="py-1.5 text-right text-content">{formatCents(d.totalCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
