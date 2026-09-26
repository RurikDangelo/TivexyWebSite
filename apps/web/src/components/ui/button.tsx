import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/*
 * Estado por token semântico, nunca por valor cru.
 *
 * `hover:bg-[var(--tvx-blue-700)]` era o defeito mais visível do primário: no
 * tema escuro ele ESCURECIA um botão que já está sobre fundo escuro, e a ação
 * principal sumia justamente quando o ponteiro chegava nela.
 * `--surface-brand-hover` é blue-700 no claro e blue-300 no escuro — a mesma
 * classe anda para o lado certo nos dois temas.
 *
 * `not-disabled:` em todo estado interativo é consequência direta de trocar
 * `disabled:pointer-events-none` por `disabled:cursor-not-allowed`: o ponteiro
 * voltou a alcançar o botão desabilitado — é isso que permite a um Tooltip
 * explicar por que ele está assim — e sem a guarda ele acenderia no hover,
 * mentindo que é clicável. `:not(:disabled)` também casa com `<a>`, que é como
 * `buttonVariants()` é usado em 15 telas.
 *
 * `border border-transparent` na base iguala a caixa interna de `outline` e dos
 * preenchidos: sem isso o rótulo do outline nasce 1px menor que o do primário e
 * dois botões lado a lado não alinham o texto.
 */
const button = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'rounded-control border border-transparent text-label',
    'transition-[color,background-color,border-color,box-shadow,opacity] transition-base',
    /*
     * Anel próprio em vez de herdar só a regra global: a variante `danger`
     * precisa trocar a cor do foco, e não dá para fazer isso sem o botão
     * declarar o anel dele.
     */
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        brand: [
          'bg-surface-brand text-content-on-brand shadow-card',
          'not-disabled:hover:bg-surface-brand-hover',
          'not-disabled:active:bg-surface-brand-active not-disabled:active:shadow-flat',
        ],
        secondary: [
          'bg-surface-muted text-content',
          'not-disabled:hover:bg-surface-inset',
          'not-disabled:active:border-line-strong',
        ],
        outline: [
          'border-line-strong bg-surface text-content',
          'not-disabled:hover:border-line-field not-disabled:hover:bg-surface-subtle',
          'not-disabled:active:bg-surface-muted',
        ],
        ghost: [
          'text-content-default',
          'not-disabled:hover:bg-surface-muted not-disabled:hover:text-content',
          'not-disabled:active:bg-surface-muted not-disabled:active:border-line',
        ],
        /*
         * `text-white` dava 2,2:1 sobre o vermelho claro do tema escuro.
         * `--content-on-danger` escurece junto com o preenchimento.
         *
         * Hover e active por opacidade do elemento inteiro, não por
         * `bg-danger/90`: a seção 6 proíbe opacidade sobre token de estado
         * porque o vermelho se mistura com a página e o mesmo erro passa a ter
         * duas cores. Não existe `--surface-danger-hover` para usar no lugar.
         */
        danger: [
          'bg-danger text-content-on-danger shadow-card',
          'focus-visible:outline-danger',
          'not-disabled:hover:opacity-90',
          'not-disabled:active:opacity-80 not-disabled:active:shadow-flat',
        ],
        link: [
          'text-content-accent underline-offset-4',
          'not-disabled:hover:underline',
          'not-disabled:active:opacity-80',
        ],
      },
      /*
       * Um único tamanho de texto em todos os tamanhos de botão. A hierarquia
       * vem da altura e do respiro horizontal — variar também o corpo do texto
       * é o que fazia `lg` parecer de outro sistema.
       */
      size: {
        xs: 'h-7 gap-1.5 px-2.5 [&_svg]:size-3.5',
        sm: 'h-8 gap-1.5 px-3',
        md: 'h-9.5 px-4',
        lg: 'h-11 px-6',
        icon: 'size-9.5',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'brand', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof button> {
  /**
   * Ação em curso: mostra o spinner, marca `aria-busy` e bloqueia o clique.
   *
   * É prop, e não estado interno: quem sabe que o formulário está enviando é o
   * `useFormStatus` dentro de `<Submit>`. Mover esse hook para cá faria o
   * `Button` só enxergar o próprio `<form>` quando estivesse dentro de um, e a
   * trava que impede registrar a mesma venda duas vezes no balcão dependeria de
   * onde o botão foi colocado (risco R6).
   */
  carregando?: boolean;
}

export function Button({
  className,
  variant,
  size,
  carregando = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  // Botão só-ícone não tem onde acomodar spinner E ícone: o spinner substitui.
  const soIcone = size === 'icon' || size === 'icon-sm';

  return (
    <button
      {...props}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
    >
      {carregando ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {carregando && soIcone ? null : children}
    </button>
  );
}

export { button as buttonVariants };
