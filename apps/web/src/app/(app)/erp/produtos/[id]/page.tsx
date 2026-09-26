import {
  type InventoryMovementKind,
  UNIT_INFO,
  can,
  formatCents,
  formatCentsInput,
  formatQuantity,
  formatQuantityInput,
  grossMargin,
  isProductUnit,
  stockStatus,
} from '@tivexy/core';
import { ArrowLeft, Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { type Fato, Facts } from '@/components/page/facts';
import { NoTenant } from '@/components/page/no-tenant';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { MOVIMENTO, formatMargin } from '@/lib/erp/labels';
import { formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

import { MovementList, type MovimentoNaTela } from '../../movement-list';
import { EditProductForm } from '../product-form';
import { SituacaoDoEstoque } from '../product-rows';
import { ProductStatusActions } from './status-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'erp.products').singular) };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/**
 * Um produto: quanto custa, quanto rende, quanto há — e o que mexeu nisso.
 *
 * As últimas movimentações aparecem para quem pode vê-las: é a resposta para
 * "por que o sistema diz 3 se na prateleira tem 5", que é a pergunta que traz
 * alguém a esta página.
 */
export default async function ProdutoPage({ params }: PageProps<'/erp/produtos/[id]'>) {
  const { choice, viewer } = await requireAccess('/erp/produtos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const { data: produto } = await supabase
    .from('erp_products')
    .select(
      'id, name, description, sku, barcode, unit, price_cents, cost_cents, track_stock, min_stock, active, category_id, created_at, category:erp_product_categories(name)',
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (produto === null) notFound();

  const terms = await currentTerms();
  const fuso = await tenantTimeZone();
  const rotulo = termOf(terms, 'erp.products');
  const rotuloVenda = capitalizar(termOf(terms, 'erp.sales').singular);
  const podeEditar = can(viewer, 'erp.products.write');
  const podeExcluir = can(viewer, 'erp.products.delete');
  const comEstoque = viewer.enabledModules.has('inventory');
  const controla = produto.track_stock === true;
  const veMovimentos = comEstoque && controla && can(viewer, 'inventory.movements.read');

  const unidade = isProductUnit(produto.unit) ? produto.unit : 'un';
  const preco = Number(produto.price_cents);
  const custo = produto.cost_cents === null ? null : Number(produto.cost_cents);
  const minimo = produto.min_stock === null ? null : Number(produto.min_stock);
  const margem = grossMargin(preco, custo);

  const [saldoR, movimentosR, categoriasR, membros] = await Promise.all([
    comEstoque && controla
      ? supabase
          .from('inventory_stock_levels')
          .select('quantity')
          .eq('tenant_id', tenantId)
          .eq('product_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    veMovimentos
      ? supabase
          .from('inventory_movements')
          .select(
            'id, kind, quantity, counted_quantity, reason, created_by, created_at, sale:erp_sales(number)',
          )
          .eq('tenant_id', tenantId)
          .eq('product_id', id)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    podeEditar
      ? supabase
          .from('erp_product_categories')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .order('position')
          .order('name')
      : Promise.resolve({ data: [] }),
    veMovimentos ? tenantMembers(tenantId) : Promise.resolve([]),
  ]);

  const saldo = saldoR.data === null ? 0 : Number(saldoR.data.quantity);
  const situacao = stockStatus({ trackStock: controla, quantity: saldo, minStock: minimo });
  const categoria = relacao<{ name: string }>(produto.category);

  const movimentos: MovimentoNaTela[] = (movimentosR.data ?? []).map((m) => {
    const kind = String(m.kind) as InventoryMovementKind;
    const venda = relacao<{ number: number }>(m.sale);
    return {
      id: String(m.id),
      rotulo:
        venda === null
          ? MOVIMENTO[kind]
          : kind === 'sale'
            ? `${rotuloVenda} nº ${venda.number}`
            : `Devolução · ${rotuloVenda} nº ${venda.number}`,
      quantidade: Number(m.quantity),
      contado: m.counted_quantity === null ? null : Number(m.counted_quantity),
      motivo: typeof m.reason === 'string' ? m.reason : null,
      quando: formatInstant(String(m.created_at), fuso),
      quem: nomeDe(membros, typeof m.created_by === 'string' ? m.created_by : null),
      unidade,
    };
  });

  const fatos: Fato[] = [
    {
      rotulo: 'Preço de venda',
      valor: (
        <span className="font-mono tabular-nums">
          {formatCents(preco)} <span className="text-content-muted">por {unidade}</span>
        </span>
      ),
    },
    {
      rotulo: 'Custo',
      valor: custo === null ? null : <span className="font-mono">{formatCents(custo)}</span>,
    },
    {
      rotulo: 'Margem',
      valor:
        margem === null ? null : (
          <span className={cn('font-mono', margem < 0 && 'text-danger')}>
            {formatMargin(margem)}
            {margem < 0 ? ' — abaixo do custo' : ''}
          </span>
        ),
    },
    { rotulo: 'Unidade', valor: `${unidade} — ${UNIT_INFO[unidade].singular}` },
    { rotulo: 'Categoria', valor: categoria?.name ?? null },
    {
      rotulo: 'Código interno',
      valor:
        typeof produto.sku === 'string' ? <span className="font-mono">{produto.sku}</span> : null,
    },
    {
      rotulo: 'Código de barras',
      valor:
        typeof produto.barcode === 'string' ? (
          <span className="font-mono">{produto.barcode}</span>
        ) : null,
    },
    ...(comEstoque
      ? [
          {
            rotulo: 'Estoque',
            valor: controla ? (
              <SituacaoDoEstoque saldo={saldo} situacao={situacao} unidade={unidade} />
            ) : (
              'Não controla — serviço ou item feito na hora'
            ),
          },
          ...(controla
            ? [
                {
                  rotulo: 'Estoque mínimo',
                  valor: minimo === null ? null : formatQuantity(minimo, unidade),
                },
              ]
            : []),
        ]
      : []),
    { rotulo: 'Cadastro', valor: formatInstant(String(produto.created_at), fuso) },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/erp/produtos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/erp/produtos')}
      </Link>

      <header className="mb-6 flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-muted dark:bg-surface-inset">
          <Package className="size-6 text-content-subtle" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold break-words text-content sm:text-3xl">
            {String(produto.name)}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-content-muted">
            {capitalizar(rotulo.singular)}
            {produto.active !== true && <Badge>Fora de venda</Badge>}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          {veMovimentos && (
            <Card>
              <CardHeader>
                <CardTitle>Últimas movimentações</CardTitle>
              </CardHeader>
              <CardContent>
                <MovementList
                  movimentos={movimentos}
                  vazio="Nada entrou nem saiu ainda. A primeira entrada, a primeira venda ou uma contagem aparecem aqui."
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{podeEditar ? 'Editar cadastro' : 'Descrição'}</CardTitle>
            </CardHeader>
            <CardContent>
              {podeEditar ? (
                <EditProductForm
                  singular={rotulo.singular}
                  categorias={(categoriasR.data ?? []).map((c) => ({
                    id: String(c.id),
                    nome: String(c.name),
                  }))}
                  comEstoque={comEstoque}
                  inicial={{
                    id: String(produto.id),
                    nome: String(produto.name),
                    categoriaId:
                      typeof produto.category_id === 'string' ? produto.category_id : null,
                    unidade,
                    preco: formatCentsInput(preco),
                    custo: custo === null ? null : formatCentsInput(custo),
                    sku: typeof produto.sku === 'string' ? produto.sku : null,
                    codigoDeBarras: typeof produto.barcode === 'string' ? produto.barcode : null,
                    controlaEstoque: controla,
                    estoqueMinimo: minimo === null ? null : formatQuantityInput(minimo),
                    descricao: typeof produto.description === 'string' ? produto.description : null,
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-content-default">
                  {typeof produto.description === 'string' && produto.description !== ''
                    ? produto.description
                    : 'Sem descrição.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <Card className="h-fit">
            <CardContent className="pt-5">
              <Facts fatos={fatos} />
            </CardContent>
          </Card>

          {(podeEditar || podeExcluir) && (
            <Card className="h-fit">
              <CardContent className="pt-5">
                <ProductStatusActions
                  id={String(produto.id)}
                  nome={String(produto.name)}
                  ativo={produto.active === true}
                  podeEditar={podeEditar}
                  podeExcluir={podeExcluir}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
