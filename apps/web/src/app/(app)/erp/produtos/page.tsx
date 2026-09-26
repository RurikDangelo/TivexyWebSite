import { can, grossMargin, isProductUnit, stockStatus } from '@tivexy/core';
import { FolderTree, Package, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Pagination } from '@/components/page/pagination';
import { buttonVariants } from '@/components/ui/button';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { ilikeTerm, paginaPedida } from '@/lib/search';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { ProductFilters } from './filters';
import { NewProductForm } from './product-form';
import { ProductRows, type ProdutoListado } from './product-rows';
import { POR_PAGINA, situacaoPedida } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/erp/produtos') };
}

function nomeEmbutido(valor: unknown): string | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  const nome = (linha as { name?: unknown } | null | undefined)?.name;
  return typeof nome === 'string' ? nome : null;
}

/**
 * O que esta empresa vende.
 *
 * A busca vai ao banco — nome, código interno e código de barras —, e os
 * filtros ficam no endereço: "o que está fora de venda em Bebidas" é um link
 * que se manda para quem vai conferir. O saldo aparece ao lado quando o
 * tenant tem estoque, com a situação escrita: cor sozinha não diz nada a
 * quem não a distingue.
 */
export default async function ProdutosPage({ searchParams }: PageProps<'/erp/produtos'>) {
  const { choice, viewer } = await requireAccess('/erp/produtos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/erp/produtos');
  const rotulo = termOf(terms, 'erp.products');
  const podeEditar = can(viewer, 'erp.products.write');
  const comEstoque = viewer.enabledModules.has('inventory');

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const termo = ilikeTerm(q);
  const categoria =
    params.categoria === 'sem' || isUuid(params.categoria) ? String(params.categoria) : '';
  const situacao = situacaoPedida(params.situacao);
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;
  const filtrando = termo !== null || categoria !== '' || situacao !== 'ativos';

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('erp_products')
    .select(
      'id, name, sku, unit, price_cents, cost_cents, track_stock, min_stock, active, category:erp_product_categories(name)',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId);

  if (termo !== null) {
    consulta = consulta.or(`name.ilike.${termo},sku.ilike.${termo},barcode.ilike.${termo}`);
  }
  if (categoria === 'sem') consulta = consulta.is('category_id', null);
  else if (categoria !== '') consulta = consulta.eq('category_id', categoria);
  if (situacao === 'ativos') consulta = consulta.eq('active', true);
  else if (situacao === 'fora') consulta = consulta.eq('active', false);

  const [lista, categoriasR] = await Promise.all([
    consulta
      .order('name')
      .order('id')
      .range(de, de + POR_PAGINA - 1),
    supabase
      .from('erp_product_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('position')
      .order('name'),
  ]);

  const linhas = lista.data ?? [];
  const controlados = linhas.filter((l) => l.track_stock === true).map((l) => String(l.id));
  const saldos = new Map<string, number>();
  if (comEstoque && controlados.length > 0) {
    const { data } = await supabase
      .from('inventory_stock_levels')
      .select('product_id, quantity')
      .eq('tenant_id', tenantId)
      .in('product_id', controlados);
    for (const s of data ?? []) saldos.set(String(s.product_id), Number(s.quantity));
  }

  const produtos: ProdutoListado[] = linhas.map((l) => {
    const id = String(l.id);
    const unidade = isProductUnit(l.unit) ? l.unit : 'un';
    const preco = Number(l.price_cents);
    const custo = l.cost_cents === null ? null : Number(l.cost_cents);
    const minimo = l.min_stock === null ? null : Number(l.min_stock);
    const controla = l.track_stock === true;
    const saldo = saldos.get(id) ?? 0;
    return {
      id,
      nome: String(l.name),
      categoria: nomeEmbutido(l.category),
      sku: typeof l.sku === 'string' ? l.sku : null,
      unidade,
      precoCentavos: preco,
      margem: grossMargin(preco, custo),
      ativo: l.active === true,
      estoque:
        comEstoque && controla
          ? {
              saldo,
              situacao: stockStatus({ trackStock: true, quantity: saldo, minStock: minimo }),
            }
          : null,
    };
  });
  const total = lista.count ?? produtos.length;
  const categorias = (categoriasR.data ?? []).map((c) => ({
    id: String(c.id),
    nome: String(c.name),
  }));

  const descricao = !filtrando
    ? `${contagem(total, rotulo.singular, rotulo.plural)} à venda.`
    : `${contagem(total, 'resultado', 'resultados')}${q === '' ? '' : ` para “${q}”`}.`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={titulo}
        descricao={descricao}
        acoes={
          <Link href="/erp/produtos/categorias" className={buttonVariants({ variant: 'outline' })}>
            <FolderTree aria-hidden />
            Categorias
          </Link>
        }
      />

      <div className="mb-6 flex flex-col gap-4">
        <ProductFilters
          q={q}
          categoria={categoria}
          situacao={situacao}
          categorias={categorias}
          plural={rotulo.plural}
        />

        {podeEditar && (
          <NewProductForm
            singular={rotulo.singular}
            categorias={categorias}
            comEstoque={comEstoque}
          />
        )}
      </div>

      {lista.error !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler a lista agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      {produtos.length === 0 && lista.error === null ? (
        filtrando ? (
          <EmptyState
            icone={SearchX}
            titulo="Nada encontrado"
            acao={
              <Link href="/erp/produtos" className={buttonVariants({ variant: 'outline' })}>
                Limpar os filtros
              </Link>
            }
          >
            {q === ''
              ? 'Nenhum cadastro com esses filtros.'
              : `Nenhum cadastro tem “${q}” no nome, no código ou no código de barras.`}
          </EmptyState>
        ) : (
          <EmptyState icone={Package} titulo={`Ainda não há ${rotulo.plural}`}>
            {podeEditar
              ? 'Cadastre com o botão acima. Com nome, unidade e preço, já dá para vender.'
              : 'Quando alguém da equipe cadastrar, aparece aqui.'}
          </EmptyState>
        )
      ) : (
        <ProductRows produtos={produtos} />
      )}

      <Pagination
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={total}
        params={{ q, categoria, situacao: situacao === 'ativos' ? '' : situacao }}
      />
    </div>
  );
}
