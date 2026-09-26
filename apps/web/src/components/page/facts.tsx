import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface Fato {
  rotulo: string;
  /** `null` é "não informado", e aparece como travessão — nunca como vazio. */
  valor: ReactNode | null;
  /** Dinheiro, quantidade, documento: alinha por dígito e não dança quando o valor troca. */
  numerico?: boolean;
}

export interface FactsProps {
  fatos: readonly Fato[];
  className?: string;
}

/** A coluna de fatos das páginas de detalhe: rótulo pequeno em cima, valor embaixo. */
export function Facts({ fatos, className }: FactsProps) {
  return (
    <dl className={cn('flex flex-col gap-3', className)}>
      {fatos.map((fato) => (
        <div key={fato.rotulo} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-caption text-content-muted">{fato.rotulo}</dt>
          <dd
            className={cn(
              fato.numerico === true ? 'text-num' : 'text-body',
              fato.valor === null ? 'text-content-subtle' : 'break-words text-content',
            )}
          >
            {fato.valor ?? (
              /* O travessão é desenho. Quem ouve a página precisa da palavra. */
              <>
                <span aria-hidden>—</span>
                <span className="sr-only">não informado</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
