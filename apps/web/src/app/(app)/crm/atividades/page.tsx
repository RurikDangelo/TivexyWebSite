import { can, todayIn } from '@tivexy/core';
import { CalendarCheck2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

import { NewActivityForm } from './activity-form';
import { AgendaList } from './agenda';
import { loadAgenda } from './load';
import type { Opcao } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/atividades') };
}

const opcoes = (linhas: { id: unknown; nome: unknown }[] | null): Opcao[] =>
  (linhas ?? []).map((l) => ({ id: String(l.id), nome: String(l.nome) }));

/**
 * A agenda: o que vence, o que atrasou, marcar como feita.
 *
 * "Com atraso" é por instante — a consulta das 9h está atrasada às 10h do
 * mesmo dia. O resto é por dia do tenant. Ver `packages/core/src/agenda.ts`.
 */
export default async function AtividadesPage({ searchParams }: PageProps<'/crm/atividades'>) {
  const { choice, viewer } = await requireAccess('/crm/atividades');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/crm/atividades');
  const rotulo = termOf(terms, 'crm.activities');
  const podeEditar = can(viewer, 'crm.activities.write');
  const fuso = await tenantTimeZone();
  const soMinhas = (await searchParams).minhas === '1';

  const supabase = await supabaseServer();
  const membros = await tenantMembers(tenantId);

  const [agenda, tiposR, leadsR, pessoasR, contasR, negociosR] = await Promise.all([
    loadAgenda(tenantId, fuso, membros, { responsavelId: soMinhas ? viewer.userId : null }),
    supabase
      .from('crm_activity_types')
      .select('id, nome:name')
      .eq('tenant_id', tenantId)
      .order('position')
      .order('name'),
    supabase
      .from('crm_leads')
      .select('id, nome:name')
      .eq('tenant_id', tenantId)
      .neq('status', 'converted')
      .order('name')
      .limit(200),
    supabase
      .from('crm_contacts')
      .select('id, nome:name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(200),
    supabase
      .from('crm_companies')
      .select('id, nome:name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(200),
    supabase
      .from('crm_deals')
      .select('id, nome:title')
      .eq('tenant_id', tenantId)
      .is('closed_at', null)
      .order('title')
      .limit(200),
  ]);

  const vazia = agenda.secoes.every((s) => s.itens.length === 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={titulo}
        descricao={
          agenda.pendentes === 0
            ? 'Nada pendente.'
            : `${agenda.atrasadas} com atraso, ${agenda.hoje} para hoje, ${agenda.pendentes} ${agenda.pendentes === 1 ? 'pendência' : 'pendências'} ao todo.`
        }
      />

      <div className="mb-6 flex flex-col gap-4">
        <nav aria-label="Filtrar agenda" className="flex gap-1">
          {[
            { href: '/crm/atividades', rotulo: 'Tudo', ativo: !soMinhas },
            { href: '/crm/atividades?minhas=1', rotulo: 'Sou responsável', ativo: soMinhas },
          ].map((f) => (
            <Link
              key={f.href}
              href={f.href}
              aria-current={f.ativo ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                f.ativo
                  ? 'border-line-accent bg-surface-accent-soft text-content-accent'
                  : 'border-line text-content-muted hover:bg-surface-muted',
              )}
            >
              {f.rotulo}
            </Link>
          ))}
        </nav>

        {podeEditar && (
          <NewActivityForm
            singular={rotulo.singular}
            hoje={todayIn(fuso)}
            tipos={opcoes(tiposR.data)}
            membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
            alvos={{
              lead: opcoes(leadsR.data),
              contato: opcoes(pessoasR.data),
              conta: opcoes(contasR.data),
              negocio: opcoes(negociosR.data),
            }}
            rotulosDosAlvos={{
              lead: capitalizar(termOf(terms, 'crm.leads').plural),
              contato: capitalizar(termOf(terms, 'crm.contacts').plural),
              conta: capitalizar(termOf(terms, 'crm.companies').plural),
              negocio: capitalizar(termOf(terms, 'crm.deals').plural),
            }}
          />
        )}
      </div>

      {vazia ? (
        <EmptyState icone={CalendarCheck2} titulo={soMinhas ? 'Nada com você' : 'Agenda em dia'}>
          {podeEditar
            ? `Agende ${rotulo.plural} com o botão acima — ou pela página de cada pessoa, conta ou negociação.`
            : 'Quando alguém da equipe agendar, aparece aqui.'}
        </EmptyState>
      ) : (
        <AgendaList secoes={agenda.secoes} podeEditar={podeEditar} />
      )}
    </div>
  );
}
