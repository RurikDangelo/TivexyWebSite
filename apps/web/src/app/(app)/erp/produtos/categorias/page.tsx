import { can } from '@tivexy/core';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { Categories, type CategoriaNaTela, NewCategoryForm } from './categories';

export const metadata: Metadata = { title: 'Categorias' };

function contados(valor: unknown): number {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  const n = (linha as { count?: unknown } | null | undefined)?.count;
  return typeof n === 'number' ? n : 0;
}

/**
 * As categorias de produto, com quantos produtos cada uma tem.
 *
 * O Blueprint semeia as do nicho — Hortifruti no mercado, Cafés na
 * cafeteria —, e a loja ajusta aqui. Apagar uma não apaga produto: eles ficam
 * sem categoria, e a confirmação diz quantos.
 */
export default async function CategoriasPage() {
  const { choice, viewer } = await requireAccess('/erp/produtos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const terms = await currentTerms();
  const rotulo = termOf(terms, 'erp.products');
  const podeEditar = can(viewer, 'erp.products.write');
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_product_categories')
    .select('id, name, erp_products(count)')
    .eq('tenant_id', choice.tenant.id)
    .order('position')
    .order('name');

  const categorias: CategoriaNaTela[] = (data ?? []).map((c) => ({
    id: String(c.id),
    nome: String(c.name),
    produtos: contados(c.erp_products),
  }));

  return (
    <Page variant="operacao">
      <PageHeader
        titulo="Categorias"
        descricao={`Como ${rotulo.plural} se agrupam na lista e nos filtros.`}
        trilha={[{ rotulo: sectionTitle(terms, '/erp/produtos'), href: '/erp/produtos' }]}
      />

      {/*
       * O cadastro fica ao lado da lista a partir de `xl`, onde sobra largura:
       * a tela era a mais estreita do sistema (672px) e a lista rolava sozinha
       * numa coluna que usava um terço do monitor.
       */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        {/* Falha de leitura não é lista vazia: sem a distinção, "ainda não há
            categorias" acusaria a loja de não ter cadastrado o que talvez tenha. */}
        {error !== null ? (
          <EmptyState estado="erro" titulo="Não consegui carregar as categorias">
            A leitura falhou agora — não dá para saber quais existem, e criar outra aqui pode
            repetir uma que já está lá. Recarregue a página em instantes.
          </EmptyState>
        ) : (
          <Categories categorias={categorias} podeEditar={podeEditar} rotulo={rotulo} />
        )}

        {podeEditar && <NewCategoryForm rotulo={rotulo} />}
      </div>
    </Page>
  );
}
