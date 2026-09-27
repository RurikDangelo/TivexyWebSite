import { type CrmStageKind, can, formatCentsInput, orderStages } from '@tivexy/core';
import { CircleDot, LayoutGrid, Trophy, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { type Fato, Facts } from '@/components/page/facts';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { GradeDeRegistro, Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { ActivityPanel } from '../../atividades/panel';
import { EditDealForm, NotasEmLeitura } from '../deal-form';

export async function generateMetadata(): Promise<Metadata> {
  const rotulo = termOf(await currentTerms(), 'crm.deals');
  return { title: capitalizar(rotulo.singular) };
}

const SITUACAO: Record<
  CrmStageKind,
  {
    rotulo: string;
    tom: 'brand' | 'success' | 'neutral';
    /* O tom do `<Stat>` tem outro vocabulário: só `success` pinta, o resto fica neutro. */
    tomDoValor: 'success' | 'neutral';
    Icone: typeof Trophy;
  }
> = {
  open: { rotulo: 'Em aberto', tom: 'brand', tomDoValor: 'neutral', Icone: CircleDot },
  won: { rotulo: 'Ganho', tom: 'success', tomDoValor: 'success', Icone: Trophy },
  lost: { rotulo: 'Perdido', tom: 'neutral', tomDoValor: 'neutral', Icone: XCircle },
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
 *
 * Três colunas (seção 3, variante `registro`): fatos à esquerda, o que se faz
 * no meio, onde o negócio está à direita. A grade anterior era `1fr 18rem`
 * dentro de 896px — sobravam 520px para a coluna principal num monitor de 1920.
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
  const notas = typeof negocio.notes === 'string' ? negocio.notes : null;

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

  const fatos: Fato[] = [
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
    <Page variant="registro">
      <PageHeader
        trilha={[
          {
            rotulo: sectionTitle(terms, '/crm/oportunidades'),
            href: `/crm/oportunidades?funil=${pipelineId}`,
          },
        ]}
        titulo={String(negocio.title)}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={situacao.tom} Icone={situacao.Icone}>
              {situacao.rotulo}
            </Badge>
            <span>
              {funil?.name} · {etapa?.name}
            </span>
          </span>
        }
      />

      <GradeDeRegistro>
        {/* Na pilha do celular a ordem é: onde está, o que fazer, os fatos. */}
        <Card className="order-3 h-fit xl:order-1">
          <CardHeader>
            <CardTitle>Fatos</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts fatos={fatos} />
          </CardContent>
        </Card>

        <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-2">
          <ActivityPanel
            tenantId={tenantId}
            tipo="negocio"
            id={String(negocio.id)}
            nome={String(negocio.title)}
          />

          <Card>
            <CardHeader>
              {/*
               * O mesmo título para os dois papéis. Antes ele alternava entre
               * "Editar" e "Notas" conforme a permissão, e duas pessoas na
               * mesma empresa chamavam a mesma tela por nomes diferentes.
               */}
              <CardTitle>Cadastro</CardTitle>
              <CardDescription>
                O combinado com o cliente e os vínculos deste registro.
              </CardDescription>
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
                    notas,
                  }}
                />
              ) : (
                <NotasEmLeitura notas={notas} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="order-1 flex flex-col gap-4 xl:order-3">
          <Stat
            rotulo="Valor"
            valor={Number(negocio.value_cents)}
            formato="moeda"
            Icone={situacao.Icone}
            tom={situacao.tomDoValor}
            nota={etapa?.name}
          />
          <Card>
            <CardHeader>
              <CardTitle>{funil?.name ?? 'Funil'}</CardTitle>
              <CardDescription>Etapa atual: {etapa?.name ?? 'não identificada'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <Link
                href={`/crm/oportunidades?funil=${pipelineId}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <LayoutGrid aria-hidden />
                Ver no quadro
              </Link>
            </CardContent>
          </Card>
        </div>
      </GradeDeRegistro>
    </Page>
  );
}
