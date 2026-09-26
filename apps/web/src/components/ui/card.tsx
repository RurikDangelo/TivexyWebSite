import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Duas densidades e só duas: a terceira sempre acaba virando "quase igual à segunda". */
export type CardDensidade = 'padrao' | 'compacta';

/*
 * O respiro do cartão desce por variável CSS, não por prop repassada a cada parte.
 *
 * Card é Server Component e não pode usar contexto do React; a alternativa seria
 * escrever `densidade` de novo em cada `<CardContent>`, o que é esquecido na
 * primeira pressa e produz cartões com cabeçalho compacto e corpo largo. A
 * cascata resolve isso de graça, e o fallback nas partes cobre quem usa um
 * `<CardFooter>` fora de um Card.
 *
 * `--card-pad-tight` é o encosto vertical — cabeçalho e rodapé colam mais no
 * conteúdo do que nas bordas laterais, senão o cartão parece um formulário.
 */
const DENSIDADE: Record<CardDensidade, string> = {
  padrao: '[--card-pad:1rem] [--card-pad-tight:0.75rem]',
  compacta: '[--card-pad:0.75rem] [--card-pad-tight:0.5rem]',
};

export interface CardProps extends ComponentProps<'div'> {
  densidade?: CardDensidade;
  /**
   * O cartão inteiro é um alvo (envolve um link ou um form). Só acrescenta a
   * elevação de hover — é CSS puro, nenhum `'use client'` nasce daqui.
   */
  interativo?: boolean;
}

export function Card({ className, densidade = 'padrao', interativo = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        /*
         * `surface-panel` sobre a `surface-page` do body: no tema claro o cartão
         * era branco sobre branco e simplesmente não se separava da página.
         * `shadow-card` completa o degrau no claro e vira `none` no escuro, onde
         * quem separa é a própria troca de superfície.
         */
        'rounded-card border border-line-subtle bg-surface-panel shadow-card',
        DENSIDADE[densidade],
        interativo &&
          'transition transition-base hover:border-line hover:shadow-raised motion-safe:hover:-translate-y-px',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        /*
         * Grade de duas colunas para que `<CardAction>` não dependa de um wrapper
         * flex remontado a cada uso: título e descrição empilham na coluna 1 e a
         * ação ocupa a coluna 2 inteira. Sem ação, a segunda coluna tem largura
         * zero e o cabeçalho se comporta como a pilha de antes.
         */
        'grid auto-rows-min grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1',
        'p-[var(--card-pad,1rem)] pb-[var(--card-pad-tight,0.75rem)]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Ação do cabeçalho — botão, menu ou selo à direita do título.
 *
 * Fica ancorada nas duas linhas da grade, então continua alinhada ao topo
 * independentemente de haver `<CardDescription>` embaixo do título.
 */
export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'col-start-2 row-span-2 row-start-1 flex items-center gap-2 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  );
}

/*
 * `text-content` explícito: a regra base de `h1-h4` saiu do globals.css, então
 * um <h3> nasce com a cor herdada do corpo. E o token `text-h3` já é Inter com
 * tracking zero — a Manrope ficou para os títulos grandes, onde o tamanho a
 * deixa respirar. Em 16px ela encostava as palavras: "Plano e módulos" lia
 * "Planoemódulos".
 */
export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-h3 text-content', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-caption text-content-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-[var(--card-pad,1rem)] pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-t border-line-subtle',
        'p-[var(--card-pad,1rem)] py-[var(--card-pad-tight,0.75rem)]',
        className,
      )}
      {...props}
    />
  );
}
