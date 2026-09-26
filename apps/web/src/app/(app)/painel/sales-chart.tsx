'use client';

import { formatCents } from '@tivexy/core';
import { type ReactNode, useState } from 'react';

import {
  ChartFrame,
  ChartTooltip,
  type ColunaDoGrafico,
  type MarcaDoEixoX,
  type MarcaDoEixoY,
} from '@/components/ui/chart';
import { formatDate } from '@/lib/format';
import { type DiaDeVenda, alturasDasBarras, reaisCompactos } from '@/lib/painel/dashboard';
import { atrasoDaLinha, cn } from '@/lib/utils';

/**
 * Altura fixa, largura medida.
 *
 * O desenho antigo era `viewBox="0 0 640 200"` com `h-auto w-full`, ou seja,
 * escala uniforme: alargar a página esticava o gráfico **e** a tipografia
 * junto. Num `<main>` de 1664px o rótulo do dia renderizaria a ~28px, maior
 * que o título do cartão — alargar a tela piorava o painel. O `<ChartFrame>`
 * mede o contêiner e desenha em pixels reais, então aqui só resta escolher a
 * altura.
 */
const ALTURA = 280;

/** Quatro linhas de grade em quartos do maior valor: ~70px entre elas nesta altura. */
const FRACOES_DA_GRADE = [0.25, 0.5, 0.75, 1] as const;

export interface SalesChartProps {
  dias: readonly DiaDeVenda[];
  /** A janela anterior, dia a dia. `null` quando ela não pôde ser lida — e aí não há linha. */
  diasAnteriores: readonly DiaDeVenda[] | null;
  /** O dia de hoje no fuso da empresa, para o destaque. */
  hoje: string | null;
  /** "30 dias" — entra na legenda e nas dicas. */
  rotuloDoPeriodo: string;
  /** Barras crescendo do eixo, só na primeira pintura da rota (seção 8). */
  animar: boolean;
  /** A tabela equivalente, renderizada no servidor e entregue pronta. */
  tabela: ReactNode;
}

/**
 * As vendas de cada dia, com a janela anterior por cima em linha pontilhada.
 *
 * Quatro coisas que o desenho anterior não tinha e que esta tela precisava:
 * eixo de valor, grade, dica de valor de verdade (a antiga era o `<title>`
 * nativo do SVG, que depende do atraso de um segundo do sistema, não existe no
 * toque e não é alcançável por teclado) e a série de comparação — que já era
 * calculada e morria numa frase.
 *
 * O que foi preservado da versão antiga, porque era o melhor dela: dia sem
 * venda é uma marca rente ao eixo, nunca um buraco; a cor não carrega nada
 * sozinha (hoje tem a palavra "hoje" no eixo); e a mesma informação sai em
 * tabela para quem não vê o gráfico.
 */
