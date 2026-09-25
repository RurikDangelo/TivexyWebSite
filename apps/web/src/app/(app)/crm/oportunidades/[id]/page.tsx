import { type CrmStageKind, can, formatCents, formatCentsInput, orderStages } from '@tivexy/core';
import { ArrowLeft, CircleDot, Trophy, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoTenant } from '@/components/page/no-tenant';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { EditDealForm } from '../deal-form';

export async function generateMetadata(): Promise<Metadata> {
  const rotulo = termOf(await currentTerms(), 'crm.deals');
  return { title: capitalizar(rotulo.singular) };
}

const SITUACAO: Record<
  CrmStageKind,
  { rotulo: string; tom: 'brand' | 'success' | 'neutral'; Icone: typeof Trophy }
> = {
  open: { rotulo: 'Em aberto', tom: 'brand', Icone: CircleDot },
  won: { rotulo: 'Ganho', tom: 'success', Icone: Trophy },
  lost: { rotulo: 'Perdido', tom: 'neutral', Icone: XCircle },
};

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/**
 * Uma oportunidade: o que ela é, onde está, e a edição.
 *
 * A situação exibida é a da etapa — "Ganho" porque a etapa é de ganho, não
 * porque alguém marcou. É a mesma regra do quadro, lida do mesmo lugar.
 */
export default async function OportunidadePage({ params }: PageProps<'/crm/oportunidades/[id]'>) {
  const { choice, viewer } = await requireAccess('/crm/oportunidades');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const { data: negocio } = await supabase
    .from('crm_deals')
    .select(
      'id, title, value_cents, stage_id, pipeline_id, company_id, contact_id, owner_id, expected_close_date, closed_at, notes, created_at, updated_at, stage:crm_pipeline_stages(name, kind), pipeline:crm_pipelines(name), company:crm_companies(name), contact:crm_contacts(name)',
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  /* Outro tenant, ou sem permissão de leitura: o RLS devolve nada, e a resposta é a mesma. */
  if (negocio === null) notFound();

  const terms = await currentTerms();
  const fuso = await tenantTimeZone();
  const podeEditar = can(viewer, 'crm.deals.write');
  const etapa = relacao<{ name: string; kind: CrmStageKind }>(negocio.stage);
  const funil = relacao<{ name: string }>(negocio.pipeline);
  const conta = relacao<{ name: string }>(negocio.company);
  const pessoa = relacao<{ name: string }>(negocio.contact);
  const situacao = SITUACAO[etapa?.kind ?? 'open'];
  const pipelineId = String(negocio.pipeline_id);

  const [etapasR, membros, contasR, pessoasR] = await Promise.all([
    supabase
      .from('crm_pipeline_stages')
      .select('id, name, kind, position')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', pipelineId),
    tenantMembers(tenantId),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(500),
    supabase
      .from('crm_contacts')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(500),
  ]);

  const etapas = orderStages(
    (etapasR.data ?? []).map((e) => ({
      id: String(e.id),
      name: String(e.name),
      kind: e.kind as CrmStageKind,
      position: Number(e.position),
    })),
  );

  const fatos: { rotulo: string; valor: string | null }[] = [
    { rotulo: capitalizar(termOf(terms, 'crm.companies').singular), valor: conta?.name ?? null },
    { rotulo: capitalizar(termOf(terms, 'crm.contacts').singular), valor: pessoa?.name ?? null },
    { rotulo: 'Responsável', valor: nomeDe(membros, negocio.owner_id) },
    {
      rotulo: 'Previsão de fechamento',
      valor:
        typeof negocio.expected_close_date === 'string'
          ? formatDate(negocio.expected_close_date)
          : null,
    },
    { rotulo: 'Cadastro', valor: formatInstant(String(negocio.created_at), fuso) },
    {
      rotulo: 'Fechamento',
      valor: typeof negocio.closed_at === 'string' ? formatInstant(negocio.closed_at, fuso) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={`/crm/oportunidades?funil=${pipelineId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {sectionTitle(terms, '/crm/oportunidades')}
      </Link>

      <header className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={situacao.tom}>
            <situacao.Icone className="size-3.5" aria-hidden />
            {situacao.rotulo}
          </Badge>
          <span className="text-sm text-content-muted">
            {funil?.name} · {etapa?.name}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold break-words text-content sm:text-3xl">
          {String(negocio.title)}
        </h1>
        <p className="font-display text-xl font-semibold tabular-nums text-content-default">
          {formatCents(Number(negocio.value_cents))}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="order-2 lg:order-1">
          <CardHeader>
            <CardTitle>{podeEditar ? 'Editar' : 'Notas'}</CardTitle>
          </CardHeader>
          <CardContent>
            {podeEditar ? (
              <EditDealForm
                singular={termOf(terms, 'crm.deals').singular}
                etapas={etapas.map((e) => ({ id: e.id, nome: e.name }))}
                contas={(contasR.data ?? []).map((c) => ({
                  id: String(c.id),
                  nome: String(c.name),
                }))}
                pessoas={(pessoasR.data ?? []).map((p) => ({
                  id: String(p.id),
                  nome: String(p.name),
                }))}
                membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
                rotuloConta={capitalizar(termOf(terms, 'crm.companies').singular)}
                rotuloPessoa={capitalizar(termOf(terms, 'crm.contacts').singular)}
                inicial={{
                  id: String(negocio.id),
                  titulo: String(negocio.title),
                  valor: formatCentsInput(Number(negocio.value_cents)),
                  etapaId: String(negocio.stage_id),
                  contaId: typeof negocio.company_id === 'string' ? negocio.company_id : null,
                  pessoaId: typeof negocio.contact_id === 'string' ? negocio.contact_id : null,
                  responsavelId: typeof negocio.owner_id === 'string' ? negocio.owner_id : null,
                  previsao:
                    typeof negocio.expected_close_date === 'string'
                      ? negocio.expected_close_date
                      : null,
                  notas: typeof negocio.notes === 'string' ? negocio.notes : null,
                }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-content-default">
                {typeof negocio.notes === 'string' && negocio.notes !== ''
                  ? negocio.notes
                  : 'Sem notas.'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="order-1 h-fit lg:order-2">
          <CardContent className="pt-5">
            <dl className="flex flex-col gap-3 text-sm">
              {fatos.map((fato) => (
                <div key={fato.rotulo} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-content-muted">{fato.rotulo}</dt>
                  <dd className={fato.valor === null ? 'text-content-subtle' : 'text-content'}>
                    {fato.valor ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
