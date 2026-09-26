import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * O papel da tela, que é o que decide a largura dela.
 *
 * Seis papéis, não seis números: quem escreve a página escolhe o que a tela é,
 * e o teto vem junto. Ver a tabela da seção 3 do DESIGN_SYSTEM.
 */
export type PageVariant = 'operacao' | 'quadro' | 'painel' | 'registro' | 'ajuste' | 'intersticial';

/**
 * Cancela o gutter do `<main>` — a caixa passa a encostar na borda da janela.
 *
 * Exportada porque quem rola de fato (o elemento com `overflow-x-auto`) precisa
 * cancelar também o padding do `<Page variant="quadro">` para a faixa chegar à
 * borda; sem uma string só, o gutter volta a ter dois donos que discordam.
 *
 * O passo `2xl` não está na tabela da seção 3: aquela string foi copiada do
 * `board.tsx`, anterior ao `2xl:px-10` que a mesma seção dá ao `<main>`. Sem
 * ele sobrariam 8px de margem a partir de 1536px, e a sangria erraria por pouco
 * justamente na tela larga, que é onde ela aparece.
 */
export const SANGRIA_DO_GUTTER =
  '-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 2xl:-mx-10 2xl:px-10';

/*
 * `satisfies` em vez de `cva`: com um eixo só e nenhum padrão, o que se quer do
 * tipo é exaustividade — acrescentar um papel a `PageVariant` sem dar teto a ele
 * tem de parar a compilação. `cva` deriva as chaves do objeto e não pararia.
 */
const TETO = {
  /* Sem teto: a densidade é da tabela, e estreitar a lista é desperdiçar coluna. */
  operacao: '',
  quadro: SANGRIA_DO_GUTTER,
  /* Sem teto: a grade de KPIs quer toda a largura de `--content-max`. */
  painel: '',
  registro: 'mx-auto max-w-[1400px]',
  ajuste: 'mx-auto max-w-3xl',
  /*
   * O que sobra da janela = altura total − header − o `py-6` do `<main>`.
   * Somar à mão é ruim, mas `h-full` exigiria altura declarada em toda a cadeia
   * até o `<html>`, e isso quebraria o `sticky` do header.
   */
  intersticial:
    'mx-auto flex min-h-[calc(100dvh_-_var(--header-h)_-_3rem)] max-w-lg flex-col justify-center',
} satisfies Record<PageVariant, string>;

export interface PageProps {
  variant: PageVariant;
  children: ReactNode;
  className?: string;
}

/**
 * A largura da página — o dono dela, que antes não existia.
 *
 * `mx-auto max-w-*` aparecia 35 vezes em 34 arquivos, cada tela com o seu
 * número, e o `loading.tsx` com um terceiro: era daí que vinha o salto de
 * largura entre o esqueleto e o conteúdo. Não havia onde consertar; agora há.
 *
 * O gutter e o teto de `--content-max` são do `<main>` (seção 2). Aqui mora só
 * o teto **interno** da variante — por isso este componente não tem padding.
 *
 * `variant` é obrigatória de propósito: sem padrão, ninguém herda a largura de
 * outra tela por acidente.
 */
export function Page({ variant, children, className }: PageProps) {
  return <div className={cn('w-full', TETO[variant], className)}>{children}</div>;
}

export interface GradeProps {
  children: ReactNode;
  className?: string;
}

/**
 * A grade das telas `[id]`: fatos à esquerda, corpo no meio, ações à direita.
 *
 * Empilha abaixo de `xl` — três colunas em 1024px dariam 300px de corpo. O
 * `minmax(0,1fr)` do meio é o que impede que um nome sem espaço estique a
 * coluna e empurre as outras para fora.
 */
export function GradeDeRegistro({ children, className }: GradeProps) {
  return (
    <div className={cn('grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]', className)}>
      {children}
    </div>
  );
}

/**
 * A grade bento do painel: bloco principal e coluna de apoio.
 *
 * É o que vem **depois** da faixa de KPIs — a faixa é `<StatGrid>`, de
 * `ui/stat.tsx`, e não se repete aqui. `gap-6` porque são regiões de página,
 * o único lugar onde a seção 5 autoriza 24px.
 */
export function GradeDePainel({ children, className }: GradeProps) {
  return (
    <div className={cn('grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]', className)}>
      {children}
    </div>
  );
}
