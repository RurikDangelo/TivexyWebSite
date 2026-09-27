import {
  PROVISIONING_STATUSES,
  PROVISIONING_STEP_STATUSES,
  type ProvisioningStatus,
  type ProvisioningStep,
  type ProvisioningStepStatus,
} from '@tivexy/core';
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  History,
  ScrollText,
  Undo2,
} from 'lucide-react';

import { EmptyState } from '@/components/page/empty-state';
import { Badge } from '@/components/ui/badge';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
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
 *
 * `<details>` continua sendo a base: abre sem JavaScript, é alcançável por
 * teclado e o navegador cuida do estado. O que faltava era a afordância — o
 * único sinal de que aquilo abria era o cursor mudar de forma, que ninguém vê
 * antes de chegar lá com o mouse. Agora há um chevron que gira.
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
      <EmptyState
        icone={History}
        titulo="Nenhuma execução registrada"
        densidade="compacta"
        moldura={false}
      >
        A empresa existe, mas não passou pelo provisionamento — foi criada antes de ele existir, ou
        por fora dele. Módulos, papéis e dados de partida podem não ter sido aplicados; a lista de
        módulos acima é a fonte de verdade sobre o que está ligado.
      </EmptyState>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {execucoes.map((e) => {
        const rotulo = PROVISIONING_STATUSES.includes(e.situacao as ProvisioningStatus)
          ? EXECUCAO[e.situacao as ProvisioningStatus]
          : { rotulo: e.situacao, tom: 'neutral' as const };
        return (
          <li key={e.id} className="rounded-card border border-line-subtle">
            {/*
             * O chevron gira quando o `<details>` abre — CSS puro, sem estado e
             * sem cliente. `rounded-card` no `<summary>` porque a regra de foco
             * desenha o anel para fora e o elemento sem raio próprio mudava de
             * forma ao receber foco.
             */}
            <details open={e.situacao === 'failed'} className="group/exec">
              {/* `list-none` esconde o marcador em Chrome e Firefox; o Safari só some com o pseudo dele. */}
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-card px-4 py-3 text-body transition-colors transition-base hover:bg-surface-subtle [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-4 shrink-0 text-content-subtle transition-transform transition-base group-open/exec:rotate-90"
                  aria-hidden
                />
                <Badge tone={rotulo.tom}>{rotulo.rotulo}</Badge>
                <span className="text-content">
                  {e.blueprint === null ? 'Sem Blueprint registrado' : `Blueprint ${e.blueprint}`}
                </span>
                <span className="text-caption text-content-subtle tabular-nums">
                  {formatInstant(e.inicio ?? e.criada, fuso)}
                  {e.fim !== null ? ` → ${formatInstant(e.fim, fuso)}` : ''}
                </span>
                {e.tentativas > 1 && (
                  <span className="text-caption text-content-subtle">
                    {e.tentativas} tentativas
                  </span>
                )}
              </summary>

              <div className="border-t border-line-subtle px-4 py-3">
                {e.erro !== null && (
                  <p className="mb-2 text-body break-words text-danger">
                    Parou em &quot;{nomeDaEtapa(e.etapaAtual ?? '—')}&quot;: {e.erro}
                  </p>
                )}
                <ol className="flex flex-col gap-1.5">
                  {e.etapas.map((etapa) => (
                    <li key={etapa.etapa} className="flex items-start gap-2 text-body">
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
                          <span className="block text-caption break-words text-danger">
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

/**
 * O que a plataforma decidiu sobre esta empresa, em tabela.
 *
 * Era uma lista de `<li>` com o instante flutuando à esquerda. Como tabela, a
 * coluna de data alinha de verdade (`tabular-nums` numa coluna só), e quem
 * varre o histórico lê as três perguntas na mesma ordem em toda linha: quando,
 * o quê, quem.
 */
export function PlatformLog({
  registros,
  fuso,
}: {
  registros: readonly RegistroNaTela[];
  fuso: string;
}) {
  if (registros.length === 0) {
    return (
      <EmptyState
        icone={ScrollText}
        titulo="Nenhuma decisão registrada ainda"
        densidade="compacta"
        moldura={false}
      >
        Ninguém suspendeu, reativou, trocou o plano nem editou os dados desta empresa. Cada uma
        dessas ações grava um registro aqui na mesma transação em que acontece — e o registro não se
        apaga.
      </EmptyState>
    );
  }

  return (
    <Table densidade="densa" moldura="nenhuma" rotulo="Decisões da plataforma sobre esta empresa">
      <THead>
        <tr>
          <TH>Quando</TH>
          <TH>O que</TH>
          <TH>Quem</TH>
          <TH className="hidden max-md:block lg:table-cell">Detalhe</TH>
        </tr>
      </THead>
      <TBody>
        {registros.map((r) => (
          <TR key={r.id}>
            <TD rotulo="Quando" className="whitespace-nowrap">
              <time dateTime={r.quando} className="text-num text-content-muted">
                {formatInstant(r.quando, fuso)}
              </time>
            </TD>
            <TD rotulo="O que" truncar>
              <span className="font-medium text-content">
                {ACAO_DE_PLATAFORMA[r.acao] ?? r.acao}
              </span>
            </TD>
            <TD rotulo="Quem" truncar>
              {r.quem}
            </TD>
            <TD rotulo="Detalhe" truncar className="hidden max-md:flex lg:table-cell">
              <span className="text-caption text-content-muted">{r.detalhe ?? '—'}</span>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
