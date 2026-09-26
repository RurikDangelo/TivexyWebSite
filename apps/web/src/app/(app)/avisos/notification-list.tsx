import { Check } from 'lucide-react';

import { Submit } from '@/components/form/submit';
import { Card, CardContent } from '@/components/ui/card';
import { formatInstant } from '@/lib/format';
import { cn } from '@/lib/utils';

import { abrirAviso, marcarComoLido } from './actions';

export interface Aviso {
  id: string;
  titulo: string;
  texto: string | null;
  temLink: boolean;
  quando: string;
  lido: boolean;
}

/**
 * A lista de avisos. O não lido tem ponto, peso e o texto "Não lido" para o
 * leitor de tela — a cor não carrega sozinha o estado.
 */
export function NotificationList({ avisos, fuso }: { avisos: readonly Aviso[]; fuso: string }) {
  return (
    <Card>
      <CardContent className="pt-1">
        <ol className="flex flex-col divide-y divide-line-subtle">
          {avisos.map((a, i) => (
            <li
              key={a.id}
              className="flex animate-enter items-start gap-3 py-3"
              style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
            >
              <span className="mt-1.5 flex size-2 shrink-0 items-center justify-center">
                {!a.lido && <span className="size-2 rounded-full bg-surface-brand" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="sr-only">{a.lido ? 'Lido.' : 'Não lido.'}</p>
                {a.temLink ? (
                  <form action={abrirAviso}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className={cn(
                        'text-left break-words underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        a.lido ? 'text-content-muted' : 'font-medium text-content',
                      )}
                    >
                      {a.titulo}
                    </button>
                  </form>
                ) : (
                  <p
                    className={cn(
                      'break-words',
                      a.lido ? 'text-content-muted' : 'font-medium text-content',
                    )}
                  >
                    {a.titulo}
                  </p>
                )}
                {a.texto !== null && (
                  <p className="mt-0.5 text-sm break-words text-content-muted">{a.texto}</p>
                )}
                <time dateTime={a.quando} className="text-xs text-content-subtle tabular-nums">
                  {formatInstant(a.quando, fuso)}
                </time>
              </div>
              {!a.lido && (
                <form action={marcarComoLido}>
                  <input type="hidden" name="id" value={a.id} />
                  <Submit
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    pendente=""
                    aria-label={`Marcar como lido: ${a.titulo}`}
                    title="Marcar como lido"
                  >
                    <Check aria-hidden />
                  </Submit>
                </form>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