export function SalesChart({
  dias,
  diasAnteriores,
  hoje,
  rotuloDoPeriodo,
  animar,
  tabela,
}: SalesChartProps) {
  /* Qual coluna o ponteiro ou o teclado está lendo — é o que acende a barra. */
  const [ativa, setAtiva] = useState<number | null>(null);

  const totais = dias.map((d) => d.totalCentavos);
  /*
   * A janela anterior é alinhada por índice, não por data: o dia 1 de uma
   * janela se compara com o dia 1 da outra. O corte protege contra uma série
   * anterior mais longa, que desenharia pontos fora da área medida.
   */
  const anteriores =
    diasAnteriores === null
      ? null
      : diasAnteriores.slice(0, dias.length).map((d) => d.totalCentavos);

  const total = totais.reduce((t, v) => t + v, 0);
  const totalAnterior = anteriores === null ? null : anteriores.reduce((t, v) => t + v, 0);
  const maior = Math.max(0, ...totais, ...(anteriores ?? []));

  const eixoY: MarcaDoEixoY[] =
    maior === 0
      ? []
      : FRACOES_DA_GRADE.map((f) => ({ fracao: f, rotulo: reaisCompactos(Math.round(maior * f)) }));

  const eixoX: MarcaDoEixoX[] = dias.map((d, i) =>
    d.dia === hoje
      ? { indice: i, rotulo: 'hoje', destaque: true }
      : { indice: i, rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` },
  );

  const colunas: ColunaDoGrafico[] = dias.map((d, i) => {
    const anterior = anteriores?.[i];
    return {
      chave: d.dia,
      rotulo: d.dia === hoje ? `Hoje, ${formatDate(d.dia)}` : formatDate(d.dia),
      valores: [
        { rotulo: 'Vendido', valor: formatCents(d.totalCentavos), tom: 'accent' as const },
        { rotulo: 'Registros', valor: d.vendas.toLocaleString('pt-BR') },
        ...(anterior === undefined
          ? []
          : [
              {
                rotulo: `${rotuloDoPeriodo} antes`,
                valor: formatCents(anterior),
                tom: 'neutral' as const,
              },
            ]),
      ],
    };
  });

  const descricao = [
    `${dias.length} dias, ${formatCents(total)} no total; o maior dia somou ${formatCents(maior)}.`,
    totalAnterior === null
      ? 'A janela anterior não pôde ser lida, então não há comparação.'
      : `Os ${rotuloDoPeriodo} anteriores somaram ${formatCents(totalAnterior)}.`,
    'Os valores de cada dia estão na tabela abaixo.',
  ].join(' ');

  return (
    <ChartFrame
      titulo={`Vendas por dia — ${rotuloDoPeriodo}`}
      descricao={descricao}
      colunas={dias.length}
      altura={ALTURA}
      eixoY={eixoY}
      eixoX={eixoX}
      legenda={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-content-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-2.5 shrink-0 rounded-xs bg-content-accent" aria-hidden />
            Período atual · {formatCents(total)}
          </span>
          {totalAnterior !== null && (
            <span className="inline-flex items-center gap-1.5">
              {/* A legenda repete o tracejado da série, não só a cor dela. */}
              <svg width="18" height="8" aria-hidden className="shrink-0">
                <line
                  x1="0"
                  y1="4"
                  x2="18"
                  y2="4"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  className="stroke-content-muted"
                />
              </svg>
              {rotuloDoPeriodo} anteriores · {formatCents(totalAnterior)}
            </span>
          )}
        </div>
      }
      tabela={tabela}
      sobreposicao={(area) => <ChartTooltip area={area} colunas={colunas} aoFocar={setAtiva} />}
    >
      {(area) => {
        /*
         * As duas séries são normalizadas juntas: escalas separadas fariam a
         * linha de comparação parecer sempre do tamanho das barras, que é o
         * oposto do que ela existe para mostrar. O piso de 2px de
         * `alturasDasBarras` vale para as duas.
         */
        const todas = alturasDasBarras([...totais, ...(anteriores ?? [])], area.altura);
        const alturas = todas.slice(0, totais.length);
        const alturasAnteriores = anteriores === null ? null : todas.slice(totais.length);
        const largura = Math.min(area.larguraDaColuna * 0.62, 30);

        return (
          <>
            {dias.map((d, i) => {
              const centro = area.centroDaColuna(i);
              const h = alturas[i] ?? 0;
              const ehHoje = d.dia === hoje;

              /* Dia sem venda é uma marca rente ao eixo: zero é dado, e sumir com ele encurtaria a semana. */
              if (h <= 0) {
                return (
                  <rect
                    key={d.dia}
                    x={centro - largura / 2}
                    y={area.base - 2}
                    width={largura}
                    height={2}
                    rx={1}
                    className="fill-line-strong"
                  />
                );
              }

              return (
                <rect
                  key={d.dia}
                  x={centro - largura / 2}
                  y={area.base - h}
                  width={largura}
                  height={h}
                  rx={3}
                  className={cn('fill-content-accent', animar && 'animate-grow origin-bottom')}
                  fillOpacity={ativa === i ? 1 : ehHoje ? 0.9 : 0.45}
                  style={animar ? { animationDelay: atrasoDaLinha(i) } : undefined}
                />
              );
            })}

            {alturasAnteriores !== null && alturasAnteriores.length > 1 && (
              <polyline
                points={alturasAnteriores
                  .map((h, i) => `${area.centroDaColuna(i)},${area.base - h}`)
                  .join(' ')}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-content-muted"
              />
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
