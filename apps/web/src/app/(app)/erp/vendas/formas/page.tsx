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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/erp/vendas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/erp/vendas')}
      </Link>
      <PageHeader
        titulo="Formas de pagamento"
        descricao="O que aparece no balcão, e em quantos dias o dinheiro de cada uma chega. Nada aqui cobra nem fala com banco."
      />
      {error !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler as formas agora. Recarregue a página em instantes.</FormError>
        </div>
      )}
      <Card>
        <CardContent className="pt-5">
          <PaymentMethods formas={formas} podeEditar={can(viewer, 'core.settings.write')} />
        </CardContent>
      </Card>
    </div>
  );
}
