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

import { PaymentMethods } from './payment-methods';
import type { FormaNaTela } from './state';

export const metadata: Metadata = { title: 'Formas de pagamento' };

function contados(valor: unknown): number {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  const n = (linha as { count?: unknown } | null | undefined)?.count;
  return typeof n === 'number' ? n : 0;
}

/**
 * As formas de pagamento do balcão, com o prazo de cada uma.
 *
 * **Nada aqui cobra ou fala com banco ou maquininha.** É o nome de como o
 * cliente pagou, e quando o dinheiro deve chegar — o que separa, no
 * financeiro, o que já entrou do que vai entrar.
 */
export default async function FormasPage() {
  const { choice, viewer } = await requireAccess('/erp/vendas');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const terms = await currentTerms();
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_payment_methods')
    .select('id, name, code, settlement_days, active, erp_sale_payments(count)')
    .eq('tenant_id', choice.tenant.id)
    .order('position')
    .order('name');

  const formas: FormaNaTela[] = (data ?? []).map((f) => ({
    id: String(f.id),
    nome: String(f.name),
    codigo: typeof f.code === 'string' ? f.code : null,
    prazoEmDias: Number(f.settlement_days),
    ativa: f.active === true,
    usos: contados(f.erp_sale_payments),
  }));

  return (
    <Page variant="operacao">
      <PageHeader
        titulo="Formas de pagamento"
        trilha={[{ rotulo: sectionTitle(terms, '/erp/vendas'), href: '/erp/vendas' }]}
        descricao="O que aparece no balcão, e em quantos dias o dinheiro de cada uma chega. Nada aqui cobra nem fala com banco."
      />

      {/*
       * Falha de leitura não pode cair na lista vazia: "nenhuma forma
       * cadastrada" é uma afirmação sobre o banco, e o banco não respondeu.
       */}
      {error !== null ? (
        <EmptyState estado="erro" titulo="Não consegui ler as formas de pagamento">
          Não sei dizer quantas existem nem quais estão no balcão. Recarregue a página em instantes.
        </EmptyState>
      ) : (
        <PaymentMethods formas={formas} podeEditar={can(viewer, 'core.settings.write')} />
      )}
    </Page>
  );
}
