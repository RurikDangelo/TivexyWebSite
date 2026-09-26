import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badge = cva('inline-flex items-center rounded-pill whitespace-nowrap [&_svg]:shrink-0', {
  variants: {
    tone: {
      /*
       * No escuro o selo precisa sobreviver sobre `surface-panel` (cartão) e
       * sobre `surface-elevated` (dropdown, dialog). `sunken` é o único degrau
       * que se afasta dos dois; `muted` empata com `elevated`.
       */
      neutral: 'bg-surface-muted text-content-muted dark:bg-surface-sunken',
      brand: 'bg-surface-accent-soft text-content-accent',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      /* Uso obrigatório em qualquer coisa simulada. Ver CLAUDE.md. */
      mock: 'bg-warning-soft font-mono tracking-wider text-warning uppercase',
    },
    tamanho: {
      /* `text-micro` já nasce em 600; `text-caption` é 400 e precisa do peso. */
      xs: 'gap-1 px-1.5 py-px text-micro [&_svg]:size-3',
      sm: 'gap-1.5 px-2 py-0.5 text-caption font-medium [&_svg]:size-3.5',
    },
  },
  defaultVariants: { tone: 'neutral', tamanho: 'sm' },
});

/*
 * Cor nunca vem sozinha. Os três tons de estado trazem o próprio símbolo, de
 * modo que quem não distingue vermelho de verde ainda lê o selo — e a palavra
 * dentro do selo continua sendo obrigatória. Os tons neutro, brand e mock não
 * ganham ícone porque não codificam estado nenhum pela cor.
 */
const ICONE_DO_TOM: Partial<Record<NonNullable<VariantProps<typeof badge>['tone']>, LucideIcon>> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badge> & {
    /**
     * Símbolo à esquerda do texto. Omitido, o tom de estado usa o dele.
     * `null` desliga — é o caso de quem já desenha o próprio ícone nos filhos,
     * que de outra forma apareceria duas vezes.
     */
    Icone?: LucideIcon | null;
  };

export function Badge({ className, tone, tamanho, Icone, children, ...props }: BadgeProps) {
  const Simbolo = Icone === undefined ? (ICONE_DO_TOM[tone ?? 'neutral'] ?? null) : Icone;

  return (
    <span className={cn(badge({ tone, tamanho }), className)} {...props}>
      {Simbolo !== null && <Simbolo aria-hidden />}
      {children}
    </span>
  );
}
