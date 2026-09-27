'use client';

import { formatCents } from '@tivexy/core';
import { ChevronRight } from 'lucide-react';
import { useId } from 'react';

import {
  type AreaDoGrafico,
  ChartFrame,
  ChartTooltip,
  type ColunaDoGrafico,
  type MarcaDoEixoX,
  type MarcaDoEixoY,
} from '@/components/ui/chart';
import { TBody, TD, TFoot, TH, THead, TR, Table } from '@/components/ui/table';
import type { SemanaDoFluxo } from '@/lib/erp/finance-text';
import { formatDayMonth } from '@/lib/format';
import { atrasoDaLinha, cn } from '@/lib/utils';

/*
 * O fluxo de caixa por semana, reescrito sobre `components/ui/chart/`.
 *
 * O que estava errado e este arquivo conserta (UI_AUDIT, achados
 * `cashflow-chart.tsx:31`, `:94` e `:158`):
 *
 * 1. Eram DOIS SVGs completos no DOM — um de 360 unidades com `sm:hidden` e um
 *    de 640 com `hidden sm:block` —, cada um com o próprio `<defs>` e o dobro
 *    das barras, metade sempre invisível e as duas animando. Agora é um só: a
 *    largura vem medida do contêiner, e quantos rótulos cabem é uma conta que o
 *    `ChartFrame` faz, não um breakpoint.
 * 2. O `viewBox` era fixo (`0 0 640 240`) com `h-auto w-full`, então o desenho
 *    inteiro escalava junto com a largura: a 1600px o rótulo de 11 unidades
 *    viraria texto de 27px e o gráfico teria 600px de altura. Ou seja, alargar
 *    a página — a correção nº 1 do redesenho — PIORAVA o gráfico. Medido, o
 *    fator é 1,0 sempre, a altura é fixa e todo texto é HTML sobreposto.
 * 3. A "dica" era o `<title>` nativo do navegador: um segundo de espera, sem
 *    estilo, só no mouse, e apenas sobre as barras que existiam — semana sem
 *    movimento não tinha alvo nenhum. Agora é o `ChartTooltip`, com faixa de
 *    captura da altura inteira por semana, teclado e foco visível.
 *
 * O que NÃO mudou, porque estava certo: entrada sobe e saída desce (a posição
 * diz o que é antes da cor), realizado cheio e previsto hachurado, a mesma
 * escala para os dois sentidos — senão o gráfico mentiria sobre o saldo — e a
 * tabela equivalente para quem não vê o desenho.
 */

const ALTURA = 260;

/** Teto da barra: sem ele, nove semanas num monitor largo viram quatro blocos. */
const LARGURA_MAXIMA_DA_BARRA = 44;

/** O eixo Y cabe em 62px de calha; "R$ 12.400,00" não. */
const COMPACTO = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function moedaCompacta(centavos: number): string {
  return COMPACTO.format(centavos / 100);
}

export function CashflowChart({ semanas }: { semanas: readonly SemanaDoFluxo[] }) {
  /* O maior lado manda nos dois: um real que sai ocupa o mesmo que um real que entra. */
  const maximo = Math.max(
    1,
    ...semanas.map((s) => s.recebido + s.aReceber),
    ...semanas.map((s) => s.pago + s.aPagar),
  );

  const eixoY: MarcaDoEixoY[] = [
    { fracao: 1, rotulo: `↑ ${moedaCompacta(maximo)}` },
    { fracao: 0.75 },
    { fracao: 0.5, rotulo: 'R$ 0' },
    { fracao: 0.25 },
    { fracao: 0, rotulo: `↓ ${moedaCompacta(maximo)}` },
  ];

  const eixoX: MarcaDoEixoX[] = semanas.map((s, i) => ({
    indice: i,
    rotulo: formatDayMonth(s.inicio),
    destaque: s.atual,
  }));

  const colunas: ColunaDoGrafico[] = semanas.map((s) => ({
    chave: s.inicio,
    rotulo: `Semana de ${formatDayMonth(s.inicio)}${s.atual ? ' · esta semana' : ''}`,
    valores: [
      { rotulo: 'Entrou', valor: formatCents(s.recebido), tom: 'success' },
      { rotulo: 'A receber', valor: formatCents(s.aReceber), tom: 'success' },
      { rotulo: 'Saiu', valor: formatCents(s.pago), tom: 'danger' },
      { rotulo: 'A pagar', valor: formatCents(s.aPagar), tom: 'danger' },
    ],
  }));

  return (
    <ChartFrame
      titulo="Fluxo de caixa por semana"
      descricao="Entradas acima do eixo, saídas abaixo, na mesma escala; o realizado cheio, o previsto hachurado. Os mesmos valores estão na tabela logo abaixo."
      colunas={semanas.length}
      altura={ALTURA}
      calhas={{ esquerda: 62, direita: 8, topo: 10, base: 22 }}
      eixoY={eixoY}
      eixoX={eixoX}
      /* A linha forte é o zero, no meio — não a base da área, que aqui é o pior dia de saída. */
      linhaDeBase={false}
      legenda={<Legenda />}
      tabela={<CashflowTable semanas={semanas} />}
      sobreposicao={(area) => (
        /* Barras largas: a faixa realçada já diz qual semana está sendo lida. */
        <ChartTooltip area={area} colunas={colunas} crosshair={false} />
      )}
    >
      {(area) => <Marcas area={area} semanas={semanas} maximo={maximo} />}
    </ChartFrame>
  );
}

