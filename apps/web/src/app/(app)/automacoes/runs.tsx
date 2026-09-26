import type { Term } from '@tivexy/core';
import { CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { linkDoEvento, resumoDoEvento } from '@/lib/automation/rule-text';
import { formatInstant } from '@/lib/format';

import type { ExecucaoNaTela } from './state';

/**
 * O registro do motor: cada vez que uma automação rodou — e, quando falhou,
 * o motivo. É o que responde "por que o aviso não chegou?" sem abrir o banco.
 *
 * Ícone e palavra juntos: a cor não carrega sozinha o "deu certo".
 */
export function RunList({
  execucoes,
  nomes,
  fuso,
  automacao,
}: {
  execucoes: readonly ExecucaoNaTela[];
  nomes: ReadonlyMap<string, string>;
  fuso: string;
  automacao: Term;
}) {
  if (execucoes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-content-muted">
        Nada rodou ainda. Quando um evento combinar com {automacao.singular} em vigor, a execução
        aparece aqui — inclusive a que falhar, com o motivo.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="pt-1">
        <ol className="flex flex-col divide-y divide-line-subtle">
          {execucoes.map((e, i) => {
            const link = linkDoEvento(e.gatilho, e.payload);
            const evento = resumoDoEvento(e.gatilho, e.payload);
            return (
              <li
                key={e.id}
                className="flex animate-enter gap-3 py-3 text-sm"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                {e.deuCerto ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-content">
                    <span className="font-medium">{nomes.get(e.regraId) ?? 'Sem nome'}</span>
                    <span className="text-content-muted">
                      {' — '}
                      {e.deuCerto ? (e.detalhe ?? 'rodou') : 'falhou'}
                    </span>
                  </p>
                  {!e.deuCerto && e.detalhe !== null && (
                    <p className="break-words text-xs text-danger">Motivo: {e.detalhe}</p>
                  )}
                  <p className="text-xs text-content-subtle tabular-nums sm:hidden">
                    {formatInstant(e.quando, fuso)}
                  </p>
                  {evento !== '' && (
                    <p className="break-words text-xs text-content-subtle">
                      {link === null ? (
                        evento
                      ) : (
                        <Link href={link} className="underline-offset-2 hover:underline">
                          {evento}
                        </Link>
                      )}
                    </p>
                  )}
                </div>
                {/* No celular a hora desce para baixo do texto: ao lado, espremeria o nome. */}
                <time
                  dateTime={e.quando}
                  className="hidden shrink-0 text-xs text-content-subtle tabular-nums sm:block"
                >
                  {formatInstant(e.quando, fuso)}
                </time>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
