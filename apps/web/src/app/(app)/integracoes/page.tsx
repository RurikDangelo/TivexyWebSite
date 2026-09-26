import type { Metadata } from 'next';

import { FormError } from '@/components/form/messages';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { type DadosDaEmpresa, INTEGRACOES, integracoesEmUso } from '@/lib/integrations/catalog';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';

import { IntegrationCard } from './integration-card';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/integracoes') };
}

/**
 * As integrações, uma por uma, do jeito que estão: nenhuma conectada.
 *
 * **Nada aqui simula conexão.** Cada cartão diz para que serve, o que
 * funciona hoje sem ela, e o que falta — da empresa (🔒 externo) e da Tivexy
 * (interno). O que dá para conferir no banco, confere: o CNPJ e a razão
 * social da empresa, e os módulos contratados.
 */
export default async function IntegracoesPage() {
  const { choice, viewer } = await requireAccess('/integracoes');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const supabase = await supabaseServer();
  const [terms, empresa, modulos] = await Promise.all([
    currentTerms(),
    supabase
      .from('tenants')
      .select('document, legal_name')
      .eq('id', choice.tenant.id)
      .maybeSingle(),
    supabase.from('modules').select('code, name'),
  ]);

  const dados: DadosDaEmpresa = {
    documento: typeof empresa.data?.document === 'string' ? empresa.data.document : null,
    razaoSocial: typeof empresa.data?.legal_name === 'string' ? empresa.data.legal_name : null,
  };
  const nomes = new Map((modulos.data ?? []).map((m) => [String(m.code), String(m.name)]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={sectionTitle(terms, '/integracoes')}
        descricao="Cada uma depende de conta, credencial ou aprovação de terceiros — e do adaptador que a Tivexy ainda vai construir. Nada aqui é simulado."
      />

      {(empresa.error !== null || modulos.error !== null) && (
        <div className="mb-4">
          <FormError>
            Não consegui ler os dados da empresa agora — o que falta aparece sem a conferência.
          </FormError>
        </div>
      )}

      <p
        role="status"
        className="mb-6 flex flex-wrap items-baseline gap-x-2 rounded-lg border border-line-subtle bg-surface-subtle px-4 py-3"
      >
        <span className="font-display text-2xl font-bold text-content tabular-nums">
          {integracoesEmUso(INTEGRACOES)} de {INTEGRACOES.length}
        </span>
        <span className="text-sm text-content-muted">
          em uso. Nenhuma conexão existe ainda — por isso não há botão de conectar.
        </span>
      </p>

      <div className="flex flex-col gap-4">
        {INTEGRACOES.map((i) => (
          <IntegrationCard
            key={i.codigo}
            integracao={i}
            empresa={dados}
            modulo={
              i.modulo === null
                ? null
                : {
                    nome: nomes.get(i.modulo) ?? i.modulo,
                    contratado: viewer.enabledModules.has(i.modulo),
                  }
            }
          />
        ))}
      </div>
    </div>
  );
}
