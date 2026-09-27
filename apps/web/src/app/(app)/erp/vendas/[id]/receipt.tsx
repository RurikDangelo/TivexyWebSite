import { type FinanceStatus, formatCents } from '@tivexy/core';
import { CircleCheck, Package, Plus, Wallet } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { type Fato, Facts } from '@/components/page/facts';
import { GradeDeRegistro } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TBody, TD, TFoot, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';

import { CancelSaleForm } from './cancel-form';

export interface ItemDoRecibo {
  id: string;
  descricao: string;
  /** Já formatada: "0,335 kg". */
  quantidade: string;
  unitarioCentavos: number;
  totalCentavos: number;
}

export interface PagamentoDoRecibo {
  id: string;
  forma: string;
  valorCentavos: number;
  /** "Entrou no caixa na hora", "Entra no caixa em 25/10/2026". */
  quando: string;
  /** O lançamento no financeiro, para quem pode ver. */
  situacao: FinanceStatus | null;
}

export interface ReciboProps {
  id: string;
  titulo: string;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  itens: readonly ItemDoRecibo[];
  /** A leitura dos itens falhou — diferente de a venda não ter item, que não existe. */
  erroDosItens: boolean;
  pagamentos: readonly PagamentoDoRecibo[];
  erroDosPagamentos: boolean;
  devolucao: { valorCentavos: number; pagaEm: string | null } | null;
  observacao: string | null;
  fatos: readonly Fato[];
  cancelamento: { motivo: string; quando: string; quem: string } | null;
  podeCancelar: boolean;
  /** "venda nº 12" — para o botão e a confirmação. */
  rotuloParaCancelar: string;
  /** Acabou de ser registrada: a faixa de sucesso e o atalho para a próxima. */
  registrada: boolean;
  podeVender: boolean;
}

const SITUACAO: Record<
  FinanceStatus,
  { rotulo: string; tom: 'success' | 'neutral' | 'warning' | 'danger' }
> = {
  paid: { rotulo: 'Entrou', tom: 'success' },
  open: { rotulo: 'A receber', tom: 'neutral' },
  overdue: { rotulo: 'Atrasado', tom: 'danger' },
  cancelled: { rotulo: 'Não vai entrar', tom: 'neutral' },
};

/**
 * A venda como comprovante, e o rastro dela no caixa.
 *
 * Só desenha: a página decide o que entra e o que cada pessoa pode ver. O
 * título e a data são do `PageHeader`, um nível acima — aqui ficam os fatos, o
 * que foi vendido e o que foi pago.
 *
 * Itens e pagamentos são tabela, com o rodapé de totais que só a tabela dá: o
 * fio do `<tfoot>` é o que separa registro de soma sem precisar de um bloco
 * desenhado à parte.
 */
