import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { formatInstant } from '@tivexy/core';
import { BarraDeBusca, SemResultado } from '@/components/crm/search-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { filtroOu, parametro, umDentre } from '@/lib/crm/busca';
import { FAIXAS, FAIXA_TITULO, FAIXA_TOM, type Faixa, faixaDe, instante } from '@/lib/crm/agenda';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { capitalizar, currentTerms, term } from '@/lib/crm/terms';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import { alternarAtividade } from './actions';
import { ActivityForm } from './activity-form';
import { type AlvoOferecido, type AtividadeListada, GRUPO_DO_ALVO, type TipoDeAlvo } from './state';

export const metadata: Metadata = { title: 'Atividades' };

const PADRAO = { singular: 'atividade', plural: 'atividades' };

/** Quantas atividades a agenda carrega. Ver o aviso no fim do arquivo. */
const TETO = 300;

/**
 * A agenda.
 *
 * ## O que esta tela decide, e o que ela não decide
 *
 * Ela decide **onde cada linha aparece** — atrasada, hoje, próxima. Isso é
 * `faixaDe()`, puro e testado, no fuso do tenant. O que ela **não** decide é
 * o que é "agora": recebe o instante e o fuso, e por isso o teste consegue
 * exercitar a virada de dia sem esperar o dia virar.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas, e a
 * consulta sem filtro devolveria as duas agendas misturadas.
 */
