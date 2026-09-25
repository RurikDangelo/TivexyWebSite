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
 * `<select>` nativo com a mesma cara do campo.
 *
 * Nativo de propósito: no celular abre o seletor do sistema, que é melhor do
 * que qualquer lista desenhada à mão, e funciona com teclado e leitor de tela
 * sem uma linha de código.
 */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9.5 w-full min-w-0 rounded-md border border-line-field bg-surface px-2.5 text-sm text-content',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-md border border-line-field bg-surface px-3 py-2 text-sm text-content',
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
