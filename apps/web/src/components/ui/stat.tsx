import { formatCents } from '@tivexy/core';
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { CountUp } from '@/components/page/count-up';
import { Badge } from '@/components/ui/badge';
/*
 * Import direto do arquivo, não do barril `./chart`: o barril reexporta
 * `ChartFrame` e `ChartTooltip`, que são `'use client'`. Puxá-los daqui
 * registraria dois componentes de cliente em toda tela que mostra um KPI, sem
 * que nenhuma delas os renderize.
 */
import { Sparkline, type TomDaSparkline } from '@/components/ui/chart/sparkline';
import { cn } from '@/lib/utils';

/*
 * O cartão de indicador (P3 do DESIGN_SYSTEM).
 *
 * Apaga cinco implementações que não conversavam entre si: `Indicador` no
 * painel, `Cartao` no estoque, `Cartao` no financeiro, `SalesSummary` nas
 * vendas e `Resumo` no funil — cinco alturas, três tamanhos de número e três
 * jeitos de dizer "não deu para ler".
 *
 * Server Component. O único pedaço de cliente que ele monta é o `<CountUp>`, e
 * só quando `contar` é pedido; `Sparkline` desenha no servidor.
 *
 * O que ele deliberadamente NÃO faz: inventar número. `valor={null}` e
 * `variacao={{ valor: null }}` existem porque a ausência de medida é um
 * resultado legítimo, e escrevê-la como `0` seria afirmar estabilidade que
 * ninguém apurou (CLAUDE.md, regra inegociável; DESIGN_SYSTEM, risco R7).
 */

export type FormatoDoValor = 'moeda' | 'numero' | 'percentual';

/** Tom do indicador. Colore ícone e número — nunca é a única pista (ver `alarmado`). */
export type TomDoStat = 'neutral' | 'danger' | 'success' | 'warning';

const TOM: Record<TomDoStat, string> = {
  neutral: 'text-content',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
};

/* A linha miúda acompanha o tom do cartão; `neutral` usa o acento, que é a cor de dado da casa. */
const TOM_DA_LINHA: Record<TomDoStat, TomDaSparkline> = {
  neutral: 'accent',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
};

export interface VariacaoDoStat {
  /**
   * Pontos percentuais em relação à janela anterior. `null` quando não existe
   * janela anterior comparável — e aí o cartão escreve "sem base para
   * comparar". Nunca `0`: zero é uma medida, não uma ausência.
   */
  valor: number | null;
  /** Contra o que se compara, por extenso: "vs. 7 dias anteriores". */
  rotulo: string;
  /**
   * Quando subir é ruim — despesa, cancelamento, vencido. Inverte só a cor;
   * a seta continua apontando para onde o número foi.
   */
  inverso?: boolean;
}

export interface StatProps {
  rotulo: string;
  /**
   * `null` = não há número para mostrar. O cartão escreve `semValor` em vez de
   * um zero que passaria por medida.
   */
  valor: number | null;
  /** `percentual` espera pontos percentuais já prontos: `12` vira "12%". */
  formato?: FormatoDoValor;
  Icone?: LucideIcon;
  variacao?: VariacaoDoStat;
  /** Histórico para a linha miúda à direita do número. Vazia vira tracejado, não linha reta. */
  serie?: readonly number[];
  /** O cartão inteiro vira alvo — é assim que a faixa de KPIs filtra a lista abaixo. */
  href?: string;
  /** Só faz sentido com `href`: marca o filtro em vigor. */
  ativo?: boolean;
  tom?: TomDoStat;
  /** Anima do valor anterior até o novo. Reservado à faixa do topo (seção 8, regra 5). */
  contar?: boolean;
  /** Escreve o `+` do positivo e o menos tipográfico do negativo. É para saldo, nunca para contagem. */
  sinal?: boolean;
  /**
   * O número é uma soma **truncada** — a consulta parou antes do fim. O texto
   * diz onde parou, e o cartão passa a anunciar "parcial" em vez de exibir o
   * valor como total.
   */
  parcial?: string;
  /** Rodapé livre: o que o número significa, de onde ele vem. */
  nota?: ReactNode;
  /** O que escrever quando `valor` é `null`. O padrão assume falha de leitura. */
  semValor?: string;
  /** Entrada da faixa. Fora dela, deixe falso: uma tela tem um evento de entrada só. */
  animar?: boolean;
  /** `animationDelay`; use `atrasoDaLinha(i)` para manter a cadência única. */
  atraso?: string;
  className?: string;
}