/** Os recortes da agenda. `pendentes` é o padrão: é a fila de trabalho. */
const RECORTES = ['pendentes', 'todas', 'concluidas'] as const;

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/crm/atividades');
  const rotulo = term(await currentTerms(), 'crm.activities', PADRAO);

  const params = await searchParams;
  const termo = parametro(params, 'b');
  const recorte = umDentre(parametro(params, 'estado'), RECORTES, 'pendentes');

  if (choice.kind !== 'resolved') {
    /* `requireAccess` já mandaria para `/empresas`; isto é a rede embaixo. */
    return null;
  }

  const supabase = await supabaseServer();
  const fuso = await currentTimeZone();
  const agora = new Date();

  const [tiposResposta, alvos, resposta] = await Promise.all([
    supabase
      .from('crm_activity_types')
      .select('id, name')
      .eq('tenant_id', choice.tenant.id)
      .order('position'),
    alvosOferecidos(supabase, choice.tenant.id),
    listarAtividades(supabase, choice.tenant.id, termo, recorte),
  ]);

  const tipos = (tiposResposta.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
  }));

  const atividades: AtividadeListada[] = (resposta.data ?? []).map((linha) => ({
    id: String(linha.id),
    subject: String(linha.subject),
    notes: (linha.notes as string | null) ?? null,
    dueAt: (linha.due_at as string | null) ?? null,
    doneAt: (linha.done_at as string | null) ?? null,
    tipo: nomeAninhado(linha.crm_activity_types),
    ...alvoDaLinha(linha),
  }));

  /* Cada linha cai em exatamente uma faixa — a mesma função que o teste exercita. */
  const porFaixa = new Map<Faixa, AtividadeListada[]>();
  for (const atividade of atividades) {
    const faixa = faixaDe(instante(atividade.dueAt), instante(atividade.doneAt), agora, fuso);
    const lista = porFaixa.get(faixa);
    if (lista === undefined) porFaixa.set(faixa, [atividade]);
    else lista.push(atividade);
  }

  const pendentes = atividades.length - (porFaixa.get('concluida')?.length ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">
          {capitalizar(rotulo.plural)}
        </h1>
        <p className="mt-1 text-content-muted">
          O que precisa ser feito, e sobre quem. {pendentes}{' '}
          {pendentes === 1 ? 'em aberto' : 'em aberto'}.
        </p>
      </header>

      <div className="mb-6">
        <ActivityForm alvos={alvos} tipos={tipos} />
      </div>

      <BarraDeBusca
        termo={termo}
        placeholder="Assunto ou observação"
        filtro={{
          nome: 'estado',
          rotulo: 'Recorte',
          valor: recorte,
          opcoes: [
            { valor: 'pendentes', texto: 'Em aberto' },
            { valor: 'concluidas', texto: 'Concluídas' },
            { valor: 'todas', texto: 'Todas' },
          ],
        }}
      />

      {resposta.error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler a agenda</CardTitle>
            <CardDescription>{resposta.error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {atividades.length === TETO && (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Mostrando as {TETO} atividades de prazo mais próximo. Há mais do que cabe aqui.
        </p>
      )}

      {atividades.length === 0 && resposta.error === null && termo !== '' ? (
        <SemResultado termo={termo} limpar="/crm/atividades" />
      ) : atividades.length === 0 && resposta.error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <CalendarCheck className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhuma {rotulo.singular} ainda</CardTitle>
            <CardDescription>
              Registre a primeira com o botão acima. Toda atividade fala de um lead, um contato, uma
              empresa ou uma oportunidade — nunca do nada.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {FAIXAS.map((faixa) => {
            const lista = porFaixa.get(faixa) ?? [];
            if (lista.length === 0) return null;
            return <Secao key={faixa} faixa={faixa} atividades={lista} fuso={fuso} />;
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A agenda, já filtrada pelo banco.
 *
 * O recorte entra como condição da consulta, e não como `Array.filter` depois
 * de ler. Com o teto de 300, filtrar na aplicação faria "concluídas" mostrar
 * só as concluídas que por acaso estivessem entre as 300 de prazo mais
 * próximo — e a tela diria que não há mais nenhuma.
 */
async function listarAtividades(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  tenantId: string,
  termo: string,
  recorte: 'pendentes' | 'todas' | 'concluidas',
) {
  let consulta = supabase
    .from('crm_activities')
    /*
     * O `select` é um literal só, sem concatenação nem interpolação. Não é
     * estilo: o supabase-js **lê esta string em tempo de tipo** para saber a
     * forma do retorno, e um `+` no meio apaga isso — o resultado vira
     * `GenericStringError` e nenhum campo existe mais.
     */
    .select(
      'id, subject, notes, due_at, done_at, lead_id, contact_id, company_id, deal_id, crm_activity_types(name), crm_leads(name), crm_contacts(name), crm_companies(name), crm_deals(title)',
    )
    .eq('tenant_id', tenantId);

  /* A busca alcança o assunto e a anotação — é por onde se procura "aquela
     ligação sobre o orçamento". O nome do alvo ficaria fora pelo mesmo motivo
     da tela de contatos: filtrar por relação embutida exige junção interna. */
  const filtro = filtroOu(termo, ['subject', 'notes']);
  if (filtro !== null) consulta = consulta.or(filtro);

  if (recorte === 'pendentes') consulta = consulta.is('done_at', null);
  else if (recorte === 'concluidas') consulta = consulta.not('done_at', 'is', null);

  return consulta.order('due_at', { ascending: true, nullsFirst: false }).limit(TETO);
}

/**
 * As quatro coisas sobre as quais uma atividade pode falar, numa lista só.
 *
 * Quatro consultas escritas por extenso, e não uma montada em laço: o
 * supabase-js lê o `select` em tempo de tipo, e uma string interpolada apaga
 * a tipagem do retorno inteiro. Por extenso também fica claro que a
 * oportunidade tem `title` onde as outras têm `name`.
 *
 * Quem não tem permissão de ler uma das quatro recebe vazio pelo RLS, e
 * aquele grupo some sozinho do seletor — a política decidindo a interface.
 */
async function alvosOferecidos(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  tenantId: string,
): Promise<AlvoOferecido[]> {
  const [leads, contatos, empresas, negocios] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(100),
    supabase
      .from('crm_contacts')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(100),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(100),
    supabase
      .from('crm_deals')
      .select('id, title')
      .eq('tenant_id', tenantId)
      .order('title')
      .limit(100),
  ]);

  return [
    ...(leads.data ?? []).map((l) => alvo('lead', l.id, l.name)),
    ...(contatos.data ?? []).map((c) => alvo('contact', c.id, c.name)),
    ...(empresas.data ?? []).map((e) => alvo('company', e.id, e.name)),
    ...(negocios.data ?? []).map((n) => alvo('deal', n.id, n.title)),
  ];
}

/** O tipo e o id juntos no valor, porque a escolha do formulário é uma só. */
function alvo(tipo: TipoDeAlvo, id: unknown, nome: unknown): AlvoOferecido {
  return { valor: `${tipo}:${String(id)}`, tipo, nome: String(nome) };
}

/** Qual das quatro colunas de alvo veio preenchida, e o nome dela. */
function alvoDaLinha(linha: Record<string, unknown>): {
  alvoTipo: TipoDeAlvo | null;
  alvoNome: string | null;
} {
  if (linha.lead_id !== null) {
    return { alvoTipo: 'lead', alvoNome: nomeAninhado(linha.crm_leads) };
  }
  if (linha.contact_id !== null) {
    return { alvoTipo: 'contact', alvoNome: nomeAninhado(linha.crm_contacts) };
  }
  if (linha.company_id !== null) {
    return { alvoTipo: 'company', alvoNome: nomeAninhado(linha.crm_companies) };
  }
  if (linha.deal_id !== null) {
    /* Oportunidade tem `title`, não `name` — daí o segundo argumento. */
    return { alvoTipo: 'deal', alvoNome: nomeAninhado(linha.crm_deals, 'title') };
  }
  /* A constraint impede chegar aqui. Se chegou, o esquema mudou. */
  return { alvoTipo: null, alvoNome: null };
}

function Secao({
  faixa,
  atividades,
  fuso,
}: {
  faixa: Faixa;
  atividades: readonly AtividadeListada[];
  fuso: string;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
        {FAIXA_TITULO[faixa]}
        <Badge tone={FAIXA_TOM[faixa]}>{atividades.length}</Badge>
      </h2>

      <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
        {atividades.map((atividade) => (
          <Linha key={atividade.id} atividade={atividade} faixa={faixa} fuso={fuso} />
        ))}
      </ul>
    </section>
  );
}

function Linha({
  atividade,
  faixa,
  fuso,
}: {
  atividade: AtividadeListada;
  faixa: Faixa;
  fuso: string;
}) {
  const concluida = atividade.doneAt !== null;
  const prazo = instante(atividade.dueAt);

  const sobre =
    atividade.alvoNome !== null && atividade.alvoTipo !== null
      ? `${GRUPO_DO_ALVO[atividade.alvoTipo].replace(/s$/, '')}: ${atividade.alvoNome}`
      : 'Alvo removido';

  return (
    <li className="flex items-start gap-3 border-b border-line-subtle p-4 last:border-b-0">
      {/*
        O botão é um `form`, não um link: concluir por GET seria disparado pelo
        pré-carregamento do navegador, e a agenda se marcaria sozinha.
      */}
      <form action={alternarAtividade} className="pt-0.5">
        <input type="hidden" name="id" value={atividade.id} />
        <input type="hidden" name="concluida" value={concluida ? 'sim' : 'nao'} />
        <button
          type="submit"
          aria-label={concluida ? `Reabrir ${atividade.subject}` : `Concluir ${atividade.subject}`}
          className={
            concluida
              ? 'flex size-5 items-center justify-center rounded border border-success bg-success text-white transition-colors'
              : 'flex size-5 items-center justify-center rounded border border-line-strong transition-colors hover:border-content-accent hover:bg-surface-muted'
          }
        >
          {concluida && (
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
              <path
                d="M3 8.5l3.5 3.5L13 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p className={concluida ? 'text-content-muted line-through' : 'font-medium text-content'}>
          {atividade.subject}
        </p>

        <p className="mt-0.5 truncate text-sm text-content-muted">
          {sobre}
          {atividade.tipo !== null && ` · ${atividade.tipo}`}
        </p>

        {atividade.notes !== null && (
          <p className="mt-1 text-sm text-content-subtle">{atividade.notes}</p>
        )}
      </div>

      {prazo !== null && (
        <time
          dateTime={prazo.toISOString()}
          className={
            faixa === 'atrasada'
              ? 'shrink-0 text-xs font-medium text-danger'
              : 'shrink-0 text-xs text-content-subtle'
          }
        >
          {formatInstant(prazo, fuso)}
        </time>
      )}
    </li>
  );
}
