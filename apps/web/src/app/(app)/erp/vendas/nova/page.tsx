import { can } from '@tivexy/core';
import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
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
 *
 * Largura de operação, sem teto: é a tela onde a linha do item precisa caber
 * nome, quantidade, unidade e total sem espremer. No teto de 1024px anterior
 * sobravam 584px para a coluna de itens, menos que um tablet.
 */
export default async function NovaVendaPage() {
  const { choice, viewer } = await requireAccess('/erp/vendas/nova');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const venda = termOf(terms, 'erp.sales');
  const produto = termOf(terms, 'erp.products');
  const cliente = termOf(terms, 'erp.customers');
  const trilha = [{ rotulo: sectionTitle(terms, '/erp/vendas'), href: '/erp/vendas' }] as const;

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

  /* Falhar em ler o cadastro não é "não há nada à venda": são coisas diferentes e a tela diz qual das duas. */
  if (produtosR.error !== null) {
    return (
      <Page variant="operacao">
        <PageHeader titulo={`Registrar ${venda.singular}`} trilha={trilha} />
        <EmptyState estado="erro" titulo={`Não consegui ler os ${produto.plural}`}>
          Sem o cadastro não dá para montar a venda — e não sei dizer se ele está vazio ou se foi a
          leitura que falhou. Recarregue em instantes.
        </EmptyState>
      </Page>
    );
  }

  if (produtos.length === 0) {
    return (
      <Page variant="operacao">
        <PageHeader titulo={`Registrar ${venda.singular}`} trilha={trilha} />
        <EmptyState
          icone={Package}
          titulo={`Ainda não há ${produto.plural} à venda`}
          acao={
            can(viewer, 'erp.products.write') ? (
              <Link href="/erp/produtos" className={buttonVariants()}>
                Cadastrar {produto.singular}
              </Link>
            ) : undefined
          }
        >
          Para vender, é preciso ter o que vender: com nome, unidade e preço, o cadastro já aparece
          aqui.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={`Registrar ${venda.singular}`}
        trilha={trilha}
        descricao={`Passe o leitor ou escreva o nome. O preço vem do cadastro de ${produto.plural}.`}
      />
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
        }}
      />
      <p className="mt-6 max-w-prose text-caption text-content-subtle">
        Registrar aqui não emite nota fiscal — a emissão depende de provedor fiscal e certificado
        digital, que ainda não estão configurados.
      </p>
    </Page>
  );
}
