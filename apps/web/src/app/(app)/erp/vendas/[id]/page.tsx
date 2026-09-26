import {
  addDays,
  can,
  dateIn,
  financeStatus,
  formatDocument,
  formatQuantity,
  isProductUnit,
  todayIn,
} from '@tivexy/core';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { Fato } from '@/components/page/facts';
import { NoTenant } from '@/components/page/no-tenant';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { SaleReceipt } from './receipt';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'erp.sales').singular) };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/**
 * Uma venda, como comprovante — e o que ela provocou.
 *
 * Além dos itens e do pagamento, a página mostra o rastro nos outros módulos
 * para quem pode vê-lo: quando cada pagamento entra no caixa e se já entrou.
 * É a resposta a "o cartão dessa venda já caiu?", sem abrir o financeiro.
 *
 * **Não é documento fiscal**, e a página diz isso.
 */
export default async function VendaPage({ params, searchParams }: PageProps<'/erp/vendas/[id]'>) {
  const { choice, viewer } = await requireAccess('/erp/vendas');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { registrada } = await searchParams;

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const { data: venda } = await supabase
    .from('erp_sales')
    .select(
      'id, number, status, sold_at, subtotal_cents, discount_cents, total_cents, notes, created_by, cancelled_at, cancelled_by, cancel_reason, customer:erp_customers(id, name, document)',
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (venda === null) notFound();

  const terms = await currentTerms();
  const rotulo = termOf(terms, 'erp.sales');
  const titulo = `${capitalizar(rotulo.singular)} nº ${String(venda.number)}`;
  const cancelada = venda.status === 'cancelled';
  const podeCancelar = !cancelada && can(viewer, 'erp.sales.cancel');
  const veFinanceiro =
    viewer.enabledModules.has('finance') &&
    (can(viewer, 'finance.receivables.read') || can(viewer, 'finance.cashflow.read'));

  const [itensR, pagamentosR, lancamentosR, membros, fuso] = await Promise.all([
    supabase
      .from('erp_sale_items')
      .select('id, description, unit, quantity, unit_price_cents, total_cents')
      .eq('tenant_id', tenantId)
      .eq('sale_id', id)
      .order('position'),
    supabase
      .from('erp_sale_payments')
      .select('id, method_name, settlement_days, amount_cents')
      .eq('tenant_id', tenantId)
      .eq('sale_id', id)
      .order('position'),
    veFinanceiro
      ? supabase
          .from('finance_entries')
          .select('sale_payment_id, direction, amount_cents, due_date, paid_on, cancelled_at')
          .eq('tenant_id', tenantId)
          .eq('sale_id', id)
      : Promise.resolve({ data: [] }),
    tenantMembers(tenantId),
    tenantTimeZone(),
  ]);

  const hoje = todayIn(fuso);
  const diaDaVenda = dateIn(String(venda.sold_at), fuso);
  const lancamentos = lancamentosR.data ?? [];
  const lancamentoDo = new Map(
    lancamentos
      .filter((l) => typeof l.sale_payment_id === 'string')
      .map((l) => [String(l.sale_payment_id), l]),
  );
  const devolucao = lancamentos.find((l) => l.direction === 'payable') ?? null;
  const cliente = relacao<{ id: string; name: string; document: string | null }>(venda.customer);

  const fatos: Fato[] = [
    { rotulo: 'Quando', valor: formatInstant(String(venda.sold_at), fuso) },
    {
      rotulo: 'Quem registrou',
      valor: nomeDe(membros, typeof venda.created_by === 'string' ? venda.created_by : null),
    },
    {
      rotulo: capitalizar(termOf(terms, 'erp.customers').singular),
      valor:
        cliente === null ? null : (
          <>
            {cliente.name}
            {cliente.document !== null && (
              <span className="block font-mono text-xs text-content-muted">
                {formatDocument(cliente.document)}
              </span>
            )}
          </>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/erp/vendas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/erp/vendas')}
      </Link>

      <SaleReceipt
        id={String(venda.id)}
        titulo={titulo}
        quando={formatInstant(String(venda.sold_at), fuso)}
        subtotalCentavos={Number(venda.subtotal_cents)}
        descontoCentavos={Number(venda.discount_cents)}
        totalCentavos={Number(venda.total_cents)}
        itens={(itensR.data ?? []).map((item) => ({
          id: String(item.id),
          descricao: String(item.description),
          quantidade: formatQuantity(
            Number(item.quantity),
            isProductUnit(item.unit) ? item.unit : 'un',
          ),
          unitarioCentavos: Number(item.unit_price_cents),
          totalCentavos: Number(item.total_cents),
        }))}
        pagamentos={(pagamentosR.data ?? []).map((p) => {
          const prazo = Number(p.settlement_days);
          const lanc = lancamentoDo.get(String(p.id));
          return {
            id: String(p.id),
            forma: String(p.method_name),
            valorCentavos: Number(p.amount_cents),
            quando:
              prazo === 0
                ? 'Entrou no caixa na hora'
                : `Entra no caixa em ${formatDate(addDays(diaDaVenda, prazo))}`,
            situacao:
              lanc === undefined
                ? null
                : financeStatus(
                    {
                      paidAt: typeof lanc.paid_on === 'string' ? lanc.paid_on : null,
                      cancelledAt: typeof lanc.cancelled_at === 'string' ? lanc.cancelled_at : null,
                      dueDate: String(lanc.due_date),
                    },
                    hoje,
                  ),
          };
        })}
        devolucao={
          devolucao === null
            ? null
            : {
                valorCentavos: Number(devolucao.amount_cents),
                pagaEm:
                  typeof devolucao.paid_on === 'string' ? formatDate(devolucao.paid_on) : null,
              }
        }
        observacao={typeof venda.notes === 'string' && venda.notes !== '' ? venda.notes : null}
        fatos={fatos}
        cancelamento={
          cancelada
            ? {
                motivo: String(venda.cancel_reason ?? ''),
                quando:
                  typeof venda.cancelled_at === 'string'
                    ? formatInstant(venda.cancelled_at, fuso)
                    : '—',
                quem:
                  nomeDe(
                    membros,
                    typeof venda.cancelled_by === 'string' ? venda.cancelled_by : null,
                  ) ?? '—',
              }
            : null
        }
        podeCancelar={podeCancelar}
        rotuloParaCancelar={`${rotulo.singular} nº ${String(venda.number)}`}
        registrada={registrada === '1'}
        podeVender={can(viewer, 'erp.sales.write')}
      />
    </div>
  );
}
