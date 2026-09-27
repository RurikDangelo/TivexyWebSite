import {
  type CrmStageKind,
  addDays,
  can,
  dateIn,
  daysBetween,
  missingExits,
  orderStages,
  todayIn,
} from '@tivexy/core';
import { Settings2, Workflow } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormWarning } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { buttonVariants } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { Board } from './board';
import { NewDealForm } from './deal-form';
import {
  type CartaoDeNegocio,
  type EtapaDoQuadro,
  JANELA_FECHADAS_DIAS,
  LIMITE_ABERTAS,
  LIMITE_FECHADAS,
  type Opcao,
} from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/oportunidades') };
}

const SELECAO_DO_CARTAO =
  'id, title, value_cents, stage_id, expected_close_date, updated_at, owner_id, company:crm_companies(name), contact:crm_contacts(name)';

/** O embutido do PostgREST vem como objeto ou lista, conforme a cardinalidade que ele infere. */
function nomeEmbutido(valor: unknown): string | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  const nome = (linha as { name?: unknown } | null | undefined)?.name;
  return typeof nome === 'string' ? nome : null;
}

/**
 * O funil de vendas, em colunas.
 *
 * **A situação de uma oportunidade é a da etapa** — ela não tem status
 * próprio, por decisão do esquema. O quadro é, então, as etapas do funil com
 * as oportunidades dentro, e mover entre colunas é a única forma de ganhar ou
 * perder um negócio.
 *
 * As colunas de ganho e perda mostram só os últimos 30 dias. Sem o corte, a
 * coluna de ganho cresceria para sempre e esconderia o funil que está andando.
 *
 * Os três estados da rota — erro de leitura, sem funil e quadro carregado —
 * usam o mesmo `<Page variant="quadro">`. Antes eram três larguras diferentes,
 * e criar o primeiro funil fazia a página saltar de 768px centrados para a
 * largura cheia.
 */
