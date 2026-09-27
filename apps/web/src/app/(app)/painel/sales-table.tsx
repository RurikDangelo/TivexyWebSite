import { formatCents } from '@tivexy/core';

import { TBody, TD, TFoot, TH, THead, TR, Table } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { DiaDeVenda } from '@/lib/painel/dashboard';

/**
 * Os mesmos números do gráfico, em tabela — para quem não o vê, e para quem
 * precisa do valor exato em vez da altura da barra.
 *
 * Server Component de propósito: o gráfico é cliente (medir e capturar o
 * ponteiro exige o navegador), mas noventa linhas de tabela não têm por que
 * atravessar a rede como JavaScript. O painel renderiza esta tabela no
 * servidor e a entrega pronta ao `<SalesChart>`, que só a repassa ao
 * `<ChartFrame>`.
 *
 * Continua dentro de um `<details>`: com eixo, grade e dica de valor, o
 * gráfico passou a responder sozinho as perguntas de leitura, e a tabela é a
 * alternativa equivalente — não a fonte principal.
 */
export function SalesTable({ dias }: { dias: readonly DiaDeVenda[] }) {
  const total = dias.reduce((t, d) => t + d.totalCentavos, 0);
  const registros = dias.reduce((t, d) => t + d.vendas, 0);

  return (
    <details>
      <summary className="inline-flex min-h-6 cursor-pointer items-center rounded-control text-label text-content-accent hover:underline">
        Ver os números de cada dia
      </summary>

      <div className="mt-3">
        <Table densidade="densa" mobile="rolar" rotulo="Vendas por dia" className="min-w-[24rem]">
          <THead>
            <TR>
              <TH>Dia</TH>
              <TH alinhamento="fim">Registros</TH>
              <TH alinhamento="fim">Total</TH>
            </TR>
          </THead>
          <TBody>
            {/* Do mais recente para o mais antigo: a pergunta é quase sempre "e ontem?". */}
            {[...dias].reverse().map((d) => (
              <TR key={d.dia}>
                {/*
                 * Cabeçalho de linha de verdade (`scope="row"`), mas sem o cromo
                 * de cabeçalho de coluna: aqui é o nome do registro, não um
                 * rótulo de faixa.
                 */}
                <TH
                  escopo="row"
                  className="bg-transparent text-body font-normal normal-case text-content-default"
                >
                  {formatDate(d.dia)}
                </TH>
                <TD numerico rotulo="Registros">
                  {d.vendas.toLocaleString('pt-BR')}
                </TD>
                <TD numerico rotulo="Total" className="text-content">
                  {formatCents(d.totalCentavos)}
                </TD>
              </TR>
            ))}
          </TBody>
          <TFoot>
            <TR>
              <TH
                escopo="row"
                className="bg-surface-sunken text-body font-medium normal-case text-content"
              >
                Total do período
              </TH>
              <TD numerico rotulo="Registros" className="font-medium text-content">
                {registros.toLocaleString('pt-BR')}
              </TD>
              <TD numerico rotulo="Total" className="font-medium text-content">
                {formatCents(total)}
              </TD>
            </TR>
          </TFoot>
        </Table>
      </div>
    </details>
  );
}
