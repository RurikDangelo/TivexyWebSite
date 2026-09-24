import { ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ERP_SALE_LABEL, type ErpSaleStatus, formatCents, formatInstant } from '@tivexy/core';
import type { Opcao } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { parametro, umDentre } from '@/lib/crm/busca';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import { NovaVenda } from './forms';
import type { VendaListada } from './state';

export const metadata: Metadata = { title: 'Vendas' };

const RECORTES = ['todas', 'rascunhos', 'confirmadas'] as const;

const TOM: Record<ErpSaleStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
};

/**
 * As vendas.
 *
 * O rascunho aparece na mesma lista das confirmadas, e não numa aba separada:
 * venda esquecida em rascunho é dinheiro que ninguém cobrou, e esconder num
 * lugar que precisa ser procurado é como ela fica esquecida.
 */
export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/erp/vendas');
  if (choice.kind !== 'resolved') return null;

  const recorte = umDentre(parametro(await searchParams, 'estado'), RECORTES, 'todas');
  const supabase = await supabaseServer();
  const fuso = await currentTimeZone();

  let consulta = supabase
    .from('erp_sales')
    .select('id, number, status, total_cents, created_at, sold_at, crm_companies(name)')
    .eq('tenant_id', choice.tenant.id);

  if (recorte === 'rascunhos') consulta = consulta.eq('status', 'draft');
  else if (recorte === 'confirmadas') consulta = consulta.eq('status', 'confirmed');

  const [{ data, error }, clientesResposta, tenantResposta] = await Promise.all([
    consulta.order('created_at', { ascending: false }).limit(100),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', choice.tenant.id)
      .order('name')
      .limit(200),
    supabase.from('tenants').select('settings').eq('id', choice.tenant.id).maybeSingle(),
  ]);

  const vendas: VendaListada[] = (data ?? []).map((linha) => ({
    id: String(linha.id),
    numero: linha.number === null ? null : Number(linha.number),
    status: linha.status as ErpSaleStatus,
    cliente: nomeAninhado(linha.crm_companies),
    totalCents: Number(linha.total_cents),
    criadaEm: String(linha.created_at),
    vendidaEm: (linha.sold_at as string | null) ?? null,
  }));

  const clientes: Opcao[] = (clientesResposta.data ?? []).map((linha) => ({
    valor: String(linha.id),
    texto: String(linha.name),
  }));

  /*
   * A configuração vem do tenant, com o padrão do Core quando a chave não
   * está gravada — `resolveSettings()` só grava o que o nicho mudou, de
   * propósito, para que um padrão novo alcance todo tenant que já existe.
   */
  const settings = (
    typeof tenantResposta.data?.settings === 'object' && tenantResposta.data.settings !== null
      ? tenantResposta.data.settings
      : {}
  ) as Record<string, unknown>;
  const exigeCliente = settings['erp.sales_requires_customer'] !== false;

  const rascunhos = vendas.filter((v) => v.status === 'draft');
  const faturado = vendas
    .filter((v) => v.status === 'confirmed')
    .reduce((soma, v) => soma + v.totalCents, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">Vendas</h1>
        <p className="mt-1 text-content-muted">
          {vendas.length === 0
            ? 'Nenhuma venda ainda.'
            : `${vendas.length} ${vendas.length === 1 ? 'venda' : 'vendas'}, ${formatCents(faturado)} confirmados.`}
        </p>
      </header>

      <div className="mb-6">
        <NovaVenda clientes={clientes} exigeCliente={exigeCliente} />
      </div>

      {rascunhos.length > 0 && (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {rascunhos.length === 1 ? 'Uma venda está' : `${rascunhos.length} vendas estão`} em
          rascunho. Rascunho não baixou estoque nem gerou recebimento — se já aconteceu no balcão,
          falta confirmar.
        </p>
      )}

      <nav aria-label="Recortes" className="mb-4 flex flex-wrap gap-1.5">
        {RECORTES.map((opcao) => (
          <Link
            key={opcao}
            href={opcao === 'todas' ? '/erp/vendas' : `/erp/vendas?estado=${opcao}`}
            aria-current={opcao === recorte ? 'page' : undefined}
            className={
              opcao === recorte
                ? 'rounded-md border border-transparent bg-surface-brand px-3 py-1.5 text-sm text-content-on-brand'
                : 'rounded-md border border-line-strong px-3 py-1.5 text-sm text-content-default transition-colors hover:bg-surface-muted'
            }
          >
            {opcao === 'todas' ? 'Todas' : opcao === 'rascunhos' ? 'Rascunhos' : 'Confirmadas'}
          </Link>
        ))}
      </nav>

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler as vendas</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {vendas.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <ShoppingCart className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhuma venda ainda</CardTitle>
            <CardDescription>
              Abra a primeira com o botão acima. Ela nasce rascunho: nada acontece no estoque nem no
              financeiro até você confirmar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {vendas.map((venda) => (
            <li key={venda.id} className="border-b border-line-subtle last:border-b-0">
              <Link
                href={`/erp/vendas/${venda.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition-colors hover:bg-surface-muted"
              >
                <span className="w-16 font-mono text-sm text-content-subtle">
                  {venda.numero === null ? '—' : `#${venda.numero}`}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-content">{venda.cliente ?? 'Balcão'}</span>
                  <span className="block text-xs text-content-subtle">
                    {formatInstant(new Date(venda.vendidaEm ?? venda.criadaEm), fuso)}
                  </span>
                </span>

                <Badge tone={TOM[venda.status]}>{ERP_SALE_LABEL[venda.status]}</Badge>

                <span className="w-28 text-right font-mono text-sm text-content">
                  {formatCents(venda.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