export default async function OportunidadesPage({ searchParams }: PageProps<'/crm/oportunidades'>) {
  const { choice, viewer } = await requireAccess('/crm/oportunidades');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/crm/oportunidades');
  const rotulo = termOf(terms, 'crm.deals');
  const podeEditar = can(viewer, 'crm.deals.write');
  const fuso = await tenantTimeZone();
  const hoje = todayIn(fuso);

  const pedido = (await searchParams).funil;
  const supabase = await supabaseServer();

  const { data: funisBrutos, error: erroFunis } = await supabase
    .from('crm_pipelines')
    .select('id, name, is_default')
    .eq('tenant_id', tenantId)
    .order('position')
    .order('name');

  const funis = (funisBrutos ?? []).map((f) => ({
    id: String(f.id),
    nome: String(f.name),
    padrao: f.is_default === true,
  }));

  const editor = podeEditar && (
    <Link href="/crm/oportunidades/funis" className={buttonVariants({ variant: 'outline' })}>
      <Settings2 aria-hidden />
      Funis e etapas
    </Link>
  );

  if (erroFunis !== null) {
    return (
      <Page variant="quadro">
        <PageHeader titulo={titulo} />
        <EmptyState estado="erro" titulo="Não consegui ler os funis">
          A consulta ao banco falhou agora há pouco. Nada foi perdido — recarregue a página em
          instantes e o quadro volta.
        </EmptyState>
      </Page>
    );
  }

  const funil =
    funis.find((f) => isUuid(pedido) && f.id === pedido) ?? funis.find((f) => f.padrao) ?? funis[0];

  if (funil === undefined) {
    return (
      <Page variant="quadro">
        <PageHeader titulo={titulo} />
        <EmptyState
          icone={Workflow}
          titulo="Ainda não há funil"
          acao={
            podeEditar ? (
              <Link href="/crm/oportunidades/funis" className={buttonVariants()}>
                Criar o funil
              </Link>
            ) : undefined
          }
        >
          {podeEditar
            ? `O funil é o caminho que ${rotulo.plural} percorrem até fechar. Crie o primeiro com as etapas do seu jeito de vender.`
            : 'Peça a quem administra a conta para criar o funil.'}
        </EmptyState>
      </Page>
    );
  }

  /* Dias de calendário do tenant, não 30 × 24 h a partir de agora: é o que "últimos 30 dias" quer dizer. */
  const corte = addDays(hoje, -JANELA_FECHADAS_DIAS);

  const [etapasR, abertasR, fechadasR, membros, contasR, pessoasR] = await Promise.all([
    supabase
      .from('crm_pipeline_stages')
      .select('id, name, kind, position')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id),
    supabase
      .from('crm_deals')
      .select(SELECAO_DO_CARTAO)
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id)
      .is('closed_at', null)
      .order('updated_at', { ascending: false })
      .limit(LIMITE_ABERTAS),
    supabase
      .from('crm_deals')
      .select(SELECAO_DO_CARTAO)
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id)
      .gte('closed_at', corte)
      .order('closed_at', { ascending: false })
      .limit(LIMITE_FECHADAS),
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

  const etapas: EtapaDoQuadro[] = orderStages(
    (etapasR.data ?? []).map((e) => ({
      id: String(e.id),
      name: String(e.name),
      kind: e.kind as CrmStageKind,
      position: Number(e.position),
    })),
  );

  const negocios: CartaoDeNegocio[] = [...(abertasR.data ?? []), ...(fechadasR.data ?? [])].map(
    (linha) => ({
      id: String(linha.id),
      titulo: String(linha.title),
      valorCentavos: Number(linha.value_cents),
      etapaId: String(linha.stage_id),
      conta: nomeEmbutido(linha.company),
      pessoa: nomeEmbutido(linha.contact),
      responsavelId: typeof linha.owner_id === 'string' ? linha.owner_id : null,
      responsavel: nomeDe(membros, linha.owner_id),
      previsao: typeof linha.expected_close_date === 'string' ? linha.expected_close_date : null,
      diasParado: Math.max(0, daysBetween(dateIn(String(linha.updated_at), fuso), hoje)),
    }),
  );

  /*
   * A consulta que volta cheia até o teto não diz se acabou ou se foi cortada.
   * Na dúvida, vale como cortada: é a diferença entre "este é o valor do funil"
   * e "esta é a soma do que deu para ler". O quadro rotula, e não finge total.
   */
  const corteDoQuadro = {
    abertas: (abertasR.data ?? []).length >= LIMITE_ABERTAS,
    fechadas: (fechadasR.data ?? []).length >= LIMITE_FECHADAS,
  };

  const opcoes = (linhas: { id: unknown; name: unknown }[] | null): Opcao[] =>
    (linhas ?? []).map((l) => ({ id: String(l.id), nome: String(l.name) }));

  const faltam = missingExits(etapas);
  const erroDeLeitura = etapasR.error ?? abertasR.error ?? fechadasR.error;
  const etapasAbertas = etapas.filter((e) => e.kind === 'open');

  return (
    <Page variant="quadro">
      <PageHeader
        titulo={titulo}
        descricao={
          funis.length > 1
            ? `Funil ${funil.nome}`
            : `Cada coluna é uma etapa de ${funil.nome}. Mover o cartão é o que ganha ou perde.`
        }
        acoes={
          <>
            {editor}
            {/* Uma ação `brand` por tela (seção 7): é esta. */}
            {podeEditar && etapasAbertas.length > 0 && (
              <NewDealForm
                singular={rotulo.singular}
                etapas={etapasAbertas.map((e) => ({ id: e.id, nome: e.name }))}
                contas={opcoes(contasR.data)}
                pessoas={opcoes(pessoasR.data)}
                membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
                rotuloConta={capitalizar(termOf(terms, 'crm.companies').singular)}
                rotuloPessoa={capitalizar(termOf(terms, 'crm.contacts').singular)}
              />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {funis.length > 1 && (
          <Segmented
            como="link"
            rotulo="Funil"
            ativa={funil.id}
            itens={funis.map((f) => ({
              chave: f.id,
              rotulo: f.nome,
              href: `/crm/oportunidades?funil=${f.id}`,
            }))}
          />
        )}

        {erroDeLeitura !== null && (
          <EmptyState estado="erro" titulo="Parte do funil não pôde ser lida">
            As etapas ou os cartões não chegaram. O que aparece abaixo pode estar incompleto —
            recarregue a página em instantes.
          </EmptyState>
        )}

        {etapas.length === 0 ? (
          <EmptyState
            icone={Workflow}
            titulo="Este funil ainda não tem etapas"
            acao={editor || undefined}
          >
            As etapas são as colunas do quadro: o caminho de quem acabou de chegar até o fechamento.
            Sem elas não há onde pôr {rotulo.plural}.
          </EmptyState>
        ) : (
          <>
            {faltam.length > 0 && (
              <FormWarning>
                {faltam.includes('won')
                  ? 'Este funil não tem etapa de ganho: nada nele fecha como venda. '
                  : 'Este funil não tem etapa de perda: não há onde registrar quem não comprou. '}
                {podeEditar && (
                  <Link
                    href="/crm/oportunidades/funis"
                    className="rounded-control font-medium underline underline-offset-2"
                  >
                    Ajustar etapas
                  </Link>
                )}
              </FormWarning>
            )}

            <Board
              etapas={etapas}
              negocios={negocios}
              podeMover={podeEditar}
              hoje={hoje}
              eu={viewer.userId}
              singular={rotulo.singular}
              plural={rotulo.plural}
              corte={corteDoQuadro}
            />
          </>
        )}
      </div>
    </Page>
  );
}
