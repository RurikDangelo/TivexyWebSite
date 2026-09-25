import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Liga e desliga — uma caixa de seleção nativa com a cara de interruptor.
 *
 * Nativa por baixo: espaço alterna, o formulário envia `on`, o leitor de tela
 * anuncia "interruptor, ligado". Nada disso precisa ser reimplementado, e é
 * por isso que não é um `<button>` com estado.
 */
export function Switch({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={cn(
        'relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors duration-150',
        'before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-xs before:transition-transform before:duration-150',
        'checked:bg-surface-brand checked:before:translate-x-4',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
