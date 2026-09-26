'use client';

import { useId, useMemo, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { useLarguraMedida } from './use-largura-medida';

/** Calhas em pixels entre a borda do SVG e a área onde as marcas são desenhadas. */
export interface CalhasDoGrafico {
  topo: number;
  direita: number;
  base: number;
  esquerda: number;
}

/**
 * A geometria do desenho, já em pixels de tela. Quem desenha as marcas recebe
 * isto pronto e nunca precisa converter nem supor a largura.
 */
export interface AreaDoGrafico {
  /** Dimensões do SVG inteiro. */
  larguraTotal: number;
  alturaTotal: number;
  /** Cantos da área de plotagem, já descontadas as calhas. */
  esquerda: number;
  topo: number;
  direita: number;
  base: number;
  /** Dimensões da área de plotagem. */
  largura: number;
  altura: number;
  /** Quantas colunas a série tem, e quanto mede cada uma. */
  colunas: number;
  larguraDaColuna: number;
  /** Centro horizontal da coluna `indice`. */
  centroDaColuna: (indice: number) => number;
  /** x de uma fração 0..1 medida da esquerda da área. */
  xDaFracao: (fracao: number) => number;
  /** y de uma fração 0..1 medida **da base** — 0 é o eixo, 1 é o topo. */
  yDaFracao: (fracao: number) => number;
}

/** Linha de grade horizontal. Sem `rotulo`, desenha a grade e não escreve nada. */
export interface MarcaDoEixoY {
  /** 0 na base, 1 no topo da área. */
  fracao: number;
  rotulo?: string;
}

/** Rótulo de uma coluna no eixo horizontal. */
export interface MarcaDoEixoX {
  indice: number;
  rotulo: string;
  /** "hoje", "esta semana": nunca é descartado por falta de espaço. */
  destaque?: boolean;
}

export interface ChartFrameProps {
  /** Vira o `<title>` do SVG. É o nome acessível do gráfico. */
  titulo: string;
  /** Vira o `<desc>`: o que o gráfico diz, em palavras, para quem não o vê. */
  descricao: string;
  /** Quantas colunas a série tem. **Zero desenha o estado vazio** — nunca dado de exemplo. */
  colunas: number;
  /** Altura do desenho em pixels. A largura vem do contêiner, medida. */
  altura?: number;
  calhas?: Partial<CalhasDoGrafico>;
  eixoY?: readonly MarcaDoEixoY[];
  eixoX?: readonly MarcaDoEixoX[];
  /** Espaço mínimo entre dois rótulos do eixo X. Abaixo dele, o rótulo é descartado. */
  espacoMinimoX?: number;
  /** Linhas de grade nas frações de `eixoY`. */
  grade?: boolean;
  /** A linha do eixo, na base da área. */
  linhaDeBase?: boolean;
  /** O que a tela diz quando `colunas` é zero. */
  vazio?: ReactNode;
  /** Legenda, dentro do `<figcaption>`. */
  legenda?: ReactNode;
  /** A tabela equivalente. Requisito de acessibilidade, não enfeite (risco R8). */
  tabela?: ReactNode;
  /** As marcas, em SVG, na geometria medida. */
  children: (area: AreaDoGrafico) => ReactNode;
  /** Camada HTML sobre a área — é onde entra o `<ChartTooltip>`. */
  sobreposicao?: (area: AreaDoGrafico) => ReactNode;
  className?: string;
}

/**
 * A moldura de todo gráfico do produto: área medida, grade discreta e eixos.
 *
 * Duas decisões carregam o componente. A primeira é medir o contêiner: sem
 * isso o `viewBox` fixo escala o desenho junto com a página e alargar a tela
 * *piora* o gráfico. A segunda é que **eixo e rótulo são HTML sobreposto**,
 * não `<text>` — texto em HTML não é escalado pelo `viewBox`, respeita o
 * tamanho de fonte do usuário, quebra e é selecionável.
 *
 * Série vazia desenha estado vazio. Nenhum gráfico aqui inventa número para
 * ter o que mostrar (CLAUDE.md).
 */
export function ChartFrame({
  titulo,
  descricao,
  colunas,
  altura: alturaTotal = 220,
  calhas,
  eixoY,
  eixoX,
  espacoMinimoX = 44,
  grade = true,
  linhaDeBase = true,
  vazio,
  legenda,
  tabela,
  children,
  sobreposicao,
  className,
}: ChartFrameProps) {
  const id = useId();
  const { ref, largura: larguraTotal } = useLarguraMedida<HTMLDivElement>();

  const temRotuloY = eixoY?.some((m) => m.rotulo !== undefined) ?? false;
  const temRotuloX = (eixoX?.length ?? 0) > 0;
  // A calha só abre onde há o que escrever: um gráfico sem eixo não perde 52px.
  const calhaTopo = calhas?.topo ?? 8;
  const calhaDireita = calhas?.direita ?? 8;
  const calhaBase = calhas?.base ?? (temRotuloX ? 22 : 8);
  const calhaEsquerda = calhas?.esquerda ?? (temRotuloY ? 52 : 8);

  const area = useMemo<AreaDoGrafico>(() => {
    const largura = Math.max(0, larguraTotal - calhaEsquerda - calhaDireita);
    const alturaArea = Math.max(0, alturaTotal - calhaTopo - calhaBase);
    const base = calhaTopo + alturaArea;
    // `Math.max(colunas, 1)` só protege a divisão: com zero coluna o desenho
    // nem chega a ser renderizado.
    const larguraDaColuna = largura / Math.max(colunas, 1);
    return {
      larguraTotal,
      alturaTotal,
      esquerda: calhaEsquerda,
      topo: calhaTopo,
      direita: calhaEsquerda + largura,
      base,
      largura,
      altura: alturaArea,
      colunas,
      larguraDaColuna,
      centroDaColuna: (indice) => calhaEsquerda + larguraDaColuna * (indice + 0.5),
      xDaFracao: (fracao) => calhaEsquerda + largura * fracao,
      yDaFracao: (fracao) => base - alturaArea * fracao,
    };
  }, [larguraTotal, alturaTotal, calhaTopo, calhaDireita, calhaBase, calhaEsquerda, colunas]);

  const rotulosX = useMemo(
    () => afinarRotulos(eixoX, area, espacoMinimoX),
    [eixoX, area, espacoMinimoX],
  );

  const semDados = colunas <= 0;

  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <div ref={ref} className="relative w-full" style={{ height: alturaTotal }}>
        {semDados ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line px-4 text-center">
            {vazio ?? <p className="text-caption text-content-subtle">Sem dados para desenhar.</p>}
          </div>
        ) : (
          <>
            <svg
              width="100%"
              height={alturaTotal}
              viewBox={`0 0 ${larguraTotal} ${alturaTotal}`}
              /*
               * Medido, o `viewBox` bate exatamente com a caixa e isto não faz
               * nada. Antes da primeira medida ele estica na horizontal em vez
               * de deixar tarja — um quadro de distorção, nenhum de layout.
               */
              preserveAspectRatio="none"
              role="img"
              aria-labelledby={`${id}-titulo ${id}-desc`}
              className="block overflow-visible"
            >
              <title id={`${id}-titulo`}>{titulo}</title>
              <desc id={`${id}-desc`}>{descricao}</desc>

              {grade &&
                eixoY?.map((marca) => (
                  <line
                    key={`grade-${marca.fracao}`}
                    x1={area.esquerda}
                    x2={area.direita}
                    y1={area.yDaFracao(marca.fracao)}
                    y2={area.yDaFracao(marca.fracao)}
                    strokeWidth={1}
                    // Fio de um pixel em coordenada fracionária borra; `crispEdges` o encaixa.
                    shapeRendering="crispEdges"
                    className="stroke-line-subtle"
                  />
                ))}

              {children(area)}

              {linhaDeBase && (
                <line
                  x1={area.esquerda}
                  x2={area.direita}
                  y1={area.base}
                  y2={area.base}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                  className="stroke-line-strong"
                />
              )}
            </svg>

            {/*
             * Rótulos em HTML. Ficam `aria-hidden` de propósito: soltos de
             * qualquer estrutura eles seriam lidos como uma fileira de números
             * sem contexto. A leitura acessível é o `<desc>` e a tabela.
             */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {eixoY?.map(
                (marca) =>
                  marca.rotulo !== undefined && (
                    <span
                      key={`rotulo-y-${marca.fracao}`}
                      className="absolute -translate-y-1/2 text-right text-micro tabular-nums text-content-subtle"
                      style={{
                        top: area.yDaFracao(marca.fracao),
                        left: 0,
                        width: Math.max(calhaEsquerda - 6, 0),
                      }}
                    >
                      {marca.rotulo}
                    </span>
                  ),
              )}
              {rotulosX.map(({ marca, x }) => (
                <span
                  key={`rotulo-x-${marca.indice}`}
                  className={cn(
                    'absolute -translate-x-1/2 whitespace-nowrap text-micro',
                    marca.destaque ? 'text-content-accent' : 'text-content-subtle',
                  )}
                  style={{ left: x, top: area.base + 6 }}
                >
                  {marca.rotulo}
                </span>
              ))}
            </div>

            {sobreposicao?.(area)}
          </>
        )}
      </div>

      {(legenda !== undefined || tabela !== undefined) && (
        <figcaption className="flex flex-col gap-2">
          {legenda}
          {tabela}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Descarta os rótulos do eixo X que não cabem.
 *
 * É o que dispensa o truque das duas larguras de SVG (`sm:hidden` +
 * `hidden sm:block`) que os dois gráficos mantinham só para o celular: com a
 * largura medida, quantos rótulos cabem é uma conta, não um breakpoint.
 */
function afinarRotulos(
  eixoX: readonly MarcaDoEixoX[] | undefined,
  area: AreaDoGrafico,
  espacoMinimo: number,
): { marca: MarcaDoEixoX; x: number }[] {
  if (!eixoX?.length) return [];
  const mantidos: { marca: MarcaDoEixoX; x: number }[] = [];
  let ultimoX = Number.NEGATIVE_INFINITY;

  for (const marca of eixoX) {
    const x = area.centroDaColuna(marca.indice);
    if (marca.destaque) {
      // O destaque entra sempre, e empurra para fora o vizinho comum que
      // colidiria com ele — é ele que ancora a leitura do eixo.
      const anterior = mantidos[mantidos.length - 1];
      if (anterior && !anterior.marca.destaque && x - anterior.x < espacoMinimo) mantidos.pop();
      mantidos.push({ marca, x });
      ultimoX = x;
      continue;
    }
    if (x - ultimoX < espacoMinimo) continue;
    mantidos.push({ marca, x });
    ultimoX = x;
  }

  return mantidos;
}
