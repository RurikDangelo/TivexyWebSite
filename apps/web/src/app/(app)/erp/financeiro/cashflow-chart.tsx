import { formatCents } from '@tivexy/core';

import { formatDayMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SemanaDoFluxo } from '@/lib/erp/finance-text';

const ALTURA = 240;
const TOPO = 22;
const BASE = 34;
const LADO = 6;

/**
 * O fluxo de caixa por semana, em SVG próprio.
 *
 * Entrada sobe, saída desce — a posição diz o que é antes da cor. O que já se
 * moveu é cheio; o que está previsto é hachurado, em cima do realizado. A
 * semana de hoje tem fundo e rótulo. Cada barra tem título com os valores, e
 * a tabela logo abaixo diz tudo em números para quem não vê o gráfico.
 *
 * A escala é a mesma para cima e para baixo: um real de saída ocupa o mesmo
 * espaço que um real de entrada, senão o gráfico mentiria sobre o saldo.
 */
export function CashflowChart({ semanas }: { semanas: readonly SemanaDoFluxo[] }) {
  return (
    <figure className="flex flex-col gap-3">
      {/*
       * Duas larguras de desenho: o SVG escala o texto junto com a figura, e
       * 640 unidades num celular de 375 px dariam rótulos de cinco pixels. No
       * estreito, o desenho é mais estreito e a data sai de duas em duas.
       */}
      <Grafico
        semanas={semanas}
        id="fluxo-estreito"
        largura={360}
        rotuloACada={2}
        comEixo={false}
        className="sm:hidden"
      />
      <Grafico
        semanas={semanas}
        id="fluxo-largo"
        largura={640}
        rotuloACada={1}
        comEixo
        className="hidden sm:block"
      />
      <figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-content-muted">
          <Legenda classe="bg-success" rotulo="↑ Entrou" />
          <Legenda
            classe="bg-success-soft border border-success [background-image:repeating-linear-gradient(45deg,var(--color-success)_0_2px,transparent_2px_5px)]"
            rotulo="↑ A receber"
          />
          <Legenda classe="bg-danger" rotulo="↓ Saiu" />
          <Legenda
            classe="bg-danger-soft border border-danger [background-image:repeating-linear-gradient(45deg,var(--color-danger)_0_2px,transparent_2px_5px)]"
            rotulo="↓ A pagar"
          />
        </ul>
      </figcaption>
    </figure>
  );
}

