'use client';

import type { ProvisioningStep } from '@tivexy/core';
import { RotateCcw, TriangleAlert, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { FormFeedback } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog } from '@/components/ui/dialog';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { NOME_DA_ETAPA } from '@/lib/admin/labels';

import { desfazerProvisionamento, retomarProvisionamento } from './recovery';
import { RECUPERACAO_INICIAL, type RecoveryState } from './state';

export interface FalhaResumo {
  runId: string;
  tenantName: string;
  tenantSlug: string;
  etapa: string;
  erro: string;
  temEntrada: boolean;
}

function nomeDaEtapa(etapa: string): string {
  return NOME_DA_ETAPA[etapa as ProvisioningStep] ?? etapa;
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
 *
 * ## Duas correções que mudam comportamento
 *
 * 1. **A guarda de lista vazia desceu.** `if (falhas.length === 0) return null`
 *    ficava ANTES do bloco de mensagens: quando "Retomar" dava certo, o
 *    `revalidatePath` esvaziava a lista, o componente devolvia `null` e a
 *    confirmação que a ação tinha acabado de produzir nunca chegava à tela. A
 *    pessoa clicava, a linha sumia e ela não sabia se tinha dado certo. Agora o
 *    cartão sobrevive à lista vazia enquanto houver o que dizer.
 *
 * 2. **Desfazer virou diálogo com o nome digitado.** É a ação mais destrutiva
 *    do sistema — apaga a identidade no Auth e cancela o cliente, estado do
 *    qual a própria UI diz não haver volta — e disparava com um clique só,
 *    enquanto trocar de plano, que é reversível, pedia confirmação.
 *
 * `useActionState` saiu no caminho: a ação de servidor é chamada direto dentro
 * da ação de formulário, e é isso que dá `useFormStatus` de verdade ao `Submit`
 * e ao botão do diálogo — o dispatch de `useActionState` retorna na hora, e o
 * diálogo fechava antes de o servidor responder.
 */
export function FailedRuns({ falhas }: { falhas: readonly FalhaResumo[] }) {
  const [retomada, setRetomada] = useState<RecoveryState>(RECUPERACAO_INICIAL);
  const [desfeito, setDesfeito] = useState<RecoveryState>(RECUPERACAO_INICIAL);

  async function retomar(dados: FormData) {
    setRetomada(await retomarProvisionamento(dados));
  }

  async function desfazer(dados: FormData) {
    setDesfeito(await desfazerProvisionamento(dados));
  }

  const erro = retomada.erro ?? desfeito.erro;
  const aviso = retomada.aviso ?? desfeito.aviso;

  /* Sem falha e sem nada a dizer, o cartão não tem assunto. */
  if (falhas.length === 0 && erro === null && aviso === null) return null;

  return (
    <Card className="border-warning">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <CardTitle>Provisionamentos parados no meio</CardTitle>
        </div>
        <CardDescription>
          O cliente existe e não opera. Retomar continua de onde parou, sem repetir etapa concluída;
          desfazer reverte na ordem inversa e cancela o cliente.
        </CardDescription>
      </CardHeader>

      {(erro !== null || aviso !== null) && (
        <CardContent className="pb-[var(--card-pad-tight,0.75rem)]">
          <FormFeedback estado={{ erro, ok: aviso }} />
        </CardContent>
      )}

      {falhas.length > 0 && (
        /* Sem moldura própria: o Card já é a moldura, e borda dentro de borda é ruído. */
        <div className="border-t border-line-subtle">
          <Table densidade="densa" moldura="nenhuma" rotulo="Provisionamentos que falharam">
            <THead>
              <tr>
                <TH>Cliente</TH>
                <TH>Parou em</TH>
                <TH className="hidden max-md:block lg:table-cell">Erro</TH>
                <TH alinhamento="fim">Ações</TH>
              </tr>
            </THead>
            <TBody>
              {falhas.map((falha) => (
                <TR key={falha.runId}>
                  <TD truncar>
                    <span className="block truncate font-medium text-content">
                      {falha.tenantName}
                    </span>
                    <span className="block truncate font-mono text-caption text-content-subtle">
                      {falha.tenantSlug}
                    </span>
                  </TD>

                  <TD rotulo="Parou em">
                    {/* O enum do banco (`create_admin`) não vai para a tela em português. */}
                    <Badge tone="warning">{nomeDaEtapa(falha.etapa)}</Badge>
                  </TD>

                  <TD rotulo="Erro" truncar className="hidden max-md:flex lg:table-cell">
                    <span className="text-caption text-content-muted">{falha.erro}</span>
                  </TD>

                  <TD acoes>
                    <AcoesDaFalha falha={falha} retomar={retomar} desfazer={desfazer} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

interface AcoesProps {
  falha: FalhaResumo;
  retomar: (dados: FormData) => Promise<void>;
  desfazer: (dados: FormData) => Promise<void>;
}

/**
 * As duas saídas de uma execução parada.
 *
 * Componente à parte porque o diálogo de desfazer tem estado de aberto/fechado
 * por linha — mantê-lo no pai faria uma confirmação valer para a linha errada.
 */
function AcoesDaFalha({ falha, retomar, desfazer }: AcoesProps) {
  const [aberto, setAberto] = useState(false);

  const botaoRetomar = (
    <Submit variant="outline" size="xs" pendente="Retomando…" disabled={!falha.temEntrada}>
      <RotateCcw aria-hidden />
      Retomar
    </Submit>
  );

  return (
    <div className="flex items-center justify-end gap-2">
      <form action={retomar}>
        <input type="hidden" name="runId" value={falha.runId} />
        {falha.temEntrada ? (
          botaoRetomar
        ) : (
          /*
           * `title=` nativo não aparece para quem navega por teclado e some no
           * toque. A dica continua no HTML mesmo fechada, ligada ao botão por
           * `aria-describedby` — que é o único canal que um botão desabilitado
           * tem para explicar por que está assim.
           */
          <Tooltip conteudo="Esta execução não guardou a entrada: o e-mail de quem administraria não foi registrado, e sem ele não há o que retomar.">
            {botaoRetomar}
          </Tooltip>
        )}
      </form>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setAberto(true)}
        className="text-danger hover:bg-danger-soft hover:text-danger"
      >
        <Undo2 aria-hidden />
        Desfazer
      </Button>

      <AlertDialog
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        severidade="danger"
        titulo={`Desfazer o provisionamento de ${falha.tenantName}?`}
        descricao="Não há caminho de volta por esta tela: um cliente cancelado não se reativa aqui."
        confirmarRotulo="Desfazer o provisionamento"
        confirmarAction={desfazer}
        exigirTexto={falha.tenantName}
      >
        <input type="hidden" name="runId" value={falha.runId} />
        {/*
         * O que a compensação faz de fato, na ordem em que faz — e o que ela
         * não faz. "Apagado" seria mentira: o banco cancela e guarda.
         */}
        <ul className="flex list-disc flex-col gap-1 pl-4 text-body text-content-muted">
          <li>A conta de acesso do administrador é apagada na autenticação.</li>
          <li>
            As etapas concluídas são revertidas na ordem inversa e a empresa fica{' '}
            <strong className="font-medium text-content">cancelada</strong>.
          </li>
          <li>O histórico da execução é preservado: nada some da auditoria.</li>
        </ul>
      </AlertDialog>
    </div>
  );
}
