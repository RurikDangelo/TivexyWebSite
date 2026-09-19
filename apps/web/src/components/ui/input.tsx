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
  return (
    <label
      className={cn('text-sm font-medium text-content-default', className)}
      {...props}
    />
  );
}
