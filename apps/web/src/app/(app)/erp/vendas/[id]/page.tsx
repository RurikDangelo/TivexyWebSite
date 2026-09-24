import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ERP_SALE_LABEL,
  type ErpSaleStatus,
  type ErpUnit,
  formatCents,
  formatInstant,
  formatQuantity,
  lineTotalCents,
} from '@tivexy/core';
import type { Opcao } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import { cancelarVenda, mudarDesconto, removerItem } from '../actions';
import { AdicionarItem, ConfirmarVenda, RegistrarPagamento, Remover } from '../forms';
import type { ItemListado, PagamentoListado, ProdutoDeVenda } from '../state';

export const metadata: Metadata = { title: 'Venda' };

const TOM: Record<ErpSaleStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
};

/**
 * A ficha de uma venda.
 *
 * ## O total não é somado aqui
 *
 * `erp_sales.total_cents` é mantido por gatilho a partir dos itens menos o
 * desconto. Esta tela lê e mostra. A soma que ela faz — o total de cada linha
 * — usa `lineTotalCents` do Core, que é **a mesma conta** do gatilho: se as
 * duas divergissem, a soma das linhas não bateria com o total ao lado, e a
 * pessoa não teria como saber qual está certo.
 *
 * ## Rascunho é editável; confirmada, não
 *
 * Depois de confirmar, a venda baixou estoque e gerou recebimento. Editar um
 * item ali teria que refazer as duas coisas, e as duas têm consequência
 * contábil. Enquanto esse caminho não existir, a tela diz isso em vez de
 * oferecer um botão que faria metade.
 */
