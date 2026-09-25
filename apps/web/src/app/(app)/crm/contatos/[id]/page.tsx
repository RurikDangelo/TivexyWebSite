import { type CrmStageKind, can, dateIn, formatCents, formatDocument } from '@tivexy/core';
import { ArrowLeft, CircleDot, Trophy, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { type Fato, Facts } from '@/components/page/facts';
import { NoTenant } from '@/components/page/no-tenant';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { currentSettings, tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

import { EditContactForm } from '../contact-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'crm.contacts').singular) };
}

const SITUACAO: Record<CrmStageKind, { Icone: typeof Trophy; classe: string; rotulo: string }> = {
  open: { Icone: CircleDot, classe: 'text-content-accent', rotulo: 'Em aberto' },
  won: { Icone: Trophy, classe: 'text-success', rotulo: 'Ganho' },
  lost: { Icone: XCircle, classe: 'text-content-muted', rotulo: 'Perdido' },
};

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/**
 * Uma pessoa: quem é, o que está em negociação com ela, e de onde veio.
 *
 * "De onde veio" é o lead que a conversão carimbou. É a resposta para a
 * pergunta que todo gestor faz — de onde vêm os clientes que fecham — e ela
 * só existe porque o lead não é apagado ao converter.
 */
export default async function ContatoPage({ params }: PageProps<'/crm/contatos/[id]'>) {
  const { choice, viewer } = await requireAccess('/crm/contatos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const { data: pessoa } = await supabase
    .from('crm_contacts')
    .select(
      'id, name, email, phone, document, title, notes, owner_id, company_id, created_at, company:crm_companies(id, name)',
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (pessoa === null) notFound();

  const terms = await currentTerms();
  const fuso = await tenantTimeZone();
  const rotuloNegocio = termOf(terms, 'crm.deals');
  const rotuloLead = termOf(terms, 'crm.leads');
  const podeEditar = can(viewer, 'crm.contacts.write');
  const leNegocios = can(viewer, 'crm.deals.read');
  const leLeads = can(viewer, 'crm.leads.read');
  const conta = relacao<{ id: string; name: string }>(pessoa.company);

  const [membros, negociosR, origemR, contasR, ajustes] = await Promise.all([
    tenantMembers(tenantId),
    leNegocios
      ? supabase
          .from('crm_deals')
          .select('id, title, value_cents, closed_at, stage:crm_pipeline_stages(name, kind)')
          .eq('tenant_id', tenantId)
          .eq('contact_id', id)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    leLeads
      ? supabase
          .from('crm_leads')
          .select('name, source, created_at, converted_at')
          .eq('tenant_id', tenantId)
          .eq('converted_contact_id', id)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(500),
    currentSettings(),
  ]);

  const negocios = (negociosR.data ?? []).map((n) => {
    const etapa = relacao<{ name: string; kind: CrmStageKind }>(n.stage);
    return {
      id: String(n.id),
      titulo: String(n.title),
      valor: Number(n.value_cents),
      etapa: etapa?.name ?? '—',
      tipo: etapa?.kind ?? ('open' as CrmStageKind),
    };
  });
  const origem = origemR.data as {
    source: string | null;
    created_at: string;
    converted_at: string | null;
  } | null;

  const fatos: Fato[] = [
    {
      rotulo: 'E-mail',
      valor:
        typeof pessoa.email === 'string' ? (
          <a href={`mailto:${pessoa.email}`} className="text-content-accent hover:underline">
            {pessoa.email}
          </a>
        ) : null,
    },
    {
      rotulo: 'Telefone',
      valor:
        typeof pessoa.phone === 'string' ? (
          <a
            href={`tel:${pessoa.phone.replace(/[^\d+]/g, '')}`}
            className="text-content-accent hover:underline"
          >
            {pessoa.phone}
          </a>
        ) : null,
    },
    {
      rotulo: 'CPF ou CNPJ',
      valor:
        typeof pessoa.document === 'string' ? (
          <span className="font-mono">{formatDocument(pessoa.document)}</span>
        ) : null,
    },
    {
      rotulo: capitalizar(termOf(terms, 'crm.companies').singular),
      valor:
        conta !== null ? (
          <Link href={`/crm/empresas/${conta.id}`} className="text-content-accent hover:underline">
            {conta.name}
          </Link>
        ) : null,
    },
    { rotulo: 'Responsável', valor: nomeDe(membros, pessoa.owner_id) },
    { rotulo: 'Cadastro', valor: formatInstant(String(pessoa.created_at), fuso) },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/crm/contatos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/crm/contatos')}
      </Link>

      <header className="mb-6 flex items-center gap-4">
        <Avatar nome={String(pessoa.name)} className="size-12 text-sm" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold break-words text-content sm:text-3xl">
            {String(pessoa.name)}
          </h1>
          {(typeof pessoa.title === 'string' || conta !== null) && (
            <p className="text-content-muted">
              {[pessoa.title, conta?.name].filter((v) => typeof v === 'string').join(' · ')}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          {leNegocios && (
            <Card>
              <CardHeader>
                <CardTitle>{capitalizar(rotuloNegocio.plural)}</CardTitle>
              </CardHeader>
              <CardContent>
                {negocios.length === 0 ? (
                  <p className="text-sm text-content-muted">
                    Ainda não há {rotuloNegocio.plural} com esta pessoa. Cadastre pelo quadro de{' '}
                    <Link href="/crm/oportunidades" className="text-content-accent hover:underline">
                      {sectionTitle(terms, '/crm/oportunidades')}
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line-subtle">
                    {negocios.map((n) => {
                      const { Icone, classe, rotulo } = SITUACAO[n.tipo];
                      return (
                        <li key={n.id} className="flex items-center gap-3 py-2.5">
                          <Icone className={cn('size-4 shrink-0', classe)} aria-label={rotulo} />
                          <Link
                            href={`/crm/oportunidades/${n.id}`}
                            className="min-w-0 flex-1 truncate text-sm font-medium text-content hover:underline"
                          >
                            {n.titulo}
                          </Link>
                          <span className="hidden text-xs text-content-muted sm:inline">
                            {n.etapa}
                          </span>
                          <span className="font-mono text-sm tabular-nums text-content-default">
                            {formatCents(n.valor)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{podeEditar ? 'Editar cadastro' : 'Notas'}</CardTitle>
            </CardHeader>
            <CardContent>
              {podeEditar ? (
                <EditContactForm
                  singular={termOf(terms, 'crm.contacts').singular}
                  rotuloConta={capitalizar(termOf(terms, 'crm.companies').singular)}
                  contas={(contasR.data ?? []).map((c) => ({
                    id: String(c.id),
                    nome: String(c.name),
                  }))}
                  membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
                  exigirDocumento={ajustes['crm.contact_requires_document'] === true}
                  inicial={{
                    id: String(pessoa.id),
                    nome: String(pessoa.name),
                    email: typeof pessoa.email === 'string' ? pessoa.email : null,
                    telefone: typeof pessoa.phone === 'string' ? pessoa.phone : null,
                    documento:
                      typeof pessoa.document === 'string' ? formatDocument(pessoa.document) : null,
                    cargo: typeof pessoa.title === 'string' ? pessoa.title : null,
                    contaId: typeof pessoa.company_id === 'string' ? pessoa.company_id : null,
                    responsavelId: typeof pessoa.owner_id === 'string' ? pessoa.owner_id : null,
                    notas: typeof pessoa.notes === 'string' ? pessoa.notes : null,
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-content-default">
                  {typeof pessoa.notes === 'string' && pessoa.notes !== ''
                    ? pessoa.notes
                    : 'Sem notas.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <Card className="h-fit">
            <CardContent className="pt-5">
              <Facts fatos={fatos} />
            </CardContent>
          </Card>

          {origem !== null && (
            <Card className="h-fit">
              <CardContent className="pt-5 text-sm">
                <p className="text-xs text-content-muted">De onde veio</p>
                <p className="mt-1 text-content">
                  Chegou como {rotuloLead.singular} em {formatDate(dateIn(origem.created_at, fuso))}
                  {typeof origem.source === 'string' && origem.source !== ''
                    ? `, por ${origem.source}`
                    : ''}
                  .
                </p>
                {origem.converted_at !== null && (
                  <p className="mt-1 text-content-muted">
                    Conversão em {formatDate(dateIn(origem.converted_at, fuso))}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
