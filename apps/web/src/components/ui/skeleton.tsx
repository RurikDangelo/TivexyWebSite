import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

/*
 * Esqueleto de carregamento (P6 do DESIGN_SYSTEM).
 *
 * A regra que justifica as formas derivadas: o esqueleto tem que ter a forma
 * do que vai chegar. Três cartões antes de uma tabela é pior que nada — promete
 * um layout, entrega outro, e a página salta. Por isso `SkeletonStat`,
 * `SkeletonRow`, `SkeletonChart` e `SkeletonForm` reproduzem medida por medida
 * o componente que substituem, não um retângulo genérico.
 *
 * Quem desenha a moldura: cada esqueleto reproduz só o cromo que o componente
 * real possui. O tile de KPI é dono da própria borda, então `SkeletonStat` tem
 * borda. `ChartFrame` e o formulário vivem dentro de um `Card` que é do
 * chamador, então `SkeletonChart` e `SkeletonForm` não desenham painel nenhum —
 * senão a tela ganha borda dupla enquanto carrega.
 *
 * Acessibilidade: tudo aqui é decorativo e sai da árvore com `aria-hidden`.
 * Quem anuncia o carregamento é o contêiner (o `loading.tsx` da rota ou o
 * `fallback` do `<Suspense>`), com UM `role="status"` e `aria-busy`. Vinte
 * esqueletos anunciando "carregando" é ruído, não informação.
 *
 * Sem `'use client'`: é CSS do começo ao fim.
 */

/** Papéis de raio que um esqueleto pode assumir (seção 5). Painel não entra: esqueleto não é overlay. */
export type RaioDoEsqueleto = 'control' | 'card' | 'pill';

const RAIO: Record<RaioDoEsqueleto, string> = {
  control: 'rounded-control',
  card: 'rounded-card',
  pill: 'rounded-pill',
};

/*
 * A varredura.
 *
 * `animate-shimmer` (globals.css) só move `background-position` — o gradiente é
 * responsabilidade de quem usa, e é aqui. O tamanho de 200% dá ao gradiente o
 * dobro da largura da caixa, que é o curso que a animação percorre.
 *
 * A posição parada em `-100% 0` empurra o gradiente inteiro para fora da caixa:
 * é o estado neutro. Importa porque o bloco `prefers-reduced-motion` zera a
 * duração sem `fill-mode`, e o elemento volta para a posição declarada aqui —
 * quem pediu menos movimento vê um bloco liso, não um brilho congelado no meio.
 *
 * O realce é branco nos dois temas, com alfa diferente: sobre `--surface-muted`
 * claro (#edf2f8) 60% chega quase ao branco; sobre o navy-800 do escuro, 6% já
 * levanta o suficiente — mais que isso vira faixa cinza berrante.
 */
const VARREDURA = [
  'bg-surface-muted bg-no-repeat',
  '[background-size:200%_100%] [background-position:-100%_0]',
  '[background-image:linear-gradient(90deg,transparent,rgb(255_255_255/0.6),transparent)]',
  'dark:[background-image:linear-gradient(90deg,transparent,rgb(255_255_255/0.06),transparent)]',
  'animate-shimmer',
].join(' ');

/** Número vira px; string passa inteira, para caber `rem`, `%` e `calc()`. */
function medida(valor: string | number): string {
  return typeof valor === 'number' ? `${valor}px` : valor;
}

export interface SkeletonProps {
  largura?: string | number;
  altura?: string | number;
  raio?: RaioDoEsqueleto;
  className?: string;
}

/**
 * O retângulo base. Tudo mais nesta pasta é composição dele.
 *
 * `largura` e `altura` entram por `style`, não por classe: `w-[${x}]` montado em
 * tempo de execução não existe no CSS gerado — o Tailwind lê o código-fonte, não
 * o valor da variável. Quem precisa de largura fluida usa `className="flex-1"`
 * ou `w-full` e deixa `largura` de fora.
 */
export function Skeleton({
  largura = '100%',
  /* 14px é a altura do `--text-body`: uma linha de esqueleto pesa o mesmo que a linha de texto que vai substituí-la. */
  altura = '0.875rem',
  raio = 'control',
  className,
}: SkeletonProps): ReactElement {
  return (
    <span
      aria-hidden
      className={cn('block shrink-0', VARREDURA, RAIO[raio], className)}
      style={{ width: medida(largura), height: medida(altura) }}
    />
  );
}

export interface SkeletonStatProps {
  className?: string;
}

/**
 * O tile de KPI do `<Stat>`: rótulo, ícone, número grande e nota de variação.
 *
 * Reproduz o cromo do tile (borda, `rounded-card`, `p-4`, `shadow-card`) porque
 * o `Stat` é dono dele. Quem monta a faixa é o `StatGrid` do chamador — repetir
 * este componente dentro da mesma grade do painel mantém a altura idêntica e
 * mata o salto quando os números chegam.
 */
export function SkeletonStat({ className }: SkeletonStatProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border border-line-subtle bg-surface-panel p-4 shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Rótulo em `--text-caption` (13px) e o ícone de 16px que o `Stat` aceita. */}
        <Skeleton largura="7rem" altura="0.8125rem" />
        <Skeleton largura="1rem" altura="1rem" />
      </div>
      {/* O número em `--text-metric`: 32px. É o que domina a altura do tile. */}
      <Skeleton largura="5.5rem" altura="2rem" />
      <Skeleton largura="9rem" altura="0.8125rem" />
    </div>
  );
}

