import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9.5 w-full rounded-md border border-line-field bg-surface px-3 text-sm text-content',
        'placeholder:text-content-subtle',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-content-default', className)} {...props} />;
}

/**
 * A mesma casca do `Input`, para os campos que não são `<input>`.
 *
 * Repetir as classes em cada um é o que produz o formulário em que um campo
 * tem borda de foco e o vizinho não — e ninguém percebe até a tela ficar
 * pronta.
 */
const CASCA =
  'w-full rounded-md border border-line-field bg-surface px-3 text-sm text-content transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CASCA, 'h-9.5', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea className={cn(CASCA, 'py-2 placeholder:text-content-subtle', className)} {...props} />
  );
}