/** As barras, a faixa da semana corrente e a linha do zero. */
function Marcas({
  area,
  semanas,
  maximo,
}: {
  area: AreaDoGrafico;
  semanas: readonly SemanaDoFluxo[];
  maximo: number;
}) {
  /*
   * `useId` porque dois gráficos na mesma página colidiriam no id do padrão de
   * hachura, e `url(#…)` pega o primeiro que encontrar no documento.
   */
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const entrada = `${id}-entrada`;
  const saida = `${id}-saida`;

  const zero = area.yDaFracao(0.5);
  const escala = area.altura / 2 / maximo;
  const largura = Math.min(area.larguraDaColuna * 0.56, LARGURA_MAXIMA_DA_BARRA);

  return (
    <>
      <defs>
        <pattern
          id={entrada}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" className="fill-success-soft" />
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-success" />
        </pattern>
        <pattern
          id={saida}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" className="fill-danger-soft" />
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-danger" />
        </pattern>
      </defs>

      {/* A faixa de hoje vai antes de tudo: desenhada depois, cobriria as barras. */}
      {semanas.map((s, i) =>
        s.atual ? (
          <rect
            key={`hoje-${s.inicio}`}
            x={area.esquerda + area.larguraDaColuna * i}
            y={area.topo}
            width={area.larguraDaColuna}
            height={area.altura}
            className="fill-surface-sunken"
          />
        ) : null,
      )}

      {semanas.map((s, i) => {
        const x = area.esquerda + area.larguraDaColuna * i + (area.larguraDaColuna - largura) / 2;
        const hRecebido = s.recebido * escala;
        const hAReceber = s.aReceber * escala;
        const hPago = s.pago * escala;
        const hAPagar = s.aPagar * escala;
        const atraso = atrasoDaLinha(i);

        return (
          <g key={s.inicio}>
            {hRecebido > 0 && (
              <rect
                x={x}
                y={zero - hRecebido}
                width={largura}
                height={hRecebido}
                className="animate-grow origin-bottom fill-success"
                style={{ animationDelay: atraso }}
              />
            )}
            {hAReceber > 0 && (
              <rect
                x={x}
                y={zero - hRecebido - hAReceber}
                width={largura}
                height={hAReceber}
                fill={`url(#${entrada})`}
                strokeWidth={1}
                className="animate-grow origin-bottom stroke-success"
                style={{ animationDelay: atraso }}
              />
            )}
            {hPago > 0 && (
              <rect
                x={x}
                y={zero}
                width={largura}
                height={hPago}
                className="animate-grow origin-top fill-danger"
                style={{ animationDelay: atraso }}
              />
            )}
            {hAPagar > 0 && (
              <rect
                x={x}
                y={zero + hPago}
                width={largura}
                height={hAPagar}
                fill={`url(#${saida})`}
                strokeWidth={1}
                className="animate-grow origin-top stroke-danger"
                style={{ animationDelay: atraso }}
              />
            )}
          </g>
        );
      })}

      <line
        x1={area.esquerda}
        x2={area.direita}
        y1={zero}
        y2={zero}
        strokeWidth={1}
        shapeRendering="crispEdges"
        className="stroke-line-strong"
      />
    </>
  );
}

