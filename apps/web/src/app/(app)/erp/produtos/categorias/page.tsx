import { can } from '@tivexy/core';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Card, CardContent } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { Categories, type CategoriaNaTela } from './categories';

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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/erp/produtos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/erp/produtos')}
      </Link>

      <PageHeader
        titulo="Categorias"
        descricao={`Como ${rotulo.plural} se agrupam na lista e nos filtros.`}
      />

      {error !== null && (
        <div className="mb-4">
          <FormError>
            Não consegui ler as categorias agora. Recarregue a página em instantes.
          </FormError>
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          <Categories
            categorias={categorias}
            podeEditar={can(viewer, 'erp.products.write')}
            rotulo={rotulo}
          />
        </CardContent>
      </Card>
    </div>
  );
}
