import { CircleDashed, Lock, Plug } from 'lucide-react';
import type { Metadata } from 'next';

import { FormWarning } from '@/components/form/messages';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Stat, StatGrid } from '@/components/ui/stat';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { type DadosDaEmpresa, INTEGRACOES, integracoesEmUso } from '@/lib/integrations/catalog';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { atrasoDaLinha } from '@/lib/utils';

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
 *
 * Os três números do topo saem do próprio catálogo, que é uma constante do
 * código — não há consulta por trás deles e não há janela anterior para
 * comparar, então nenhum cartão recebe `variacao`.
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

  /*
   * Sem a leitura da empresa não se sabe se o CNPJ está cadastrado. `conferir()`
   * devolve `false` nos dois casos — campo vazio e leitura que falhou — e
   * imprimir "ainda não" no segundo afirmaria uma ausência que ninguém apurou.
   */
  const conferenciaDisponivel = empresa.error === null;

  const total = INTEGRACOES.length;
  const emUso = integracoesEmUso(INTEGRACOES);
  const dependemDaEmpresa = INTEGRACOES.filter((i) => i.faltaDaEmpresa.length > 0).length;

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={sectionTitle(terms, '/integracoes')}
        descricao="Cada uma depende de conta, credencial ou aprovação de terceiros — e do adaptador que a Tivexy ainda vai construir. Nada aqui é simulado."
      />

      <div className="flex flex-col gap-6">
        {(empresa.error !== null || modulos.error !== null) && (
          <FormWarning>
            Não consegui ler os dados da empresa agora. O que falta continua na tela; o que dependia
            de conferência aparece como <strong>não consegui conferir</strong>, e não como pendente.
          </FormWarning>
        )}

        <StatGrid colunas={3}>
          <Stat
            rotulo="Em uso"
            valor={emUso}
            Icone={Plug}
            nota="Nenhuma conexão existe ainda — por isso não há botão de conectar."
          />
          <Stat
            rotulo="Não configuradas"
            valor={total - emUso}
            Icone={CircleDashed}
            nota={`de ${total} no catálogo`}
          />
          <Stat
            rotulo="Dependem da empresa"
            valor={dependemDaEmpresa}
            Icone={Lock}
            nota="conta, certificado ou contrato fora da Tivexy"
          />
        </StatGrid>

        <section aria-labelledby="catalogo" className="flex flex-col gap-3">
          <h2 id="catalogo" className="text-h2 text-content">
            O que o Tivexy vai integrar
          </h2>
          {/*
           * Duas e três colunas a partir de `lg`: em coluna única os sete
           * cartões viravam uma tira estreita com metade da tela vazia, e cada
           * um já tem grade interna de dois lados.
           */}
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {INTEGRACOES.map((i, indice) => (
              <IntegrationCard
                key={i.codigo}
                integracao={i}
                empresa={dados}
                conferenciaDisponivel={conferenciaDisponivel}
                atraso={atrasoDaLinha(indice)}
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
        </section>
      </div>
    </Page>
  );
}