const CORPO: Record<FormatoDoValor, (n: number) => string> = {
  moeda: (n) => formatCents(n),
  numero: (n) => n.toLocaleString('pt-BR'),
  percentual: (n) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
};

/*
 * O sinal é escrito à mão porque o Intl não põe `+` no positivo e usa hífen no
 * negativo. Num saldo, "R$ 120,00" e "−R$ 120,00" precisam se distinguir de
 * longe, e o hífen some no tamanho de 32px.
 */
function textoDoValor(valor: number, formato: FormatoDoValor, sinal: boolean): string {
  if (!sinal || valor === 0) return CORPO[formato](valor);
  return `${valor > 0 ? '+' : '−'}${CORPO[formato](Math.abs(valor))}`;
}

function percentual(valor: number): string {
  return `${Math.abs(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function Variacao({ variacao }: { variacao: VariacaoDoStat }) {
  const v = variacao.valor;

  if (v === null) {
    /* A frase inteira é o contrato: "0%" aqui afirmaria estabilidade sem medida. */
    return <span className="text-content-subtle">sem base para comparar</span>;
  }

  const Seta = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus;
  const favoravel = variacao.inverso === true ? v < 0 : v > 0;
  const cor = v === 0 ? 'text-content-subtle' : favoravel ? 'text-success' : 'text-danger';

  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center gap-0.5 font-medium', cor)}>
        <Seta className="size-3.5 shrink-0" aria-hidden />
        {/*
         * O visível usa `+`/`−`; o leitor de tela recebe o verbo. O menos
         * tipográfico (U+2212) é o certo na tela e é justamente o que boa parte
         * dos leitores não anuncia.
         */}
        <span aria-hidden>{v === 0 ? '0%' : `${v > 0 ? '+' : '−'}${percentual(v)}`}</span>
        <span className="sr-only">
          {v === 0 ? 'estável' : `${v > 0 ? 'subiu' : 'caiu'} ${percentual(v)}`}
        </span>
      </span>
      <span className="text-content-subtle">{variacao.rotulo}</span>
    </span>
  );
}

/* Mesmo cromo que o `SkeletonStat` reproduz — mudar aqui sem mudar lá faz a tela saltar ao carregar. */
const TILE = 'flex min-w-0 flex-col gap-2 rounded-card border p-4 shadow-card';

export function Stat({
  rotulo,
  valor,
  formato = 'numero',
  Icone,
  variacao,
  serie,
  href,
  ativo = false,
  tom = 'neutral',
  contar = false,
  sinal = false,
  parcial,
  nota,
  semValor = 'não consegui ler agora',
  animar = false,
  atraso,
  className,
}: StatProps) {
  /*
   * Um zero nunca é alarme. "Saldo negativo: 0" em vermelho manda a pessoa
   * procurar um problema que não existe — então o tom só pinta quando há
   * número e ele não é zero. Vale para o ícone e para o valor juntos, senão o
   * cartão fica com o símbolo gritando e a cifra calma.
   */
  const alarmado = tom !== 'neutral' && valor !== null && valor !== 0;
  const corDoNumero = alarmado ? TOM[tom] : 'text-content';

  /*
   * `contar` depende do `CountUp`, que formata por dentro e não sabe de sinal
   * nem de percentual. Em vez de duplicar o formatador lá, o número sai
   * estático nesses dois casos — perder a animação é mais barato que perder o
   * "+" de um saldo.
   */
  const podeContar = contar && valor !== null && formato !== 'percentual' && !sinal;

  const partes: { chave: string; node: ReactNode }[] = [];
  if (variacao !== undefined)
    partes.push({ chave: 'variacao', node: <Variacao variacao={variacao} /> });
  if (parcial !== undefined)
    partes.push({ chave: 'parcial', node: <span className="text-warning">{parcial}</span> });
  if (nota !== undefined && nota !== null)
    partes.push({ chave: 'nota', node: <span className="text-content-subtle">{nota}</span> });

  const conteudo = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-caption text-content-muted">{rotulo}</span>
        {Icone !== undefined && (
          <Icone
            className={cn('size-4 shrink-0', alarmado ? TOM[tom] : 'text-content-subtle')}
            aria-hidden
          />
        )}
      </span>

      <span className="flex items-end justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          {valor === null ? (
            <span className="text-body text-content-subtle">{semValor}</span>
          ) : podeContar ? (
            <CountUp
              valor={valor}
              formato={formato === 'moeda' ? 'dinheiro' : 'inteiro'}
              className={cn('min-w-0 text-metric break-words tabular-nums', corDoNumero)}
            />
          ) : (
            <span className={cn('min-w-0 text-metric break-words tabular-nums', corDoNumero)}>
              {textoDoValor(valor, formato, sinal)}
            </span>
          )}
          {/*
           * O selo é a diferença entre "este é o total" e "este é o quanto deu
           * para somar". O tom `warning` já traz o próprio símbolo, então a
           * advertência não depende da cor.
           */}
          {parcial !== undefined && valor !== null && (
            <Badge tone="warning" tamanho="xs">
              parcial
            </Badge>
          )}
        </span>
        {/* Sem `rotulo`: a linha sai da árvore de acessibilidade, porque o número ao lado já a resume. */}
        {serie !== undefined && (
          <Sparkline serie={serie} tom={TOM_DA_LINHA[tom]} className="mb-1" />
        )}
      </span>

      {partes.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption">
          {partes.map((parte, i) => (
            <Fragment key={parte.chave}>
              {i > 0 && <span aria-hidden>·</span>}
              {parte.node}
            </Fragment>
          ))}
        </span>
      )}
    </>
  );

  const cromo = cn(
    TILE,
    ativo ? 'border-line-accent bg-surface-accent-soft' : 'border-line-subtle bg-surface-panel',
    animar && 'animate-enter',
    className,
  );
  const estilo = atraso === undefined ? undefined : { animationDelay: atraso };

  if (href === undefined) {
    return (
      <div className={cromo} style={estilo}>
        {conteudo}
      </div>
    );
  }

  return (
    <Link
      href={href}
      /* `true`, não `page`: o cartão filtra a lista da própria tela, não navega para outra. */
      aria-current={ativo ? 'true' : undefined}
      className={cn(
        cromo,
        /* Elevação de hover é CSS puro — nenhum `'use client'` nasce daqui (risco R5). */
        'transition transition-base hover:border-line hover:shadow-raised motion-safe:hover:-translate-y-px',
      )}
      style={estilo}
    >
      {conteudo}
    </Link>
  );
}

/** Quantas colunas a faixa abre no largo. Abaixo de `xl` a grade é sempre 2 → 3. */
export type ColunasDaFaixa = 3 | 4 | 5;

const COLUNAS: Record<ColunasDaFaixa, string> = {
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
};

export interface StatGridProps {
  colunas?: ColunasDaFaixa;
  children: ReactNode;
  className?: string;
}

/**
 * A faixa de indicadores no topo da tela.
 *
 * `gap-3`, não `gap-6`: são tiles de uma mesma faixa, não regiões de página
 * (seção 5). Duas colunas no celular em vez de uma — um KPI ocupando a largura
 * inteira do telefone empurra a lista para fora da primeira tela.
 *
 * Não é `<dl>`. Um cartão com `href` é um `<a>`, e `<a>` não é filho válido de
 * `<dl>`; um `<dl>` por cartão faria o leitor de tela anunciar cinco listas de
 * um item cada. Rótulo e número já se leem na ordem certa.
 */
export function StatGrid({ colunas = 4, children, className }: StatGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3', COLUNAS[colunas], className)}>
      {children}
    </div>
  );
}
