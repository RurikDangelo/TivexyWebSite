import type { Term } from '@tivexy/core';
import { CircleAlert, CircleCheck, History, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { TBody, TD, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';
import { linkDoEvento, resumoDoEvento } from '@/lib/automation/rule-text';
import { formatInstant } from '@/lib/format';

import type { ExecucaoNaTela } from './state';

const COLUNAS = 5;

/**
 * O registro do motor: cada vez que uma automação rodou — e, quando falhou,
 * o motivo. É o que responde "por que o aviso não chegou?" sem abrir o banco.
 *
 * Ícone e palavra juntos: a cor não carrega sozinha o "deu certo".
 *
 * Sem animação de entrada, de propósito. A coreografia da tela é da tabela de
 * automações, acima (seção 8, regra 1: um evento de entrada por tela). Antes
 * esta lista usava `animate-enter` sem atraso nenhum, o que fazia as quarenta
 * linhas aparecerem em bloco — o efeito que o escalonamento existe para evitar.
 */
export function RunList({
  execucoes,
  nomes,
  fuso,
  automacao,
  erro,
  teto,
}: {
  execucoes: readonly ExecucaoNaTela[];
  nomes: ReadonlyMap<string, string>;
  fuso: string;
  automacao: Term;
  /** A leitura falhou. Lista vazia então não significa "nada rodou". */
  erro: boolean;
  /** Quantas linhas a consulta pede no máximo. Atingido o teto, a lista está cortada. */
  teto: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Table rotulo="Últimas execuções das automações" densidade="densa">
        <THead sticky>
          <TR>
            <TH>Resultado</TH>
            <TH>Automação</TH>
            <TH>O que aconteceu</TH>
            <TH>Evento</TH>
            <TH alinhamento="fim">Quando</TH>
          </TR>
        </THead>
        <TBody>
          {erro ? (
            <TableEmpty
              colunas={COLUNAS}
              icone={TriangleAlert}
              titulo="Não consegui ler o registro de execuções"
            >
              O motor pode ter rodado — só não sei dizer. Recarregue a página em instantes.
            </TableEmpty>
          ) : execucoes.length === 0 ? (
            <TableEmpty colunas={COLUNAS} icone={History} titulo="Nada rodou ainda">
              Quando um evento combinar com {automacao.singular} em vigor, a execução aparece aqui —
              inclusive a que falhar, com o motivo.
            </TableEmpty>
          ) : (
            execucoes.map((e) => {
              const link = linkDoEvento(e.gatilho, e.payload);
              const evento = resumoDoEvento(e.gatilho, e.payload);
              return (
                <TR key={e.id}>
                  <TD rotulo="Resultado">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {e.deuCerto ? (
                        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                      ) : (
                        <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden />
                      )}
                      <span className={e.deuCerto ? 'text-content-default' : 'text-danger'}>
                        {e.deuCerto ? 'Deu certo' : 'Falhou'}
                      </span>
                    </span>
                  </TD>
                  <TD rotulo="Automação" truncar>
                    {nomes.get(e.regraId) ?? 'Sem nome'}
                  </TD>
                  <TD rotulo="O que aconteceu">
                    <span className={e.deuCerto ? undefined : 'text-danger'}>
                      {e.deuCerto ? (e.detalhe ?? 'rodou') : (e.detalhe ?? 'sem motivo registrado')}
                    </span>
                  </TD>
                  <TD rotulo="Evento" truncar>
                    {evento === '' ? (
                      <span className="text-content-subtle">—</span>
                    ) : link === null ? (
                      evento
                    ) : (
                      <Link href={link} className="underline-offset-2 hover:underline">
                        {evento}
                      </Link>
                    )}
                  </TD>
                  <TD rotulo="Quando" numerico>
                    <time dateTime={e.quando}>{formatInstant(e.quando, fuso)}</time>
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>

      {/*
       * A consulta para no teto. Sem esta linha, "nenhuma falha na lista" seria
       * lido como "nenhuma falha", e a última execução mais antiga passaria por
       * primeira execução de todas (CLAUDE.md).
       */}
      {execucoes.length >= teto && (
        <p className="text-caption text-content-subtle">
          Mostrando as {teto} execuções mais recentes. O registro completo fica no banco.
        </p>
      )}
    </div>
  );
}
