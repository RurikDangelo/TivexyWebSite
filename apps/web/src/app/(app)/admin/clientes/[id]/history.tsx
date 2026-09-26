import {
  PROVISIONING_STATUSES,
  PROVISIONING_STEP_STATUSES,
  type ProvisioningStatus,
  type ProvisioningStep,
  type ProvisioningStepStatus,
} from '@tivexy/core';
import { CircleAlert, CircleCheck, CircleDashed, CircleMinus, Undo2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ACAO_DE_PLATAFORMA, ETAPA, EXECUCAO, NOME_DA_ETAPA } from '@/lib/admin/labels';
import { formatInstant } from '@/lib/format';

export interface EtapaNaTela {
  etapa: string;
  posicao: number;
  situacao: string;
  tentativas: number;
  erro: string | null;
}

export interface ExecucaoNaTela {
  id: string;
  situacao: string;
  blueprint: string | null;
  tentativas: number;
  etapaAtual: string | null;
  erro: string | null;
  inicio: string | null;
  fim: string | null;
  criada: string;
  etapas: EtapaNaTela[];
}

export interface RegistroNaTela {
  id: string;
  acao: string;
  quem: string;
  quando: string;
  detalhe: string | null;
}

function nomeDaEtapa(etapa: string): string {
  return NOME_DA_ETAPA[etapa as ProvisioningStep] ?? etapa;
}

function IconeDaEtapa({ situacao }: { situacao: string }) {
  const classe = 'size-4 shrink-0';
  switch (situacao) {
    case 'succeeded':
      return <CircleCheck className={`${classe} text-success`} aria-hidden />;
    case 'failed':
      return <CircleAlert className={`${classe} text-danger`} aria-hidden />;
    case 'compensated':
      return <Undo2 className={`${classe} text-content-subtle`} aria-hidden />;
    case 'skipped':
      return <CircleMinus className={`${classe} text-content-subtle`} aria-hidden />;
    default:
      return <CircleDashed className={`${classe} text-content-subtle`} aria-hidden />;
  }
}

/**
 * Cada vez que o provisionamento rodou para esta empresa — e, dentro de cada
 * uma, cada etapa: onde parou, quantas tentativas, o erro. É o que responde
 * "o que aconteceu com este cliente?" sem abrir o banco.
 */
export function ProvisioningHistory({
  execucoes,
  fuso,
}: {
  execucoes: readonly ExecucaoNaTela[];
  fuso: string;
}) {
  if (execucoes.length === 0) {
    return (
      <p className="text-sm text-content-muted">
        Nenhuma execução registrada — a empresa foi criada antes do provisionamento existir, ou por
        fora dele.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {execucoes.map((e) => {
        const rotulo = PROVISIONING_STATUSES.includes(e.situacao as ProvisioningStatus)
          ? EXECUCAO[e.situacao as ProvisioningStatus]
          : { rotulo: e.situacao, tom: 'neutral' as const };
        return (
          <li key={e.id} className="rounded-lg border border-line-subtle">
            <details open={e.situacao === 'failed'}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <Badge tone={rotulo.tom}>{rotulo.rotulo}</Badge>
                <span className="text-content">
                  {e.blueprint === null ? 'Sem Blueprint registrado' : `Blueprint ${e.blueprint}`}
                </span>
                <span className="text-content-subtle tabular-nums">
                  {formatInstant(e.inicio ?? e.criada, fuso)}
                  {e.fim !== null ? ` → ${formatInstant(e.fim, fuso)}` : ''}
                </span>
                {e.tentativas > 1 && (
                  <span className="text-content-subtle">{e.tentativas} tentativas</span>
                )}
              </summary>
              <div className="border-t border-line-subtle px-4 py-3">
                {e.erro !== null && (
                  <p className="mb-2 text-sm break-words text-danger">
                    Parou em &quot;{nomeDaEtapa(e.etapaAtual ?? '—')}&quot;: {e.erro}
                  </p>
                )}
                <ol className="flex flex-col gap-1.5">
                  {e.etapas.map((etapa) => (
                    <li key={etapa.etapa} className="flex items-start gap-2 text-sm">
                      <IconeDaEtapa situacao={etapa.situacao} />
                      <span className="min-w-0">
                        <span className="text-content-default">{nomeDaEtapa(etapa.etapa)}</span>
                        <span className="text-content-subtle">
                          {' — '}
                          {PROVISIONING_STEP_STATUSES.includes(
                            etapa.situacao as ProvisioningStepStatus,
                          )
                            ? ETAPA[etapa.situacao as ProvisioningStepStatus]
                            : etapa.situacao}
                          {etapa.tentativas > 1 ? `, ${etapa.tentativas} tentativas` : ''}
                        </span>
                        {etapa.erro !== null && (
                          <span className="block text-xs break-words text-danger">
                            {etapa.erro}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

export function PlatformLog({
  registros,
  fuso,
}: {
  registros: readonly RegistroNaTela[];
  fuso: string;
}) {
  if (registros.length === 0) {
    return <p className="text-sm text-content-muted">Nenhuma decisão registrada ainda.</p>;
  }
  return (
    <ol className="flex flex-col divide-y divide-line-subtle">
      {registros.map((r) => (
        <li key={r.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:gap-3">
          <time dateTime={r.quando} className="shrink-0 text-content-subtle tabular-nums sm:w-36">
            {formatInstant(r.quando, fuso)}
          </time>
          <span className="min-w-0">
            <span className="font-medium text-content">{ACAO_DE_PLATAFORMA[r.acao] ?? r.acao}</span>
            <span className="text-content-muted"> — {r.quem}</span>
            {r.detalhe !== null && (
              <span className="block break-words text-content-muted">{r.detalhe}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
