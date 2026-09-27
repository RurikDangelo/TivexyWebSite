import { can, todayIn } from '@tivexy/core';
import { CalendarCheck2, RotateCw } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { FormWarning } from '@/components/form/messages';
import { buttonVariants } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import type { TipoDeAlvo } from '@/lib/crm/activity-input';
import { tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { NewActivityForm } from './activity-form';
import { AgendaList } from './agenda';
import { type Agenda, TETO_DE_PENDENTES, loadAgenda } from './load';
import type { Opcao } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/atividades') };
}

/** Teto das listas do campo "Sobre". Batendo nele, o formulário avisa — ver `activity-form`. */
const TETO_DE_ALVOS = 200;

type LinhasDeAlvo = { id: unknown; nome: unknown }[] | null;

const opcoes = (linhas: LinhasDeAlvo): Opcao[] =>
  (linhas ?? []).map((l) => ({ id: String(l.id), nome: String(l.nome) }));

/** A lista chegou completa ou o servidor cortou? Só quem sabe é o tamanho dela. */
const cortada = (linhas: LinhasDeAlvo): boolean => (linhas ?? []).length === TETO_DE_ALVOS;

/**
 * A frase de contexto do cabeçalho — e a regra de honestidade dela.
 *
 * `pendentes` sai de uma consulta com `.limit()`. Ao bater no teto, o número
 * deixa de ser total e vira piso, e é assim que a frase o apresenta: "pelo
 * menos". Leitura que falhou nunca vira "nada pendente" — essa afirmação é
 * indistinguível da verdadeira e é a que faz alguém perder um compromisso.
 */
function resumoDaAgenda(agenda: Agenda, soMinhas: boolean): string {
  if (agenda.erro) return 'Não foi possível ler a agenda agora.';
  if (agenda.pendentes === 0) {
    return soMinhas ? 'Nada pendente com você.' : 'Nada pendente.';
  }

  const total = agenda.truncado
    ? `pelo menos ${TETO_DE_PENDENTES} pendências`
    : `${agenda.pendentes} ${agenda.pendentes === 1 ? 'pendência' : 'pendências'} ao todo`;

  return `${agenda.atrasadas} com atraso, ${agenda.hoje} para hoje, ${total}.`;
}

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
  const rota = soMinhas ? '/crm/atividades?minhas=1' : '/crm/atividades';

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
      .limit(TETO_DE_ALVOS),
    supabase
      .from('crm_contacts')
      .select('id, nome:name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(TETO_DE_ALVOS),
    supabase
      .from('crm_companies')
      .select('id, nome:name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(TETO_DE_ALVOS),
    supabase
      .from('crm_deals')
      .select('id, nome:title')
      .eq('tenant_id', tenantId)
      .is('closed_at', null)
      .order('title')
      .limit(TETO_DE_ALVOS),
  ]);

  const rotulosDosAlvos: Readonly<Record<TipoDeAlvo, string>> = {
    lead: capitalizar(termOf(terms, 'crm.leads').plural),
    contato: capitalizar(termOf(terms, 'crm.contacts').plural),
    conta: capitalizar(termOf(terms, 'crm.companies').plural),
    negocio: capitalizar(termOf(terms, 'crm.deals').plural),
  };

  const alvosTruncados: TipoDeAlvo[] = [];
  if (cortada(leadsR.data)) alvosTruncados.push('lead');
  if (cortada(pessoasR.data)) alvosTruncados.push('contato');
  if (cortada(contasR.data)) alvosTruncados.push('conta');
  if (cortada(negociosR.data)) alvosTruncados.push('negocio');

  const vazia = agenda.secoes.every((s) => s.itens.length === 0);

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={titulo}
        descricao={resumoDaAgenda(agenda, soMinhas)}
        acoes={
          podeEditar ? (
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
              rotulosDosAlvos={rotulosDosAlvos}
              alvosTruncados={alvosTruncados}
            />
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <Segmented
          como="link"
          rotulo="Recorte da agenda"
          ativa={soMinhas ? 'minhas' : 'tudo'}
          itens={[
            { chave: 'tudo', rotulo: 'Tudo', href: '/crm/atividades' },
            { chave: 'minhas', rotulo: 'Sou responsável', href: '/crm/atividades?minhas=1' },
          ]}
        />

        {agenda.truncado && (
          <FormWarning>
            {`A lista para nas ${TETO_DE_PENDENTES} pendências mais próximas do vencimento. O que vence depois disso existe e não está aqui.`}
          </FormWarning>
        )}

        {agenda.erroNoHistorico && !agenda.erro && (
          <FormWarning>
            Não foi possível ler o histórico dos últimos 7 dias. As pendências abaixo estão
            completas.
          </FormWarning>
        )}
      </div>

      {agenda.erro ? (
        <EmptyState
          estado="erro"
          titulo="A agenda não pôde ser lida"
          acao={
            /*
             * `<a>` e não `<Link>`: o que se quer aqui é refazer a requisição,
             * e o roteador do cliente devolveria a mesma resposta em cache.
             */
            <a href={rota} className={buttonVariants({ variant: 'outline' })}>
              <RotateCw aria-hidden />
              Tentar de novo
            </a>
          }
        >
          A consulta ao banco falhou, então não dá para saber o que está pendente — inclusive o que
          já venceu. Isto não quer dizer que a agenda esteja vazia.
        </EmptyState>
      ) : vazia && soMinhas ? (
        <EmptyState
          estado="busca"
          titulo="Nada sob sua responsabilidade"
          acao={
            <Link href="/crm/atividades" className={buttonVariants({ variant: 'outline' })}>
              Ver a agenda inteira
            </Link>
          }
        >
          {`Este recorte mostra só ${rotulo.plural} em que você é o responsável. A agenda da equipe pode ter outras.`}
        </EmptyState>
      ) : vazia ? (
        <EmptyState
          estado="vazio"
          icone={CalendarCheck2}
          titulo="Agenda em dia"
          acao={
            podeEditar ? undefined : (
              <Link href="/crm/contatos" className={buttonVariants({ variant: 'outline' })}>
                Ver pessoas
              </Link>
            )
          }
        >
          {podeEditar
            ? `Nada pendente e nada concluído nos últimos 7 dias. Agende ${rotulo.plural} pelo botão acima — ou pela página de cada pessoa, conta ou negociação, onde o vínculo já vem preenchido.`
            : `Quando alguém da equipe agendar ${rotulo.plural}, elas aparecem aqui — o que vence hoje primeiro.`}
        </EmptyState>
      ) : (
        <AgendaList secoes={agenda.secoes} podeEditar={podeEditar} />
      )}
    </Page>
  );
}