export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { choice } = await requireAccess('/erp/vendas');
  if (choice.kind !== 'resolved') return null;

  const { id } = await params;
  const supabase = await supabaseServer();
  const fuso = await currentTimeZone();

  const { data: venda } = await supabase
    .from('erp_sales')
    .select(
      'id, number, status, discount_cents, total_cents, notes, created_at, sold_at, crm_companies(name), crm_contacts(name)',
    )
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .maybeSingle();

  /* 404 e não "sem permissão": dizer que a venda existe já entrega a existência. */
  if (venda === null) notFound();

  const [itensResposta, pagamentosResposta, produtosResposta, formasResposta] = await Promise.all([
    supabase
      .from('erp_sale_items')
      .select('id, quantity, unit_price_cents, erp_products(name, unit)')
      .eq('tenant_id', choice.tenant.id)
      .eq('sale_id', id)
      .order('created_at'),
    supabase
      .from('erp_sale_payments')
      .select('id, amount_cents, erp_payment_methods(name)')
      .eq('tenant_id', choice.tenant.id)
      .eq('sale_id', id)
      .order('created_at'),
    supabase
      .from('erp_products')
      .select('id, name, unit, price_cents')
      .eq('tenant_id', choice.tenant.id)
      .eq('is_active', true)
      .order('name')
      .limit(200),
    supabase
      .from('erp_payment_methods')
      .select('id, name')
      .eq('tenant_id', choice.tenant.id)
      .eq('is_active', true)
      .order('position'),
  ]);

  const itens: ItemListado[] = (itensResposta.data ?? []).map((linha) => {
    const produto = (
      Array.isArray(linha.erp_products) ? linha.erp_products[0] : linha.erp_products
    ) as { name?: unknown; unit?: unknown } | null;

    return {
      id: String(linha.id),
      produto: typeof produto?.name === 'string' ? produto.name : '—',
      unit: (produto?.unit ?? 'un') as ErpUnit,
      quantity: Number(linha.quantity),
      unitPriceCents: Number(linha.unit_price_cents),
    };
  });

  const pagamentos: PagamentoListado[] = (pagamentosResposta.data ?? []).map((linha) => ({
    id: String(linha.id),
    forma: nomeAninhado(linha.erp_payment_methods) ?? '—',
    amountCents: Number(linha.amount_cents),
  }));

  const produtos: ProdutoDeVenda[] = (produtosResposta.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    unit: linha.unit as ErpUnit,
    priceCents: Number(linha.price_cents),
  }));

  const formas: Opcao[] = (formasResposta.data ?? []).map((linha) => ({
    valor: String(linha.id),
    texto: String(linha.name),
  }));

  const status = venda.status as ErpSaleStatus;
  const rascunho = status === 'draft';
  const total = Number(venda.total_cents);
  const desconto = Number(venda.discount_cents);
  const pago = pagamentos.reduce((soma, p) => soma + p.amountCents, 0);
  const restante = total - pago;

  const cliente = nomeAninhado(venda.crm_companies) ?? nomeAninhado(venda.crm_contacts);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/erp/vendas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Vendas
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-content">
            {venda.number === null ? 'Rascunho' : `Venda #${String(venda.number)}`}
          </h1>
          <Badge tone={TOM[status]}>{ERP_SALE_LABEL[status]}</Badge>
        </div>
        <p className="mt-1 text-content-muted">
          {cliente ?? 'Balcão — sem cliente identificado'} ·{' '}
          {formatInstant(new Date(String(venda.sold_at ?? venda.created_at)), fuso)}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Itens</CardTitle>
            <CardDescription>
              {rascunho
                ? 'O preço vem do cadastro; digitar outro vale só para esta venda.'
                : 'O preço gravado é o do momento da venda — por isso um relatório antigo não muda quando o cadastro muda.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {itens.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-subtle px-4 py-6 text-center text-sm text-content-muted">
                Nenhum item ainda.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-lg border border-line-subtle">
                {itens.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-b border-line-subtle p-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-content">{item.produto}</span>
                      <span className="block text-xs text-content-subtle">
                        {formatQuantity(item.quantity)} {item.unit} ×{' '}
                        {formatCents(item.unitPriceCents)}
                      </span>
                    </span>

                    <span className="font-mono text-sm text-content">
                      {formatCents(lineTotalCents(item.quantity, item.unitPriceCents))}
                    </span>

                    {rascunho && (
                      <form action={removerItem}>
                        <input type="hidden" name="venda" value={id} />
                        <input type="hidden" name="item" value={item.id} />
                        <Remover>{null}</Remover>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {rascunho && <AdicionarItem vendaId={id} produtos={produtos} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
            <CardDescription>
              Somado dos itens menos o desconto — por gatilho, no banco. Esta tela não digita total.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rascunho && (
              <form action={mudarDesconto} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="venda" value={id} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="desconto" className="text-sm font-medium text-content-default">
                    Desconto
                  </label>
                  <input
                    id="desconto"
                    name="desconto"
                    defaultValue={desconto > 0 ? (desconto / 100).toFixed(2).replace('.', ',') : ''}
                    placeholder="0,00"
                    className="h-9.5 w-32 rounded-md border border-line-field bg-surface px-3 text-sm text-content"
                  />
                </div>
                <button
                  type="submit"
                  className="h-9.5 rounded-md border border-line-strong px-4 text-sm text-content-default transition-colors hover:bg-surface-muted"
                >
                  Aplicar
                </button>
              </form>
            )}

            <dl className="flex flex-col gap-1 border-t border-line-subtle pt-3 text-sm">
              {desconto > 0 && (
                <div className="flex justify-between">
                  <dt className="text-content-muted">Desconto</dt>
                  <dd className="font-mono text-content-muted">−{formatCents(desconto)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="font-medium text-content">Total</dt>
                <dd className="font-mono text-lg font-bold text-content">{formatCents(total)}</dd>
              </div>
              {pagamentos.length > 0 && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-content-muted">Registrado como pago</dt>
                    <dd className="font-mono text-content-muted">{formatCents(pago)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-content-muted">
                      {restante > 0 ? 'Em aberto' : restante < 0 ? 'Registrado a mais' : 'Quitado'}
                    </dt>
                    <dd
                      className={
                        restante === 0 ? 'font-mono text-success' : 'font-mono text-warning'
                      }
                    >
                      {formatCents(Math.abs(restante))}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pagamentos</CardTitle>
            <CardDescription>
              Como o cliente disse que pagou. Registro, não cobrança.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pagamentos.length > 0 && (
              <ul className="overflow-hidden rounded-lg border border-line-subtle">
                {pagamentos.map((pagamento) => (
                  <li
                    key={pagamento.id}
                    className="flex items-center justify-between border-b border-line-subtle p-3 text-sm last:border-b-0"
                  >
                    <span className="text-content">{pagamento.forma}</span>
                    <span className="font-mono text-content">
                      {formatCents(pagamento.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {status !== 'cancelled' && (
              <RegistrarPagamento
                vendaId={id}
                formas={formas}
                restanteCents={Math.max(restante, 0)}
              />
            )}
          </CardContent>
        </Card>

        {rascunho ? (
          <Card>
            <CardHeader>
              <CardTitle>Fechar a venda</CardTitle>
              <CardDescription>
                Até aqui nada aconteceu no estoque nem no financeiro.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ConfirmarVenda vendaId={id} temItens={itens.length > 0} />

              <form action={cancelarVenda} className="border-t border-line-subtle pt-4">
                <input type="hidden" name="venda" value={id} />
                <button
                  type="submit"
                  className="text-sm text-content-muted underline-offset-4 hover:text-danger hover:underline"
                >
                  Descartar este rascunho
                </button>
                <p className="mt-1 text-xs text-content-subtle">
                  Rascunho não gastou número, então descartar não deixa buraco na sequência.
                </p>
              </form>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-muted">
            Venda confirmada não se edita por esta tela. Ela já baixou estoque e gerou o
            recebimento, e desfazer as duas coisas tem consequência contábil — é outro caminho, não
            o oposto simétrico de confirmar. Enquanto ele não existir, o conserto é um ajuste de
            estoque e um lançamento financeiro, cada um com o seu motivo escrito.
          </p>
        )}
      </div>
    </div>
  );
}
