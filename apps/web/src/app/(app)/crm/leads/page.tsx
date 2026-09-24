import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';

import { CRM_LEAD_STATUSES, type CrmLeadStatus, isLeadClosed } from '@tivexy/core';
import { BarraDeBusca, SemResultado } from '@/components/crm/search-bar';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { filtroOu, parametro, umDentre } from '@/lib/crm/busca';
import { capitalizar, currentTerms, term } from '@/lib/crm/terms';
import { supabaseServer } from '@/lib/supabase/server';

import { LeadForm } from './lead-form';
import { LeadRow, type LeadListado } from './lead-row';
import { LEAD_STATUS_LABEL, type EtapaOferecida } from './state';

export const metadata: Metadata = { title: 'Leads' };

/** O rótulo genérico, quando o nicho não traduz. */
const PADRAO = { singular: 'lead', plural: 'leads' };

/**
 * A fila de leads.
 *
 * Primeira tela de módulo de negócio do Tivexy — e a primeira em que o
 * vocabulário do Blueprint aparece: uma clínica lê aqui o que ela chama de
 * lead, sem que exista uma segunda tela.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas, e a
 * consulta sem filtro devolveria as duas listas misturadas. O RLS é o piso,
 * não o filtro.
 */
/** Os estados oferecidos no filtro, mais os dois atalhos que valem por vários. */
const ESTADOS_DO_FILTRO = ['todos', 'abertos', ...CRM_LEAD_STATUSES] as const;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/crm/leads');
  const rotulo = term(await currentTerms(), 'crm.leads', PADRAO);

  const params = await searchParams;
  const termo = parametro(params, 'b');
  /*
   * `abertos` é o padrão, e não `todos`. Quem abre esta tela vai trabalhar a
   * fila — o descartado de três meses atrás não é o que se quer ver primeiro.
   * Continua alcançável: é uma opção do filtro, não um dado escondido.
   */
  const estado = umDentre(parametro(params, 'estado'), ESTADOS_DO_FILTRO, 'abertos');

  if (choice.kind !== 'resolved') {
    /* `requireAccess` já mandaria para `/empresas`; isto é a rede embaixo. */
    return null;
  }

  const supabase = await supabaseServer();

  /*
   * As etapas onde uma oportunidade pode nascer.
   *
   * Só as `open`: converter direto para "Ganho" existe em teoria e na prática
   * é engano de clique, e o negócio nasceria fechado sem nunca ter sido
   * trabalhado — sujando o tempo médio de ciclo de todo mundo.
   *
   * Quem não tem `crm.deals.read` recebe lista vazia pelo RLS, e o botão de
   * converter some sozinho. É a política decidindo a interface, sem um segundo
   * `if` aqui para esquecer de atualizar.
   */
  const { data: etapasBrutas } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, position, crm_pipelines!inner(name, position)')
    .eq('tenant_id', choice.tenant.id)
    .eq('kind', 'open')
    .order('position');

  const etapas: EtapaOferecida[] = (etapasBrutas ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    funil: String(
      (linha.crm_pipelines as { name?: unknown } | null)?.name ??
        (Array.isArray(linha.crm_pipelines) ? linha.crm_pipelines[0]?.name : '') ??
        '',
    ),
  }));

  const filtro = filtroOu(termo, ['name', 'email', 'phone', 'company_name', 'source']);

  let consulta = supabase
    .from('crm_leads')
    .select('id, name, email, phone, company_name, source, status, created_at')
    .eq('tenant_id', choice.tenant.id);

  if (filtro !== null) consulta = consulta.or(filtro);

  /*
   * O estado entra como filtro do banco, e não como `Array.filter` depois:
   * com o teto de 200, filtrar na aplicação faria "descartados" mostrar só os
   * descartados que por acaso estivessem entre os 200 mais recentes de todos.
   */
  if (estado === 'abertos') consulta = consulta.in('status', ['new', 'contacted', 'qualified']);
  else if (estado !== 'todos') consulta = consulta.eq('status', estado);

  const { data, error } = await consulta.order('created_at', { ascending: false }).limit(200);

  const leads: LeadListado[] = (data ?? []).map((linha) => ({
    id: String(linha.id),
    name: String(linha.name),
    email: (linha.email as string | null) ?? null,
    phone: (linha.phone as string | null) ?? null,
    companyName: (linha.company_name as string | null) ?? null,
    source: (linha.source as string | null) ?? null,
    status: linha.status as CrmLeadStatus,
    createdAt: String(linha.created_at),
  }));

  /*
   * Quem ainda dá trabalho primeiro. Descartado e convertido continuam na
   * lista — apagar da tela o que teve desfecho esconde justamente o que
   * responde "o que aconteceu com aquele contato de terça".
   */
  const abertos = leads.filter((l) => !isLeadClosed(l.status));
  const fechados = leads.filter((l) => isLeadClosed(l.status));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">
          {capitalizar(rotulo.plural)}
        </h1>
        <p className="mt-1 text-content-muted">
          Contatos que ainda não viraram cliente. {abertos.length} em aberto
          {fechados.length > 0 && `, ${fechados.length} com desfecho`}.
        </p>
      </header>

      <div className="mb-6">
        <LeadForm singular={rotulo.singular} />
      </div>

      <BarraDeBusca
        termo={termo}
        placeholder={`Nome, e-mail, telefone ou origem`}
        filtro={{
          nome: 'estado',
          rotulo: 'Estado',
          valor: estado,
          opcoes: [
            { valor: 'abertos', texto: 'Em aberto' },
            { valor: 'todos', texto: 'Todos' },
            ...CRM_LEAD_STATUSES.map((s) => ({ valor: s, texto: LEAD_STATUS_LABEL[s] })),
          ],
        }}
      />

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler a lista</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {leads.length === 0 && error === null && termo !== '' ? (
        <SemResultado termo={termo} limpar="/crm/leads" />
      ) : leads.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <Inbox className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhum {rotulo.singular} ainda</CardTitle>
            <CardDescription>
              Cadastre o primeiro com o botão acima. Só o nome é obrigatório — o resto entra quando
              você souber.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Secao
            titulo="Em aberto"
            leads={abertos}
            etapas={etapas}
            vazio={`Nenhum ${rotulo.singular} em aberto.`}
          />
          {fechados.length > 0 && (
            <Secao titulo="Com desfecho" leads={fechados} etapas={etapas} vazio="" />
          )}
        </div>
      )}
    </div>
  );
}

function Secao({
  titulo,
  leads,
  etapas,
  vazio,
}: {
  titulo: string;
  leads: readonly LeadListado[];
  etapas: readonly EtapaOferecida[];
  vazio: string;
}) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
        {titulo}
      </h2>

      {leads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-subtle px-4 py-6 text-center text-sm text-content-muted">
          {vazio}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} etapas={etapas} />
          ))}
        </ul>
      )}
    </section>
  );
}
