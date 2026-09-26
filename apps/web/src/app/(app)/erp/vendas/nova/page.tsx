import { can } from '@tivexy/core';
import { ArrowLeft, Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { buttonVariants } from '@/components/ui/button';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { currentSettings } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { SaleForm } from '../sale-form';

export async function generateMetadata(): Promise<Metadata> {
  const venda = termOf(await currentTerms(), 'erp.sales').singular;
  return { title: `Registrar ${venda}` };
}

/**
 * O balcão.
 *
 * Carrega o que está à venda, as formas de pagamento ativas e os clientes; o
 * resto acontece no navegador até o registro. O preço que a tela mostra é o
 * do cadastro, e é o mesmo que o banco vai gravar — não há campo de preço.
 */
export default async function NovaVendaPage() {
  const { choice, viewer } = await requireAccess('/erp/vendas/nova');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const venda = termOf(terms, 'erp.sales');
  const produto = termOf(terms, 'erp.products');
  const cliente = termOf(terms, 'erp.customers');

  const supabase = await supabaseServer();
  const [produtosR, formasR, clientesR, ajustes] = await Promise.all([
    supabase
      .from('erp_products')
      .select('id, name, unit, price_cents, sku, barcode')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('name')
      .limit(3000),
    supabase
      .from('erp_payment_methods')
      .select('id, name, code, settlement_days')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('position')
      .order('name'),
    supabase
      .from('erp_customers')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(2000),
    currentSettings(),
  ]);

  const produtos = (produtosR.data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.name),
    unidade: String(p.unit),
    precoCentavos: Number(p.price_cents),
    sku: typeof p.sku === 'string' ? p.sku : null,
    codigoDeBarras: typeof p.barcode === 'string' ? p.barcode : null,
  }));

  const voltar = (
    <Link
      href="/erp/vendas"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {sectionTitle(terms, '/erp/vendas')}
    </Link>
  );

  if (produtosR.error === null && produtos.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {voltar}
        <PageHeader titulo={`Registrar ${venda.singular}`} />
        <EmptyState
          icone={Package}
          titulo={`Ainda não há ${produto.plural} à venda`}
          acao={
            can(viewer, 'erp.products.write') ? (
              <Link href="/erp/produtos" className={buttonVariants({ variant: 'outline' })}>
                Cadastrar {produto.singular}
              </Link>
            ) : undefined
          }
        >
          Para vender, é preciso ter o que vender: com nome, unidade e preço, o cadastro já aparece
          aqui.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {voltar}
      <PageHeader titulo={`Registrar ${venda.singular}`} />
      <SaleForm
        produtos={produtos}
        formas={(formasR.data ?? []).map((f) => ({
          id: String(f.id),
          nome: String(f.name),
          codigo: typeof f.code === 'string' ? f.code : null,
          prazoEmDias: Number(f.settlement_days),
        }))}
        clientes={(clientesR.data ?? []).map((c) => ({ id: String(c.id), nome: String(c.name) }))}
        exigeCliente={ajustes['erp.sales_requires_customer'] === true}
        podeCadastrarCliente={can(viewer, 'erp.customers.write')}
        rotulos={{
          venda: venda.singular,
          cliente: cliente.singular,
          produto: produto.singular,
          produtos: produto.plural,
        }}
      />
      <p className="mt-6 text-xs text-content-subtle">
        Registrar aqui não emite nota fiscal — a emissão depende de provedor fiscal e certificado
        digital, que ainda não estão configurados.
      </p>
    </div>
  );
}