export function SaleReceipt(r: ReciboProps) {
  const cancelada = r.cancelamento !== null;

  return (
    <div className="flex flex-col gap-5">
      {r.registrada && !cancelada && (
        <div
          role="status"
          className="animate-enter flex flex-col gap-3 rounded-card border border-success/40 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-body-lg font-medium text-success">
            <CircleCheck className="size-5 shrink-0" aria-hidden />
            Registro feito: {r.titulo}, {formatCents(r.totalCentavos)}.
          </p>
          {r.podeVender && (
            // O atalho recebe o foco: no balcão, o próximo cliente já está na fila.
            <Link href="/erp/vendas/nova" autoFocus className={buttonVariants()}>
              <Plus aria-hidden />
              Registrar outra
            </Link>
          )}
        </div>
      )}

      <GradeDeRegistro>
        <Card className="h-fit">
          <CardContent className="pt-4">
            <Facts fatos={r.fatos} />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            {r.erroDosItens ? (
              <CardContent>
                <EmptyState estado="erro" titulo="Não consegui ler os itens" densidade="compacta">
                  A lista do que foi vendido não voltou nesta carga. Os totais abaixo vêm da própria
                  venda e continuam valendo.
                </EmptyState>
              </CardContent>
            ) : (
              <Table densidade="densa" moldura="nenhuma" rotulo="Itens da venda">
                <THead>
                  <TR>
                    <TH>Descrição</TH>
                    <TH alinhamento="fim">Quantidade</TH>
                    <TH alinhamento="fim">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.itens.length === 0 ? (
                    <TableEmpty colunas={3} icone={Package} titulo="Nenhum item gravado">
                      A venda existe sem linha de item — o que só acontece quando o registro foi
                      interrompido no meio.
                    </TableEmpty>
                  ) : (
                    r.itens.map((item) => (
                      <TR key={item.id}>
                        <TD rotulo="Descrição" truncar>
                          {item.descricao}
                        </TD>
                        <TD rotulo="Quantidade" numerico>
                          {item.quantidade} × {formatCents(item.unitarioCentavos)}
                        </TD>
                        <TD rotulo="Total" numerico className="text-content">
                          {formatCents(item.totalCentavos)}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
                {/*
                 * Cada linha de total é UMA célula com flex por dentro, não
                 * rótulo numa célula e valor noutra. No modo blocos do celular
                 * as duas células viram dois parágrafos empilhados — e "Total"
                 * numa linha e o valor na seguinte deixa de ser um total.
                 */}
                <TFoot>
                  <TR>
                    <TD colSpan={3}>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-content-muted">Itens</span>
                        <span className="text-num text-content">
                          {formatCents(r.subtotalCentavos)}
                        </span>
                      </span>
                    </TD>
                  </TR>
                  {r.descontoCentavos > 0 && (
                    <TR>
                      <TD colSpan={3}>
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-content-muted">Desconto</span>
                          <span className="text-num text-content">
                            − {formatCents(r.descontoCentavos)}
                          </span>
                        </span>
                      </TD>
                    </TR>
                  )}
                  <TR>
                    <TD colSpan={3}>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-label text-content">Total</span>
                        <span className="text-metric-sm tabular-nums text-content">
                          {formatCents(r.totalCentavos)}
                        </span>
                      </span>
                    </TD>
                  </TR>
                </TFoot>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagamento</CardTitle>
            </CardHeader>
            {r.erroDosPagamentos ? (
              <CardContent>
                <EmptyState
                  estado="erro"
                  titulo="Não consegui ler os pagamentos"
                  densidade="compacta"
                >
                  Não dá para dizer como esta venda foi paga nem se o dinheiro já entrou. Recarregue
                  em instantes.
                </EmptyState>
              </CardContent>
            ) : (
              <Table densidade="densa" moldura="nenhuma" rotulo="Pagamentos da venda">
                <THead>
                  <TR>
                    <TH>Forma</TH>
                    <TH>No caixa</TH>
                    <TH alinhamento="fim">Valor</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.pagamentos.length === 0 ? (
                    <TableEmpty colunas={3} icone={Wallet} titulo="Sem pagamento">
                      O total desta venda foi zero, então não houve o que cobrar.
                    </TableEmpty>
                  ) : (
                    r.pagamentos.map((p) => (
                      <TR key={p.id}>
                        <TD rotulo="Forma" truncar className="text-content">
                          {p.forma}
                        </TD>
                        <TD rotulo="No caixa">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-content-muted">{p.quando}</span>
                            {p.situacao !== null && (
                              <Badge tone={SITUACAO[p.situacao].tom} tamanho="xs">
                                {SITUACAO[p.situacao].rotulo}
                              </Badge>
                            )}
                          </span>
                        </TD>
                        <TD rotulo="Valor" numerico className="text-content">
                          {formatCents(p.valorCentavos)}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            )}
            {r.devolucao !== null && (
              <CardContent className="pt-3">
                <p className="rounded-control bg-surface-sunken p-3 text-body text-content-default">
                  Devolução de {formatCents(r.devolucao.valorCentavos)} a pagar
                  {r.devolucao.pagaEm !== null
                    ? ` — paga em ${r.devolucao.pagaEm}.`
                    : ' — registre no financeiro quando o dinheiro voltar ao cliente.'}
                </p>
              </CardContent>
            )}
          </Card>

          {r.observacao !== null && (
            <Card>
              <CardHeader>
                <CardTitle>Observação</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Medida de leitura no parágrafo, nunca no contêiner: a coluna do meio é larga por um motivo. */}
                <p className="max-w-prose whitespace-pre-wrap text-body text-content-default">
                  {r.observacao}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {r.cancelamento !== null && (
            <Card className="h-fit border-danger/40">
              <CardHeader>
                <CardTitle>Cancelamento</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <p className="max-w-prose break-words text-body text-content">
                  {r.cancelamento.motivo}
                </p>
                <p className="text-caption text-content-muted">
                  {r.cancelamento.quando} · {r.cancelamento.quem}
                </p>
              </CardContent>
            </Card>
          )}

          {r.podeCancelar && !cancelada && (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Cancelar</CardTitle>
              </CardHeader>
              <CardContent>
                <CancelSaleForm id={r.id} rotulo={r.rotuloParaCancelar} />
              </CardContent>
            </Card>
          )}

          <p className="text-caption text-content-subtle">
            Comprovante interno. Não é documento fiscal.
          </p>
        </div>
      </GradeDeRegistro>
    </div>
  );
}