/*
 * Larguras fixas, em ciclo. Nada de `Math.random()`: o mesmo esqueleto renderiza
 * no servidor e no cliente, e dois sorteios diferentes dão erro de hidratação.
 * A primeira coluna é a mais larga porque é quase sempre o nome do registro.
 */
const LARGURAS_DE_CELULA = ['72%', '46%', '60%', '38%', '54%', '44%'] as const;

export interface SkeletonRowProps {
  colunas: number;
  /** Mesmas duas densidades do `<Table>` (seção 5). Errar a densidade é errar a altura da lista inteira. */
  densidade?: 'densa' | 'larga';
  className?: string;
}

/**
 * Uma linha de tabela em carregamento.
 *
 * É um `<tr>` de verdade, para entrar direto no `<tbody>` do `<Table>` — um
 * `<div>` ali dentro é HTML inválido e o React reposiciona o nó na hidratação.
 * O efeito colateral é o melhor possível: o esqueleto herda o contêiner, o
 * cabeçalho e as larguras de coluna reais, em vez de imitá-los.
 *
 * As alturas batem com a seção 5: densa = py-2 + 20px = 36px; larga = py-2.5 +
 * 24px = 44px. O invólucro de altura fixa existe porque a linha de esqueleto
 * (14px) é mais baixa que a linha de texto, e sem ele a tabela encolhe.
 */
export function SkeletonRow({
  colunas,
  densidade = 'larga',
  className,
}: SkeletonRowProps): ReactElement {
  const densa = densidade === 'densa';
  return (
    <tr aria-hidden className={cn('border-b border-line-subtle last:border-0', className)}>
      {Array.from({ length: colunas }, (_, i) => (
        <td key={i} className={cn('px-3', densa ? 'py-2' : 'py-2.5')}>
          <span className={cn('flex items-center', densa ? 'h-5' : 'h-6')}>
            <Skeleton largura={LARGURAS_DE_CELULA[i % LARGURAS_DE_CELULA.length]} />
          </span>
        </td>
      ))}
    </tr>
  );
}

/* Perfil de barras fixo, pela mesma razão das larguras de célula: hidratação estável. */
const ALTURAS_DE_BARRA = [52, 78, 41, 66, 88, 35, 61, 73, 46, 95, 58, 69] as const;

export interface SkeletonChartProps {
  /** Altura da área de plotagem em px, igual à que o `<ChartFrame>` vai receber. */
  altura?: number;
  barras?: number;
  className?: string;
}

/**
 * A área de plotagem de um gráfico de barras, com eixo e rótulos.
 *
 * `altura` é obrigatória na prática: é o único jeito de o esqueleto ter a altura
 * do gráfico que vem depois. O padrão 200 é o do gráfico de vendas; o fluxo de
 * caixa usa 240 e precisa dizer isso.
 *
 * Sem painel próprio — o `Card` em volta é do chamador.
 */
export function SkeletonChart({
  altura = 200,
  barras = 12,
  className,
}: SkeletonChartProps): ReactElement {
  return (
    <div aria-hidden className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end gap-1.5" style={{ height: `${altura}px` }}>
        {Array.from({ length: barras }, (_, i) => (
          <Skeleton
            key={i}
            altura={`${ALTURAS_DE_BARRA[i % ALTURAS_DE_BARRA.length]}%`}
            className="min-w-0 flex-1"
          />
        ))}
      </div>
      {/* Eixo: linha fina de verdade, não um esqueleto — ela não muda quando o dado chega. */}
      <div className="h-px bg-line-subtle" />
      <div className="flex items-center justify-between">
        {Array.from({ length: 4 }, (_, i) => (
          /* Rótulo de eixo em `--text-micro`: 10px. */
          <Skeleton key={i} largura="2.5rem" altura="0.625rem" />
        ))}
      </div>
    </div>
  );
}

/* Rótulos de campo têm comprimentos diferentes; um ciclo curto já quebra o padrão de régua. */
const LARGURAS_DE_ROTULO = ['5rem', '7rem', '6rem', '8.5rem'] as const;

export interface SkeletonFormProps {
  campos: number;
  className?: string;
}

/**
 * Um formulário em carregamento: pares rótulo + campo, e a linha de ação.
 *
 * O botão entra no esqueleto de propósito. Ele chega junto com o formulário, e
 * um esqueleto sem ele promete um bloco mais curto do que o que vai aparecer —
 * que é exatamente o salto que o esqueleto existe para evitar.
 *
 * Medidas do `Field` e do `Input` atuais: `gap-1.5` entre rótulo e controle,
 * `gap-3` entre campos (seção 5), controle de 38px (`h-9.5`).
 */
export function SkeletonForm({ campos, className }: SkeletonFormProps): ReactElement {
  return (
    <div aria-hidden className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: campos }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton largura={LARGURAS_DE_ROTULO[i % LARGURAS_DE_ROTULO.length]} />
          <Skeleton altura="2.375rem" />
        </div>
      ))}
      <div className="flex pt-1">
        <Skeleton largura="8.5rem" altura="2.375rem" />
      </div>
    </div>
  );
}
