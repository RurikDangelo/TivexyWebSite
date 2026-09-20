'use client';

import { AlertTriangle, RotateCcw, Undo2 } from 'lucide-react';
import { useActionState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { desfazerProvisionamento, retomarProvisionamento } from './recovery';
import { RECUPERACAO_INICIAL } from './state';

export interface FalhaResumo {
  runId: string;
  tenantName: string;
  tenantSlug: string;
  etapa: string;
  erro: string;
  temEntrada: boolean;
}

/**
 * Os provisionamentos que pararam no meio.
 *
 * Aparece antes da lista de clientes porque é o que pede ação. Um cliente em
 * `provisioning` não opera, e quem está do outro lado está esperando.
 *
 * As duas saídas ficam lado a lado, e nenhuma é a padrão: retomar serve para
 * falha passageira — rede, limite de taxa —, desfazer para entrada errada. O
 * texto do erro é o que distingue, e quem lê é quem decide.
 */
export function FailedRuns({ falhas }: { falhas: readonly FalhaResumo[] }) {
  const [retomada, retomar] = useActionState(
    (_: typeof RECUPERACAO_INICIAL, f: FormData) => retomarProvisionamento(f),
    RECUPERACAO_INICIAL,
  );
  const [desfeito, desfazer] = useActionState(
    (_: typeof RECUPERACAO_INICIAL, f: FormData) => desfazerProvisionamento(f),
    RECUPERACAO_INICIAL,
  );

  if (falhas.length === 0) return null;

  const erro = retomada.erro ?? desfeito.erro;
  const aviso = retomada.aviso ?? desfeito.aviso;

  return (
    <Card className="mb-6 border-warning/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          <CardTitle className="text-sm">Provisionamentos parados no meio</CardTitle>
        </div>
        <CardDescription>
          O cliente existe e não opera. Retomar continua de onde parou, sem repetir etapa concluída;
          desfazer reverte na ordem inversa e cancela o cliente.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {erro !== null && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {erro}
          </p>
        )}
        {aviso !== null && (
          <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
            {aviso}
          </p>
        )}

        {falhas.map((falha) => (
          <div
            key={falha.runId}
            className="flex flex-wrap items-center gap-3 rounded-md border border-line-subtle p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-content">
                {falha.tenantName}
              </span>
              <span className="block truncate text-xs text-content-muted">{falha.erro}</span>
            </span>

            <Badge tone="warning">{falha.etapa}</Badge>

            <div className="flex gap-2">
              <form action={retomar}>
                <input type="hidden" name="runId" value={falha.runId} />
                <button
                  type="submit"
                  disabled={!falha.temEntrada}
                  title={
                    falha.temEntrada
                      ? 'Continuar de onde parou'
                      : 'Esta execução não guardou a entrada — só dá para desfazer'
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-xs text-content transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Retomar
                </button>
              </form>

              <form action={desfazer}>
                <input type="hidden" name="runId" value={falha.runId} />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-xs text-danger transition-colors hover:bg-danger/10"
                >
                  <Undo2 className="size-3.5" aria-hidden />
                  Desfazer
                </button>
              </form>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
