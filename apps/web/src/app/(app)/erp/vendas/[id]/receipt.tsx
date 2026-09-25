import { type FinanceStatus, formatCents } from '@tivexy/core';
import { CircleCheck, Plus, Receipt } from 'lucide-react';
import Link from 'next/link';

import { type Fato, Facts } from '@/components/page/facts';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  quando: string;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  itens: readonly ItemDoRecibo[];
  pagamentos: readonly PagamentoDoRecibo[];
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
 * Só desenha: a página decide o que entra e o que cada pessoa pode ver.
 */
export function SaleReceipt(r: ReciboProps) {
  const cancelada = r.cancelamento !== null;
  return (
    <>
      {r.registrada && !cancelada && (
        <div
          role="status"
          className="animate-enter mb-6 flex flex-col gap-3 rounded-lg border border-success/40 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 font-medium text-success">
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

      <header className="mb-6 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-muted dark:bg-surface-inset">
          <Receipt className="size-6 text-content-subtle" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-content sm:text-3xl">
            {r.titulo}
            {cancelada && <Badge tone="danger">Cancelamento</Badge>}
          </h1>
          <p className="text-content-muted">
            {r.quando} · {formatCents(r.totalCentavos)}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-line-subtle">
                {r.itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-content">{item.descricao}</p>
                      <p className="font-mono text-xs tabular-nums text-content-muted">
                        {item.quantidade} × {formatCents(item.unitarioCentavos)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono tabular-nums text-content">
                      {formatCents(item.totalCentavos)}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="mt-3 flex flex-col gap-1 border-t border-line-subtle pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-content-muted">Itens</dt>
                  <dd className="font-mono tabular-nums">{formatCents(r.subtotalCentavos)}</dd>
                </div>
                {r.descontoCentavos > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-content-muted">Desconto</dt>
                    <dd className="font-mono tabular-nums">− {formatCents(r.descontoCentavos)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-base font-medium">
                  <dt>Total</dt>
                  <dd className="font-mono tabular-nums">{formatCents(r.totalCentavos)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              {r.pagamentos.length === 0 ? (
                <p className="text-sm text-content-muted">Sem pagamento — o total foi zero.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line-subtle">
                  {r.pagamentos.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="text-content">{p.forma}</p>
                        <p className="text-xs text-content-muted">{p.quando}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono tabular-nums text-content">
                          {formatCents(p.valorCentavos)}
                        </span>
                        {p.situacao !== null && (
                          <Badge tone={SITUACAO[p.situacao].tom}>
                            {SITUACAO[p.situacao].rotulo}
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {r.devolucao !== null && (
                <p className="mt-3 rounded-md bg-surface-subtle p-3 text-sm text-content-default">
                  Devolução de {formatCents(r.devolucao.valorCentavos)} a pagar
                  {r.devolucao.pagaEm !== null
                    ? ` — paga em ${r.devolucao.pagaEm}.`
                    : ' — registre no financeiro quando o dinheiro voltar ao cliente.'}
                </p>
              )}
            </CardContent>
          </Card>

          {r.observacao !== null && (
            <Card>
              <CardHeader>
                <CardTitle>Observação</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-content-default">{r.observacao}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card className="h-fit">
            <CardContent className="pt-5">
              <Facts fatos={r.fatos} />
            </CardContent>
          </Card>

          {r.cancelamento !== null && (
            <Card className="h-fit border-danger/40">
              <CardHeader>
                <CardTitle>Cancelamento</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p className="break-words text-content">{r.cancelamento.motivo}</p>
                <p className="text-xs text-content-muted">
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

          <p className="text-xs text-content-subtle">
            Comprovante interno. Não é documento fiscal.
          </p>
        </div>
      </div>
    </>
  );
}
