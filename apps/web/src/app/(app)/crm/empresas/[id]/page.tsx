import { type CrmStageKind, can, formatCents, formatDocument, totalsByKind } from '@tivexy/core';
import { CircleDot, Handshake, NotebookPen, Trophy, Users, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/page/empty-state';
import { type Fato, Facts } from '@/components/page/facts';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { GradeDeRegistro, Page } from '@/components/page/page';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';
import { atrasoDaLinha } from '@/lib/utils';

import { ActivityPanel } from '../../atividades/panel';
import { EditCompanyDialog } from '../company-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'crm.companies').singular) };
}

/*
 * Os tetos das duas leituras embutidas.
 *
 * Constantes, e não literais na consulta, porque o número aparece na tela: é
 * ele que a faixa de indicadores cita quando a soma não é do histórico inteiro.
 */
const LIMITE_PESSOAS = 100;
const LIMITE_NEGOCIOS = 200;

/** Situação da oportunidade: símbolo e palavra sempre juntos, nunca só a cor. */
const SITUACAO: Record<
  CrmStageKind,
  { Icone: typeof Trophy; tom: 'brand' | 'success' | 'neutral'; rotulo: string }
> = {
  open: { Icone: CircleDot, tom: 'brand', rotulo: 'Em aberto' },
  won: { Icone: Trophy, tom: 'success', rotulo: 'Ganho' },
  lost: { Icone: XCircle, tom: 'neutral', rotulo: 'Perdido' },
};

