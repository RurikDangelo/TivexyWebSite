import { type CrmStageKind, can, formatCents, formatDocument, totalsByKind } from '@tivexy/core';
import { ArrowLeft, Building2, CircleDot, Trophy, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { type Fato, Facts } from '@/components/page/facts';
import { NoTenant } from '@/components/page/no-tenant';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

import { EditCompanyForm } from '../company-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'crm.companies').singular) };
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
 * Uma conta: o cadastro, as pessoas de lá, e o que está em negociação.
 *
 * Os totais são de **todas** as oportunidades da conta, de todos os funis —
 * o que já se ganhou com ela, o que está em aberto, o que se perdeu. A
 * situação de cada uma vem embutida da etapa, como no quadro.
 */
export default async function EmpresaPage({ params }: PageProps<'/crm/empresas/[id]'>) {
  const { choice, viewer } = await requireAccess('/crm/empresas');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const { data: conta } = await supabase
    .from('crm_companies')
    .select('id, name, legal_name, document, email, phone, website, notes, owner_id, created_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (conta === null) notFound();

  const terms = await currentTerms();
  const fuso = await tenantTimeZone();
  const rotuloNegocio = termOf(terms, 'crm.deals');
  const rotuloPessoa = termOf(terms, 'crm.contacts');
  const podeEditar = can(viewer, 'crm.companies.write');
  const leNegocios = can(viewer, 'crm.deals.read');
  const lePessoas = can(viewer, 'crm.contacts.read');

  const [membros, pessoasR, negociosR] = await Promise.all([
    tenantMembers(tenantId),
    lePessoas
      ? supabase
          .from('crm_contacts')
          .select('id, name, title, email, phone')
          .eq('tenant_id', tenantId)
          .eq('company_id', id)
          .order('name')
          .limit(100)
      : Promise.resolve({ data: [] }),
    leNegocios
      ? supabase
          .from('crm_deals')
          .select('id, title, value_cents, stage:crm_pipeline_stages(name, kind)')
          .eq('tenant_id', tenantId)
          .eq('company_id', id)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const pessoas = (pessoasR.data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.name),
    detalhe:
      [p.title, p.email, p.phone].find((v): v is string => typeof v === 'string' && v !== '') ??
      null,
  }));

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
  const totais = totalsByKind(negocios.map((n) => ({ kind: n.tipo, valueCents: n.valor })));

  const site = typeof conta.website === 'string' ? conta.website : null;
  const fatos: Fato[] = [
    {
      rotulo: 'Razão social',
      valor: typeof conta.legal_name === 'string' ? conta.legal_name : null,
    },
    {
      rotulo: 'CNPJ ou CPF',
      valor:
        typeof conta.document === 'string' ? (
          <span className="font-mono">{formatDocument(conta.document)}</span>
        ) : null,
    },
    {
      rotulo: 'Site',
      valor:
        site !== null ? (
          <a
            href={site}
            target="_blank"
            rel="noopener noreferrer"
            className="text-content-accent hover:underline"
          >
            {site.replace(/^https?:\/\//, '')}
          </a>
        ) : null,
    },
    {
      rotulo: 'E-mail',
      valor:
        typeof conta.email === 'string' ? (
          <a href={`mailto:${conta.email}`} className="text-content-accent hover:underline">
            {conta.email}
          </a>
        ) : null,
    },
    {
      rotulo: 'Telefone',
      valor:
        typeof conta.phone === 'string' ? (
          <a
            href={`tel:${conta.phone.replace(/[^\d+]/g, '')}`}
            className="text-content-accent hover:underline"
          >
            {conta.phone}
          </a>
        ) : null,
    },
    { rotulo: 'Responsável', valor: nomeDe(membros, conta.owner_id) },
    { rotulo: 'Cadastro', valor: formatInstant(String(conta.created_at), fuso) },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/crm/empresas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/crm/empresas')}
      </Link>

      <header className="mb-6 flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-accent-soft">
          <Building2 className="size-6 text-content-accent" aria-hidden />
        </span>
        <h1 className="min-w-0 font-display text-2xl font-bold break-words text-content sm:text-3xl">
          {String(conta.name)}
        </h1>
      </header>

      {leNegocios && negocios.length > 0 && (
        <dl className="mb-6 grid gap-3 sm:grid-cols-3">
          {(['open', 'won', 'lost'] as const).map((tipo) => {
            const { Icone, classe } = SITUACAO[tipo];
            const rotulo = { open: 'Em aberto', won: 'Ganhos', lost: 'Perdas' }[tipo];
            return (
              <div
                key={tipo}
                className="rounded-lg border border-line-subtle bg-surface-raised px-4 py-3 shadow-xs"
              >
                <dt className="flex items-center gap-1.5 text-xs font-medium text-content-muted">
                  <Icone className={cn('size-3.5', classe)} aria-hidden />
                  {rotulo}
                </dt>
                <dd className="mt-1">
                  <span className="font-display text-lg font-bold tabular-nums text-content">
                    {formatCents(totais[tipo].cents)}
                  </span>
                  <span className="ml-2 text-xs text-content-muted">
                    {contagem(totais[tipo].count, rotuloNegocio.singular, rotuloNegocio.plural)}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          {lePessoas && (
            <Card>
              <CardHeader>
                <CardTitle>{capitalizar(rotuloPessoa.plural)}</CardTitle>
              </CardHeader>
              <CardContent>
                {pessoas.length === 0 ? (
                  <p className="text-sm text-content-muted">
                    Ainda não há {rotuloPessoa.plural} com este cadastro. Para ligar, escolha-o no
                    campo &ldquo;{capitalizar(termOf(terms, 'crm.companies').singular)}&rdquo; do
                    cadastro da pessoa.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line-subtle">
                    {pessoas.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/crm/contatos/${p.id}`}
                          className="flex items-center gap-3 py-2.5 hover:underline"
                        >
                          <Avatar nome={p.nome} tamanho="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                            {p.nome}
                          </span>
                          {p.detalhe !== null && (
                            <span className="hidden truncate text-xs text-content-muted sm:inline">
                              {p.detalhe}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {leNegocios && (
            <Card>
              <CardHeader>
                <CardTitle>{capitalizar(rotuloNegocio.plural)}</CardTitle>
              </CardHeader>
              <CardContent>
                {negocios.length === 0 ? (
                  <p className="text-sm text-content-muted">
                    Ainda não há {rotuloNegocio.plural} com este cadastro.
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
                <EditCompanyForm
                  singular={termOf(terms, 'crm.companies').singular}
                  membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
                  inicial={{
                    id: String(conta.id),
                    nome: String(conta.name),
                    razaoSocial: typeof conta.legal_name === 'string' ? conta.legal_name : null,
                    documento:
                      typeof conta.document === 'string' ? formatDocument(conta.document) : null,
                    email: typeof conta.email === 'string' ? conta.email : null,
                    telefone: typeof conta.phone === 'string' ? conta.phone : null,
                    site,
                    responsavelId: typeof conta.owner_id === 'string' ? conta.owner_id : null,
                    notas: typeof conta.notes === 'string' ? conta.notes : null,
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-content-default">
                  {typeof conta.notes === 'string' && conta.notes !== ''
                    ? conta.notes
                    : 'Sem notas.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="order-1 h-fit lg:order-2">
          <CardContent className="pt-5">
            <Facts fatos={fatos} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
