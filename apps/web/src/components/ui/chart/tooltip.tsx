'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

import type { AreaDoGrafico } from './frame';

export type TomDoValor = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

/* Marcador de cor da dica. A cor nunca vem sozinha: o rótulo está ao lado. */
const MARCADOR: Record<TomDoValor, string> = {
  neutral: 'bg-content-subtle',
  accent: 'bg-content-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export interface ValorDaColuna {
  rotulo: string;
  /** Já formatado por quem chamou — a dica não sabe se é moeda, contagem ou hora. */
  valor: string;
  tom?: TomDoValor;
}

export interface ColunaDoGrafico {
  /** Chave estável: a data, o início da semana, o id do registro. */
  chave: string;
  rotulo: string;
  valores?: readonly ValorDaColuna[];
}

export interface ChartTooltipProps {
  /** A geometria que o `<ChartFrame>` entrega ao `sobreposicao`. */
  area: AreaDoGrafico;
  /** Uma entrada por coluna, na mesma ordem das marcas desenhadas. */
  colunas: readonly ColunaDoGrafico[];
  /** Linha vertical sob o cursor. Desligue quando a barra já é larga o bastante. */
  crosshair?: boolean;
  /** Avisa qual coluna está sob o cursor ou com foco, para quem desenha destacá-la. */
  aoFocar?: (indice: number | null) => void;
  className?: string;
}

/**
 * A dica de valor do gráfico: captura por coluna, crosshair e teclado.
 *
 * A captura é um `<rect>` transparente por coluna, com a altura inteira da
 * área — o alvo é a faixa, não a barra, senão acertar um dia de venda baixa
 * exigiria mira. Os mesmos retângulos são os pontos de parada do teclado, em
 * `tabindex` rotativo: um só ponto de entrada na figura, e as setas andam
 * pelas colunas. Sem isso um gráfico de 90 dias custaria 90 Tabs.
 *
 * A bolha é `aria-hidden` de propósito: o texto completo já está no
 * `aria-label` do retângulo focado, e duplicá-lo faria o leitor ler duas vezes.
 *
 * Limite conhecido: numa série de 90 colunas cada faixa fica com ~7px de
 * largura, abaixo dos 24px de alvo de toque. Alargar a faixa mentiria sobre
 * qual coluna está sendo lida; o caminho equivalente é o teclado (as setas
 * andam coluna a coluna) e a tabela que o `<ChartFrame>` exige.
 */