function Grafico({
  semanas,
  id,
  largura,
  rotuloACada,
  comEixo,
  className,
}: {
  semanas: readonly SemanaDoFluxo[];
  id: string;
  largura: number;
  rotuloACada: number;
  comEixo: boolean;
  className?: string;
}) {
  const n = Math.max(semanas.length, 1);
  const maximo = Math.max(
    1,
    ...semanas.map((s) => s.recebido + s.aReceber),
    ...semanas.map((s) => s.pago + s.aPagar),
  );
  const altura = ALTURA - TOPO - BASE;
  const eixo = TOPO + altura / 2;
  const escala = altura / 2 / maximo;
  const grupo = (largura - LADO * 2) / n;
  const barra = Math.min(grupo * 0.56, 44);

  return (
    <svg
      viewBox={`0 0 ${largura} ${ALTURA}`}
      role="img"
      aria-labelledby={`${id}-titulo ${id}-desc`}
      className={cn('h-auto w-full overflow-visible', className)}
    >
      <title id={`${id}-titulo`}>Fluxo de caixa por semana</title>
      <desc id={`${id}-desc`}>
        Entradas acima do eixo, saídas abaixo; o realizado cheio, o previsto hachurado. Os valores
        estão na tabela logo abaixo.
      </desc>
      <defs>
        <pattern
          id={`${id}-hachura-entrada`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" className="fill-success-soft" />
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-success" />
        </pattern>
        <pattern
          id={`${id}-hachura-saida`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" className="fill-danger-soft" />
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-danger" />
        </pattern>
      </defs>

      {semanas.map((s, i) => {
        const x = LADO + i * grupo;
        const meio = x + grupo / 2;
        const bx = meio - barra / 2;
        const hRecebido = s.recebido * escala;
        const hAReceber = s.aReceber * escala;
        const hPago = s.pago * escala;
        const hAPagar = s.aPagar * escala;
        const atraso = `${Math.min(i, 12) * 40}ms`;
        return (
          <g key={s.inicio}>
            {s.atual && (
              <>
                <rect
                  x={x + 1}
                  y={TOPO - 16}
                  width={grupo - 2}
                  height={altura + 16}
                  rx={6}
                  className="fill-surface-subtle"
                />
                <text
                  x={meio}
                  y={TOPO - 5}
                  textAnchor="middle"
                  className="fill-content-accent text-[11px] font-medium"
                >
                  {largura < 500 ? 'hoje' : 'esta semana'}
                </text>
              </>
            )}
            <title>
              {`Semana de ${formatDayMonth(s.inicio)}: entrou ${formatCents(s.recebido)}, a receber ${formatCents(s.aReceber)}; saiu ${formatCents(s.pago)}, a pagar ${formatCents(s.aPagar)}.`}
            </title>
            {hRecebido > 0 && (
              <rect
                x={bx}
                y={eixo - hRecebido}
                width={barra}
                height={hRecebido}
                className="animate-grow origin-bottom fill-success"
                style={{ animationDelay: atraso }}
              />
            )}
            {hAReceber > 0 && (
              <rect
                x={bx}
                y={eixo - hRecebido - hAReceber}
                width={barra}
                height={hAReceber}
                fill={`url(#${id}-hachura-entrada)`}
                className="animate-grow origin-bottom stroke-success"
                strokeWidth={1}
                style={{ animationDelay: atraso }}
              />
            )}
            {hPago > 0 && (
              <rect
                x={bx}
                y={eixo}
                width={barra}
                height={hPago}
                className="animate-grow origin-top fill-danger"
                style={{ animationDelay: atraso }}
              />
            )}
            {hAPagar > 0 && (
              <rect
                x={bx}
                y={eixo + hPago}
                width={barra}
                height={hAPagar}
                fill={`url(#${id}-hachura-saida)`}
                className="animate-grow origin-top stroke-danger"
                strokeWidth={1}
                style={{ animationDelay: atraso }}
              />
            )}
            {(i % rotuloACada === 0 || s.atual) && (
              <text
                x={meio}
                y={ALTURA - 12}
                textAnchor="middle"
                className="fill-content-muted text-[11px]"
              >
                {formatDayMonth(s.inicio)}
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
      {comEixo && (
        <>
          <text x={LADO} y={TOPO + 10} className="fill-content-subtle text-[11px]">
            ↑ entra
          </text>
          <text x={LADO} y={TOPO + altura - 2} className="fill-content-subtle text-[11px]">
            ↓ sai
          </text>
        </>
      )}
    </svg>
  );
}

function Legenda({ classe, rotulo }: { classe: string; rotulo: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded-sm ${classe}`} aria-hidden />
      {rotulo}
    </li>
  );
}

/** Os mesmos números do gráfico, em tabela — para quem não vê o gráfico. */
export function CashflowTable({ semanas }: { semanas: readonly SemanaDoFluxo[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-content-accent hover:underline">
        Ver os números de cada semana
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left tabular-nums">
          <caption className="sr-only">Fluxo de caixa por semana</caption>
          <thead className="text-xs text-content-muted">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Semana de
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Entrou
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                A receber
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Saiu
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                A pagar
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {semanas.map((s) => (
              <tr key={s.inicio} className="border-t border-line-subtle">
                <th scope="row" className="py-1.5 pr-3 font-sans font-normal text-content">
                  {formatDayMonth(s.inicio)}
                  {s.atual && <span className="text-content-accent"> · esta semana</span>}
                </th>
                <td className="py-1.5 pr-3 text-right">{formatCents(s.recebido)}</td>
                <td className="py-1.5 pr-3 text-right">{formatCents(s.aReceber)}</td>
                <td className="py-1.5 pr-3 text-right">{formatCents(s.pago)}</td>
                <td className="py-1.5 text-right">{formatCents(s.aPagar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