const LEGENDA = [
  { classe: 'bg-success', rotulo: '↑ Entrou' },
  {
    classe:
      'bg-success-soft border border-success [background-image:repeating-linear-gradient(45deg,var(--color-success)_0_2px,transparent_2px_5px)]',
    rotulo: '↑ A receber',
  },
  { classe: 'bg-danger', rotulo: '↓ Saiu' },
  {
    classe:
      'bg-danger-soft border border-danger [background-image:repeating-linear-gradient(45deg,var(--color-danger)_0_2px,transparent_2px_5px)]',
    rotulo: '↓ A pagar',
  },
] as const;

function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-content-muted">
      {LEGENDA.map((l) => (
        <li key={l.rotulo} className="flex items-center gap-1.5">
          {/* A seta no rótulo repete o que a posição já diz: a cor nunca carrega sozinha.
              O marcador é redondo, igual ao do `ChartTooltip` — mesma coisa, mesma forma. */}
          <span className={cn('inline-block size-3 rounded-pill', l.classe)} aria-hidden />
          {l.rotulo}
        </li>
      ))}
    </ul>
  );
}

/** Os mesmos números do gráfico, em tabela — para quem não vê o gráfico. */
export function CashflowTable({ semanas }: { semanas: readonly SemanaDoFluxo[] }) {
  const total = semanas.reduce(
    (soma, s) => ({
      recebido: soma.recebido + s.recebido,
      aReceber: soma.aReceber + s.aReceber,
      pago: soma.pago + s.pago,
      aPagar: soma.aPagar + s.aPagar,
    }),
    { recebido: 0, aReceber: 0, pago: 0, aPagar: 0 },
  );

  /* Cabeçalho de linha: a data é rótulo, não dado — mas não é versalete de coluna. */
  const cabecalhoDeLinha = 'bg-transparent text-body normal-case text-content-default';

  return (
    <details className="group">
      <summary className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 rounded-control text-caption text-content-accent hover:underline">
        <ChevronRight
          className="size-3.5 shrink-0 transition-transform transition-base group-open:rotate-90"
          aria-hidden
        />
        Ver os números de cada semana
      </summary>

      <div className="mt-3">
        <Table
          densidade="densa"
          /*
           * `rolar`, não `blocos`: são cinco colunas de número que só fazem
           * sentido comparadas lado a lado. Em bloco, cada semana viraria um
           * cartão e a comparação — que é o motivo da tabela — desapareceria.
           */
          mobile="rolar"
          rotulo="Fluxo de caixa por semana"
          className="min-w-[32rem]"
        >
          <THead>
            <TR>
              <TH>Semana de</TH>
              <TH alinhamento="fim">Entrou</TH>
              <TH alinhamento="fim">A receber</TH>
              <TH alinhamento="fim">Saiu</TH>
              <TH alinhamento="fim">A pagar</TH>
            </TR>
          </THead>
          <TBody>
            {semanas.map((s) => (
              <TR key={s.inicio}>
                <TH escopo="row" className={cabecalhoDeLinha}>
                  {formatDayMonth(s.inicio)}
                  {s.atual && <span className="text-content-accent"> · esta semana</span>}
                </TH>
                <TD numerico>{formatCents(s.recebido)}</TD>
                <TD numerico>{formatCents(s.aReceber)}</TD>
                <TD numerico>{formatCents(s.pago)}</TD>
                <TD numerico>{formatCents(s.aPagar)}</TD>
              </TR>
            ))}
          </TBody>
          <TFoot>
            <TR>
              <TH escopo="row" className={cn(cabecalhoDeLinha, 'font-medium text-content')}>
                Total das {semanas.length} semanas
              </TH>
              <TD numerico>{formatCents(total.recebido)}</TD>
              <TD numerico>{formatCents(total.aReceber)}</TD>
              <TD numerico>{formatCents(total.pago)}</TD>
              <TD numerico>{formatCents(total.aPagar)}</TD>
            </TR>
          </TFoot>
        </Table>
      </div>
    </details>
  );
}