export function ChartTooltip({
  area,
  colunas,
  crosshair = true,
  aoFocar,
  className,
}: ChartTooltipProps) {
  const [ativa, setAtiva] = useState<number | null>(null);
  /*
   * `ancora` é separado de `ativa`: fechar a dica não pode devolver o
   * `tabindex` ao início, senão voltar com Shift+Tab recomeçaria da primeira
   * coluna em vez da que a pessoa estava lendo.
   */
  const [ancora, setAncora] = useState(0);
  const retangulos = useRef<(SVGRectElement | null)[]>([]);

  const mostrar = useCallback(
    (indice: number | null) => {
      setAtiva(indice);
      aoFocar?.(indice);
    },
    [aoFocar],
  );

  const irPara = useCallback(
    (indice: number) => {
      const destino = Math.min(Math.max(indice, 0), colunas.length - 1);
      setAncora(destino);
      // O foco dispara o `onFocus` do retângulo, que já mostra a dica.
      retangulos.current[destino]?.focus();
    },
    [colunas.length],
  );

  const aoTeclar = useCallback(
    (evento: KeyboardEvent<SVGSVGElement>) => {
      const atual = ativa ?? ancora;
      switch (evento.key) {
        case 'ArrowRight':
          irPara(atual + 1);
          break;
        case 'ArrowLeft':
          irPara(atual - 1);
          break;
        case 'Home':
          irPara(0);
          break;
        case 'End':
          irPara(colunas.length - 1);
          break;
        case 'Escape':
          // Fecha sem tirar o foco: a próxima seta reabre de onde parou.
          mostrar(null);
          break;
        default:
          return;
      }
      evento.preventDefault();
    },
    [ativa, ancora, colunas.length, irPara, mostrar],
  );

  const colunaAtiva = ativa === null ? undefined : colunas[ativa];
  const centroAtivo = ativa === null ? 0 : area.centroDaColuna(ativa);

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      <svg
        width="100%"
        height={area.alturaTotal}
        viewBox={`0 0 ${area.larguraTotal} ${area.alturaTotal}`}
        preserveAspectRatio="none"
        className="pointer-events-auto absolute inset-0"
        onPointerLeave={() => mostrar(null)}
        onKeyDown={aoTeclar}
      >
        {colunaAtiva !== undefined && (
          <>
            {/* A faixa diz qual coluna está sendo lida mesmo sem o crosshair. */}
            <rect
              x={area.esquerda + area.larguraDaColuna * (ativa ?? 0)}
              y={area.topo}
              width={area.larguraDaColuna}
              height={area.altura}
              className="fill-surface-accent-soft"
            />
            {crosshair && (
              <line
                x1={centroAtivo}
                x2={centroAtivo}
                y1={area.topo}
                y2={area.base}
                strokeWidth={1}
                strokeDasharray="3 3"
                shapeRendering="crispEdges"
                className="stroke-content-accent"
              />
            )}
          </>
        )}

        {colunas.map((coluna, i) => (
          <rect
            key={coluna.chave}
            ref={(elemento) => {
              retangulos.current[i] = elemento;
            }}
            x={area.esquerda + area.larguraDaColuna * i}
            y={area.topo}
            width={area.larguraDaColuna}
            height={area.altura}
            // `transparent` (e não `none`) é o que faz o retângulo receber o ponteiro.
            fill="transparent"
            role="img"
            aria-label={textoDaColuna(coluna)}
            tabIndex={i === ancora ? 0 : -1}
            /*
             * O anel de foco desenhado como traço, não como `outline`: o
             * suporte a `outline` em elemento SVG ainda varia, e um gráfico
             * sem foco visível é um gráfico inacessível.
             */
            className="cursor-default outline-none [stroke-width:2] focus-visible:stroke-ring"
            onPointerEnter={() => mostrar(i)}
            onFocus={() => {
              setAncora(i);
              mostrar(i);
            }}
            onBlur={() => mostrar(null)}
          />
        ))}
      </svg>

      {colunaAtiva !== undefined && (
        <div
          className={cn('absolute', ancoragem(centroAtivo, area))}
          style={{ left: centroAtivo, top: area.topo + 6 }}
          aria-hidden
        >
          <div className="animate-pop min-w-36 max-w-64 rounded-panel border border-line-subtle bg-surface-elevated px-3 py-2 shadow-overlay">
            <p className="text-label text-content">{colunaAtiva.rotulo}</p>
            {(colunaAtiva.valores?.length ?? 0) > 0 && (
              <dl className="mt-1.5 flex flex-col gap-1">
                {colunaAtiva.valores?.map((valor) => (
                  <div key={valor.rotulo} className="flex items-center gap-2">
                    {valor.tom !== undefined && (
                      <span className={cn('size-2 shrink-0 rounded-pill', MARCADOR[valor.tom])} />
                    )}
                    <dt className="text-caption text-content-muted">{valor.rotulo}</dt>
                    <dd className="ml-auto text-num text-content">{valor.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tudo o que a coluna diz, numa frase — é o nome acessível do retângulo. */
function textoDaColuna(coluna: ColunaDoGrafico): string {
  const partes = (coluna.valores ?? []).map((v) => `${v.rotulo}: ${v.valor}`);
  return partes.length > 0 ? `${coluna.rotulo}. ${partes.join('. ')}.` : coluna.rotulo;
}

/**
 * De que lado a bolha cresce.
 *
 * Centrada no meio do desenho, ancorada na borda nas pontas — medir a bolha
 * para grampeá-la com precisão custaria um segundo layout por quadro, e o
 * erro que isso corrigiria é a dica vazar da figura, que o terço já resolve.
 */
function ancoragem(x: number, area: AreaDoGrafico): string {
  const fracao = area.largura > 0 ? (x - area.esquerda) / area.largura : 0.5;
  if (fracao < 0.2) return 'translate-x-0';
  if (fracao > 0.8) return '-translate-x-full';
  return '-translate-x-1/2';
}