/** A faixa do topo, na ordem em que se lê um histórico comercial. */
const FAIXA = [
  { tipo: 'open', rotulo: 'Em aberto', Icone: CircleDot, tom: 'neutral' },
  { tipo: 'won', rotulo: 'Ganhos', Icone: Trophy, tom: 'success' },
  { tipo: 'lost', rotulo: 'Perdas', Icone: XCircle, tom: 'neutral' },
] as const;

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/**
 * Uma conta: o cadastro, as pessoas de lá, e o que está em negociação.
 *
 * Os totais da faixa somam as oportunidades lidas — de todos os funis — e a
 * leitura para em `LIMITE_NEGOCIOS`. Quando o histórico é maior que isso, cada
 * indicador diz que a soma é parcial, em vez de apresentar o recorte como
 * total (CLAUDE.md). A situação de cada oportunidade vem embutida da etapa,
 * como no quadro.
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
  const rotuloConta = termOf(terms, 'crm.companies');
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
          /*
           * `count: 'exact'` conta a relação inteira, mesmo com `limit`. É o
           * que separa "estas são as pessoas desta conta" de "estas são as
           * cem primeiras" — antes o limite era mudo.
           */
          .select('id, name, title, email, phone', { count: 'exact' })
          .eq('tenant_id', tenantId)
          .eq('company_id', id)
          .order('name')
          .limit(LIMITE_PESSOAS)
      : /* Sem permissão não há leitura, e por isso também não há falha: `error: null`. */
        Promise.resolve({ data: [], count: 0, error: null }),
    leNegocios
      ? supabase
          .from('crm_deals')
          .select('id, title, value_cents, stage:crm_pipeline_stages(name, kind)', {
            count: 'exact',
          })
          .eq('tenant_id', tenantId)
          .eq('company_id', id)
          .order('created_at', { ascending: false })
          .limit(LIMITE_NEGOCIOS)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]);

  const pessoas = (pessoasR.data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.name),
    cargo: typeof p.title === 'string' && p.title !== '' ? p.title : null,
    contato: [p.email, p.phone].find((v): v is string => typeof v === 'string' && v !== '') ?? null,
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

  /*
   * Leitura que falhou não é relação vazia.
   *
   * O PostgREST devolve `data: null` no erro, e sem esta distinção a tela
   * escreveria "nenhuma pessoa ligada a esta conta" para uma conta que pode ter
   * trinta — afirmando um vazio que ninguém apurou (CLAUDE.md).
   */
  const falhouPessoas = pessoasR.error !== null;
  const falhouNegocios = negociosR.error !== null;

  const totalPessoas = pessoasR.count;
  const totalNegocios = negociosR.count;
  const pessoasTruncadas = totalPessoas !== null && totalPessoas > pessoas.length;
  const negociosTruncados = totalNegocios !== null && totalNegocios > negocios.length;
  /*
   * O aviso que acompanha cada indicador quando a soma não é do histórico
   * inteiro. `<Stat parcial>` troca a leitura de "este é o total" para "este é
   * o quanto deu para somar" — o comentário deste arquivo prometia "todas as
   * oportunidades" enquanto a consulta parava em duzentas.
   */
  const somaParcial = negociosTruncados
    ? `soma dos ${LIMITE_NEGOCIOS} mais recentes, de ${totalNegocios}`
    : undefined;

  const site = typeof conta.website === 'string' ? conta.website : null;
  const notas = typeof conta.notes === 'string' && conta.notes !== '' ? conta.notes : null;
  const nome = String(conta.name);

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
      numerico: true,
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

  /*
   * A linha de contexto do cabeçalho só cita o que foi contado de verdade
   * (`count: 'exact'`), e só o que quem está olhando tem permissão de ler.
   */
  const contexto: string[] = [];
  if (lePessoas && totalPessoas !== null)
    contexto.push(contagem(totalPessoas, rotuloPessoa.singular, rotuloPessoa.plural));
  if (leNegocios && totalNegocios !== null)
    contexto.push(contagem(totalNegocios, rotuloNegocio.singular, rotuloNegocio.plural));

  return (
    <Page variant="registro">
      <PageHeader
        trilha={[{ rotulo: sectionTitle(terms, '/crm/empresas'), href: '/crm/empresas' }]}
        titulo={nome}
        descricao={contexto.length > 0 ? contexto.join(' · ') : undefined}
        acoes={
          podeEditar ? (
            <EditCompanyDialog
              singular={rotuloConta.singular}
              membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
              inicial={{
                id: String(conta.id),
                nome,
                razaoSocial: typeof conta.legal_name === 'string' ? conta.legal_name : null,
                documento:
                  typeof conta.document === 'string' ? formatDocument(conta.document) : null,
                email: typeof conta.email === 'string' ? conta.email : null,
                telefone: typeof conta.phone === 'string' ? conta.phone : null,
                site,
                responsavelId: typeof conta.owner_id === 'string' ? conta.owner_id : null,
                notas,
              }}
            />
          ) : undefined
        }
      />

      {leNegocios && negocios.length > 0 && (
        /* O único evento de entrada da tela (seção 8, regra 1): a faixa escalona, o resto chega parado. */
        <StatGrid colunas={3} className="mb-6">
          {FAIXA.map((tile, i) => (
            <Stat
              key={tile.tipo}
              rotulo={tile.rotulo}
              valor={totais[tile.tipo].cents}
              formato="moeda"
              Icone={tile.Icone}
              tom={tile.tom}
              nota={contagem(totais[tile.tipo].count, rotuloNegocio.singular, rotuloNegocio.plural)}
              parcial={somaParcial}
              /*
               * Sem `contar`: trocar de conta não é o mesmo que trocar de
               * período. O `CountUp` animaria do total da conta anterior até o
               * desta, sugerindo uma variação que não existe (seção 8, regra 5).
               */
              animar
              atraso={atrasoDaLinha(i)}
            />
          ))}
        </StatGrid>
      )}

      <GradeDeRegistro>
        <Card
          /*
           * Acompanha a rolagem do corpo a partir de `xl`, que é onde a grade
           * abre em três colunas. O topo sai de `--header-h` para não depender
           * do número mágico que a casca costumava ter.
           */
          className="h-fit xl:sticky xl:top-[calc(var(--header-h)+1.5rem)]"
        >
          <CardHeader>
            <CardTitle>Dados do cadastro</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts fatos={fatos} />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          {lePessoas && (
            <Card>
              <CardHeader>
                <CardTitle>{capitalizar(rotuloPessoa.plural)}</CardTitle>
              </CardHeader>

              {falhouPessoas ? (
                <CardContent>
                  <EmptyState
                    estado="erro"
                    densidade="compacta"
                    moldura={false}
                    titulo={`Não consegui ler as ${rotuloPessoa.plural}`}
                  >
                    A leitura falhou agora. Não dá para dizer se esta conta tem gente ligada a ela —
                    recarregue a página em instantes.
                  </EmptyState>
                </CardContent>
              ) : pessoas.length === 0 ? (
                <CardContent>
                  <EmptyState
                    icone={Users}
                    densidade="compacta"
                    moldura={false}
                    titulo={`Nenhuma ${rotuloPessoa.singular} ligada a esta conta`}
                  >
                    Sem alguém do outro lado, a conta não tem com quem falar. Para ligar, abra o
                    cadastro da pessoa e escolha esta empresa no campo &ldquo;
                    {capitalizar(rotuloConta.singular)}&rdquo;.
                  </EmptyState>
                </CardContent>
              ) : (
                /*
                 * `moldura="nenhuma"`: o Card já é a moldura, e duas bordas
                 * concêntricas é o defeito que o primitivo existe para evitar.
                 * A tabela encosta nas laterais de propósito — a coluna só
                 * alinha o olho quando vai de ponta a ponta.
                 */
                <Table
                  moldura="nenhuma"
                  densidade="densa"
                  rotulo={`${capitalizar(rotuloPessoa.plural)} de ${nome}`}
                  className="border-t border-line-subtle"
                >
                  <THead>
                    <TR>
                      <TH>Nome</TH>
                      <TH>Cargo</TH>
                      <TH>Contato</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pessoas.map((p) => (
                      <TR key={p.id} href={`/crm/contatos/${p.id}`} rotulo={`Abrir ${p.nome}`}>
                        <TD truncar rotulo="Nome">
                          <span className="flex min-w-0 items-center gap-2">
                            <Avatar nome={p.nome} tamanho="xs" />
                            <span className="min-w-0 truncate font-medium text-content">
                              {p.nome}
                            </span>
                          </span>
                        </TD>
                        <TD truncar rotulo="Cargo">
                          {p.cargo ?? <NaoInformado />}
                        </TD>
                        <TD truncar rotulo="Contato">
                          {p.contato ?? <NaoInformado />}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}

              {pessoasTruncadas && (
                <CardFooter>
                  <p className="text-caption text-content-muted">
                    Mostrando {pessoas.length.toLocaleString('pt-BR')} de{' '}
                    {(totalPessoas ?? 0).toLocaleString('pt-BR')}. Esta tela lê no máximo{' '}
                    {LIMITE_PESSOAS} por conta.
                  </p>
                </CardFooter>
              )}
            </Card>
          )}

          {leNegocios && (
            <Card>
              <CardHeader>
                <CardTitle>{capitalizar(rotuloNegocio.plural)}</CardTitle>
              </CardHeader>

              {falhouNegocios ? (
                <CardContent>
                  <EmptyState
                    estado="erro"
                    densidade="compacta"
                    moldura={false}
                    titulo={`Não consegui ler os ${rotuloNegocio.plural}`}
                  >
                    A leitura falhou agora, e por isso a faixa de indicadores acima não aparece:
                    somar o que não se leu daria um número inventado. Recarregue a página em
                    instantes.
                  </EmptyState>
                </CardContent>
              ) : negocios.length === 0 ? (
                <CardContent>
                  <EmptyState
                    icone={Handshake}
                    densidade="compacta"
                    moldura={false}
                    titulo={`Nenhum ${rotuloNegocio.singular} com esta conta`}
                  >
                    É por aqui que se acompanha o que está em jogo com a conta e o que já se ganhou
                    dela. Abra {termOf(terms, 'crm.deals').plural} no funil escolhendo esta empresa,
                    e eles passam a aparecer aqui.
                  </EmptyState>
                </CardContent>
              ) : (
                <Table
                  moldura="nenhuma"
                  densidade="densa"
                  rotulo={`${capitalizar(rotuloNegocio.plural)} de ${nome}`}
                  className="border-t border-line-subtle"
                >
                  <THead>
                    <TR>
                      <TH>{capitalizar(rotuloNegocio.singular)}</TH>
                      <TH>Etapa</TH>
                      <TH>Situação</TH>
                      <TH alinhamento="fim">Valor</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {negocios.map((n) => {
                      const { Icone, tom, rotulo } = SITUACAO[n.tipo];
                      return (
                        <TR
                          key={n.id}
                          href={`/crm/oportunidades/${n.id}`}
                          rotulo={`Abrir ${n.titulo}`}
                        >
                          <TD truncar rotulo={capitalizar(rotuloNegocio.singular)}>
                            <span className="font-medium text-content">{n.titulo}</span>
                          </TD>
                          <TD truncar rotulo="Etapa">
                            {n.etapa}
                          </TD>
                          <TD rotulo="Situação">
                            {/* Ícone e palavra juntos: a cor do selo nunca carrega a informação sozinha. */}
                            <Badge tone={tom} Icone={Icone}>
                              {rotulo}
                            </Badge>
                          </TD>
                          <TD numerico rotulo="Valor">
                            {formatCents(n.valor)}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}

              {negociosTruncados && (
                <CardFooter>
                  <p className="text-caption text-content-muted">
                    Mostrando os {negocios.length.toLocaleString('pt-BR')} mais recentes de{' '}
                    {(totalNegocios ?? 0).toLocaleString('pt-BR')}. Os indicadores acima somam
                    apenas estes.
                  </p>
                </CardFooter>
              )}
            </Card>
          )}

          <ActivityPanel tenantId={tenantId} tipo="conta" id={String(conta.id)} nome={nome} />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            {notas === null ? (
              <EmptyState
                icone={NotebookPen}
                densidade="compacta"
                moldura={false}
                titulo="Sem notas"
              >
                {podeEditar
                  ? 'O que a equipe precisa saber antes de falar com esta conta cabe aqui. Escreva em “Editar cadastro”, no topo da tela.'
                  : 'Ninguém escreveu nada sobre esta conta ainda.'}
              </EmptyState>
            ) : (
              /* `max-w-prose` no parágrafo, nunca no contêiner: é a linha que tem medida de leitura, não a coluna. */
              <p className="max-w-prose whitespace-pre-wrap text-body text-pretty text-content-default">
                {notas}
              </p>
            )}
          </CardContent>
        </Card>
      </GradeDeRegistro>
    </Page>
  );
}

/** O travessão é desenho; quem ouve a página precisa da palavra. */
function NaoInformado() {
  return (
    <span className="text-content-subtle">
      <span aria-hidden>—</span>
      <span className="sr-only">não informado</span>
    </span>
  );
}
