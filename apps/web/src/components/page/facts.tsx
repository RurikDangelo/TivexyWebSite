import type { ReactNode } from 'react';

export interface Fato {
  rotulo: string;
  /** `null` é "não informado", e aparece como travessão — nunca como vazio. */
  valor: ReactNode | null;
}

/** A coluna de fatos das páginas de detalhe: rótulo pequeno em cima, valor embaixo. */
export function Facts({ fatos }: { fatos: readonly Fato[] }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {fatos.map((fato) => (
        <div key={fato.rotulo} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-content-muted">{fato.rotulo}</dt>
          <dd className={fato.valor === null ? 'text-content-subtle' : 'break-words text-content'}>
            {fato.valor ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
