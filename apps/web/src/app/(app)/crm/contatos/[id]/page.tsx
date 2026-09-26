import { type CrmStageKind, can, dateIn, formatCents, formatDocument } from '@tivexy/core';
import { CircleDot, HandCoins, Trophy, XCircle, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/page/empty-state';
import { type Fato, Facts } from '@/components/page/facts';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { GradeDeRegistro, Page } from '@/components/page/page';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { currentSettings, tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { ActivityPanel } from '../../atividades/panel';
import { ContactRecord } from '../contact-form';
import { TETO_DE_CONTAS } from '../state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'crm.contacts').singular) };
}

/** Quantos negócios a tela mostra. O total vem do `count`, não daqui — ver abaixo. */
const NEGOCIOS_NA_TELA = 50;

/* Cor nunca sozinha: cada situação carrega o próprio símbolo e a própria palavra. */
const SITUACAO: Record<
  CrmStageKind,
  { Icone: LucideIcon; tone: BadgeProps['tone']; rotulo: string }
> = {
  open: { Icone: CircleDot, tone: 'brand', rotulo: 'Em aberto' },
  won: { Icone: Trophy, tone: 'success', rotulo: 'Ganho' },
  lost: { Icone: XCircle, tone: 'neutral', rotulo: 'Perdido' },
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
  const rotuloConta = capitalizar(termOf(terms, 'crm.companies').singular);
  const podeEditar = can(viewer, 'crm.contacts.write');
  const leNegocios = can(viewer, 'crm.deals.read');
  const leLeads = can(viewer, 'crm.leads.read');
  const conta = relacao<{ id: string; name: string }>(pessoa.company);
  const nome = String(pessoa.name);

  const [membros, negociosR, origemR, contasR, ajustes] = await Promise.all([
    tenantMembers(tenantId),
    leNegocios
      ? supabase
          .from('crm_deals')
          /*
           * `count: 'exact'` ao lado do limite: sem ele a tela mostrava as 50
           * mais recentes sem dizer que eram 50 de quantas. Número truncado
           * exibido como se fosse o todo é o que o CLAUDE.md proíbe.
           */
          .select('id, title, value_cents, closed_at, stage:crm_pipeline_stages(name, kind)', {
            count: 'exact',
          })
          .eq('tenant_id', tenantId)
          .eq('contact_id', id)
          .order('created_at', { ascending: false })
          .limit(NEGOCIOS_NA_TELA)
      : Promise.resolve({ data: [], count: null }),
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
      .limit(TETO_DE_CONTAS),
    currentSettings(),
  ]);

  const negocios = (negociosR.data ?? []).map((n) => {
    const etapa = relacao<{ name: string; kind: CrmStageKind }>(n.stage);
    return {
      id: String(n.id),
      titulo: String(n.title),
      valor: Number(n.value_cents),
      etapa: etapa?.name ?? null,
      tipo: etapa?.kind ?? ('open' as CrmStageKind),
    };
  });
  const totalDeNegocios = negociosR.count;
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
      numerico: true,
      valor:
        typeof pessoa.document === 'string' ? (
          <span className="font-mono">{formatDocument(pessoa.document)}</span>
        ) : null,
    },
    {
      rotulo: rotuloConta,
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

  const subtitulo = [pessoa.title, conta?.name].filter((v) => typeof v === 'string').join(' · ');

  return (
    <Page variant="registro">
      <PageHeader
        trilha={[{ rotulo: sectionTitle(terms, '/crm/contatos'), href: '/crm/contatos' }]}
        titulo={nome}
        descricao={subtitulo === '' ? undefined : subtitulo}
      />

      {/*
       * Duas colunas, e não as três da seção 3: uma pessoa não tem uma terceira
       * região de conteúdo que não seja inventada. Com o teto de 1400px a coluna
       * do meio fica com ~1000px — era o que a auditoria pedia ao apontar os
       * 520px de antes. A entrada da tela é uma só, aqui (seção 8, regra 1).
       */}
      <GradeDeRegistro className="animate-enter xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados</CardTitle>
              {/* Decorativo: o nome está no `<h1>` logo acima, e as iniciais não identificam ninguém sozinhas. */}
              <Avatar nome={nome} tamanho="lg" className="col-start-2 row-span-2 row-start-1" />
            </CardHeader>
            <CardContent>
              <Facts fatos={fatos} />
            </CardContent>
          </Card>

          {origem !== null && (
            <Card>
              <CardHeader>
                <CardTitle>De onde veio</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <p className="text-body text-content">
                  Chegou como {rotuloLead.singular} em {formatDate(dateIn(origem.created_at, fuso))}
                  {typeof origem.source === 'string' && origem.source !== ''
                    ? `, por ${origem.source}`
                    : ''}
                  .
                </p>
                {origem.converted_at !== null && (
                  <p className="text-caption text-content-muted">
                    Conversão em {formatDate(dateIn(origem.converted_at, fuso))}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {leNegocios && (
            <section className="flex flex-col gap-3" aria-labelledby="negocios-da-pessoa">
              <h2 id="negocios-da-pessoa" className="text-h2 text-content">
                {capitalizar(rotuloNegocio.plural)}
              </h2>

              {negocios.length === 0 ? (
                <EmptyState
                  icone={HandCoins}
                  titulo={`Nenhuma ${rotuloNegocio.singular} com esta pessoa`}
                  densidade="compacta"
                  acao={
                    <Link
                      href="/crm/oportunidades"
                      className="text-label text-content-accent hover:underline"
                    >
                      Abrir {sectionTitle(terms, '/crm/oportunidades')}
                    </Link>
                  }
                >
                  É aqui que aparece o que está em negociação, ganho ou perdido com ela. As{' '}
                  {rotuloNegocio.plural} nascem no quadro do funil.
                </EmptyState>
              ) : (
                <>
                  <Table
                    densidade="densa"
                    rotulo={`${capitalizar(rotuloNegocio.plural)} de ${nome}`}
                  >
                    <THead>
                      <tr>
                        <TH>Título</TH>
                        <TH className="hidden sm:table-cell">Etapa</TH>
                        <TH>Situação</TH>
                        <TH alinhamento="fim">Valor</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {negocios.map((n) => {
                        const { Icone, tone, rotulo } = SITUACAO[n.tipo];
                        return (
                          <TR key={n.id} href={`/crm/oportunidades/${n.id}`} rotulo={n.titulo}>
                            <TD truncar>
                              <span className="font-medium text-content">{n.titulo}</span>
                            </TD>
                            <TD className="hidden sm:table-cell" rotulo="Etapa" truncar>
                              {n.etapa ?? (
                                <>
                                  <span aria-hidden>—</span>
                                  <span className="sr-only">sem etapa</span>
                                </>
                              )}
                            </TD>
                            <TD rotulo="Situação">
                              <Badge tone={tone} Icone={Icone}>
                                {rotulo}
                              </Badge>
                            </TD>
                            <TD rotulo="Valor" numerico>
                              {formatCents(n.valor)}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>

                  {/*
                   * O corte, dito em voz alta. O total vem do `count` do banco;
                   * quando ele falta, a tela diz que não sabe — nunca chama o
                   * tamanho da página de total.
                   */}
                  {totalDeNegocios === null ? (
                    <p className="text-caption text-content-subtle">
                      Mostrando as {negocios.length} mais recentes. O total não veio nesta leitura.
                    </p>
                  ) : (
                    totalDeNegocios > negocios.length && (
                      <p className="text-caption text-content-subtle">
                        Mostrando as {negocios.length} mais recentes, de{' '}
                        {totalDeNegocios.toLocaleString('pt-BR')}.
                      </p>
                    )
                  )}
                </>
              )}
            </section>
          )}

          <ActivityPanel tenantId={tenantId} tipo="contato" id={String(pessoa.id)} nome={nome} />

          {podeEditar ? (
            <ContactRecord
              podeEditar
              singular={termOf(terms, 'crm.contacts').singular}
              rotuloConta={rotuloConta}
              contas={(contasR.data ?? []).map((c) => ({
                id: String(c.id),
                nome: String(c.name),
              }))}
              contasFalharam={contasR.error !== null}
              membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
              exigirDocumento={ajustes['crm.contact_requires_document'] === true}
              inicial={{
                id: String(pessoa.id),
                nome,
                email: typeof pessoa.email === 'string' ? pessoa.email : null,
                telefone: typeof pessoa.phone === 'string' ? pessoa.phone : null,
                documento:
                  typeof pessoa.document === 'string' ? formatDocument(pessoa.document) : null,
                cargo: typeof pessoa.title === 'string' ? pessoa.title : null,
                conta: conta === null ? null : { id: conta.id, nome: conta.name },
                responsavelId: typeof pessoa.owner_id === 'string' ? pessoa.owner_id : null,
                notas: typeof pessoa.notes === 'string' ? pessoa.notes : null,
              }}
            />
          ) : (
            <ContactRecord
              podeEditar={false}
              notas={typeof pessoa.notes === 'string' ? pessoa.notes : null}
            />
          )}
        </div>
      </GradeDeRegistro>
    </Page>
  );
}
