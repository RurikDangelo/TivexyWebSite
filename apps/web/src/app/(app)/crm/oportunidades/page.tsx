import { Workflow } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import type { CrmStageKind } from '@tivexy/core';
import type { Opcao } from '@/components/ui/field';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { capitalizar, currentTerms, term } from '@/lib/crm/terms';
import { cn } from '@/lib/utils';
import { supabaseServer } from '@/lib/supabase/server';

import { Board } from './board';
import { DealForm } from './deal-form';
import type { EtapaDoFunil, FunilListado, OportunidadeListada } from './state';

export const metadata: Metadata = { title: 'Oportunidades' };

/** Os rótulos genéricos, quando o nicho não traduz. */
const PADRAO = { singular: 'oportunidade', plural: 'oportunidades' };
const PADRAO_EMPRESA = { singular: 'empresa', plural: 'empresas' };
const PADRAO_CONTATO = { singular: 'contato', plural: 'contatos' };

/**
 * Quantas oportunidades o quadro carrega de uma vez.
 *
 * Um teto existe porque uma coluna "Ganhas" acumula para sempre, e servir dez
 * mil cartões derruba a tela de quem mais usa o sistema. O teto por si só não
 * é honesto — os totais de cada coluna sairiam errados sem avisar, que é pior
 * que lista cortada. Por isso a tela diz quando cortou. Ver `Aviso`, abaixo.
 */
const TETO = 500;

/**
 * O funil.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas, e a
 * consulta sem filtro devolveria as duas listas misturadas. O RLS é o piso,
 * não o filtro.
 *
 * ## A situação é a da etapa
 *
 * Não há coluna de situação na oportunidade — ganha, perdida e em aberto são
 * o `kind` da etapa onde ela está. Esta tela nunca escreve `closed_at`: quem
 * mantém é o gatilho `sync_deal_closed_at`. Ver `actions.ts`.
 */
export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/crm/oportunidades');
  const termos = await currentTerms();
  const rotulo = term(termos, 'crm.deals', PADRAO);
  const rotuloEmpresa = term(termos, 'crm.companies', PADRAO_EMPRESA);
  const rotuloContato = term(termos, 'crm.contacts', PADRAO_CONTATO);

  if (choice.kind !== 'resolved') {
    /* `requireAccess` já mandaria para `/empresas`; isto é a rede embaixo. */
    return null;
  }

  const supabase = await supabaseServer();

  const { data: funisBrutos, error: erroFunis } = await supabase
    .from('crm_pipelines')
    .select('id, name, is_default, position')
    .eq('tenant_id', choice.tenant.id)
    .order('position');

  const funis: FunilListado[] = (funisBrutos ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    padrao: linha.is_default === true,
  }));

  if (funis.length === 0) {
    return (
      <Moldura titulo={capitalizar(rotulo.plural)}>
        {erroFunis !== null ? (
          <Falha mensagem={erroFunis.message} />
        ) : (
          <Card>
            <CardHeader>
              <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
                <Workflow className="size-5 text-content-subtle" aria-hidden />
              </div>
              <CardTitle>Nenhum funil configurado</CardTitle>
              <CardDescription>
                O funil e as etapas vêm do nicho, no provisionamento. Esta empresa foi criada sem
                eles — quem resolve é o Super Admin, não esta tela.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </Moldura>
    );
  }

  /*
   * Qual funil mostrar. O endereço manda; sem ele, o padrão do tenant; sem
   * padrão, o primeiro. Um identificador que não é da lista cai no padrão em
   * vez de mostrar quadro vazio — e como a lista veio filtrada pelo tenant,
   * um id de outra empresa simplesmente não casa.
   */
  const pedido = (await searchParams).funil;
  const escolhido = typeof pedido === 'string' ? funis.find((f) => f.id === pedido) : undefined;
  const funil = escolhido ?? funis.find((f) => f.padrao) ?? funis[0];

  const { data: etapasBrutas } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, kind, position')
    .eq('tenant_id', choice.tenant.id)
    .eq('pipeline_id', funil.id)
    .order('position');

  const etapas: EtapaDoFunil[] = (etapasBrutas ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    tipo: linha.kind as CrmStageKind,
    posicao: Number(linha.position),
  }));

  const { data: negociosBrutos, error } = await supabase
    .from('crm_deals')
    .select(
      'id, title, value_cents, stage_id, expected_close_date, crm_companies(name), crm_contacts(name)',
    )
    .eq('tenant_id', choice.tenant.id)
    .eq('pipeline_id', funil.id)
    .order('updated_at', { ascending: false })
    .limit(TETO);

  const oportunidades: OportunidadeListada[] = (negociosBrutos ?? []).map((linha) => ({
    id: String(linha.id),
    titulo: String(linha.title),
    valorCentavos: Number(linha.value_cents),
    etapaId: String(linha.stage_id),
    empresa: nomeAninhado(linha.crm_companies),
    contato: nomeAninhado(linha.crm_contacts),
    previsao: (linha.expected_close_date as string | null) ?? null,
  }));

  /* As opções dos dois campos de vínculo. Lista vazia esconde o campo — ver `DealForm`. */
  const [empresas, contatos] = await Promise.all([
    opcoesDe(supabase, 'crm_companies', choice.tenant.id),
    opcoesDe(supabase, 'crm_contacts', choice.tenant.id),
  ]);

  return (
    <Moldura
      titulo={capitalizar(rotulo.plural)}
      descricao={`${oportunidades.length} no funil ${funil.nome}.`}
    >
      {funis.length > 1 && <Abas funis={funis} atual={funil.id} />}

      {etapas.length > 0 && (
        <div className="mb-6">
          <DealForm
            singular={rotulo.singular}
            etapas={etapas}
            empresas={empresas}
            contatos={contatos}
            rotuloEmpresa={capitalizar(rotuloEmpresa.singular)}
            rotuloContato={capitalizar(rotuloContato.singular)}
          />
        </div>
      )}

      {error !== null && <Falha mensagem={error.message} />}

      {oportunidades.length === TETO && <Aviso />}

      {etapas.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>O funil {funil.nome} não tem etapas</CardTitle>
            <CardDescription>
              Sem etapa não há onde uma {rotulo.singular} entrar. As etapas vêm do nicho, no
              provisionamento.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Board etapas={etapas} oportunidades={oportunidades} />
      )}
    </Moldura>
  );
}

/**
 * As opções de vínculo de uma tabela do CRM.
 *
 * Quem não tem `crm.companies.read` recebe lista vazia pelo RLS, e o campo
 * some sozinho do formulário — a política decidindo a interface, sem um
 * segundo `if` aqui para esquecer de atualizar.
 */
async function opcoesDe(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  tabela: 'crm_companies' | 'crm_contacts',
  tenantId: string,
): Promise<Opcao[]> {
  const { data } = await supabase
    .from(tabela)
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name')
    .limit(200);

  return (data ?? []).map((linha) => ({ valor: String(linha.id), texto: String(linha.name) }));
}

function Moldura({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">{titulo}</h1>
        {descricao !== undefined && <p className="mt-1 text-content-muted">{descricao}</p>}
      </header>
      {children}
    </div>
  );
}

/** A escolha do funil. Links, porque trocar de funil é navegar, não escrever. */
function Abas({ funis, atual }: { funis: readonly FunilListado[]; atual: string }) {
  return (
    <nav aria-label="Funis" className="mb-6 flex flex-wrap gap-1.5">
      {funis.map((funil) => (
        <Link
          key={funil.id}
          href={`/crm/oportunidades?funil=${funil.id}`}
          aria-current={funil.id === atual ? 'page' : undefined}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm transition-colors',
            funil.id === atual
              ? 'border-transparent bg-surface-brand text-content-on-brand'
              : 'border-line-strong text-content-default hover:bg-surface-muted',
          )}
        >
          {funil.nome}
        </Link>
      ))}
    </nav>
  );
}

function Falha({ mensagem }: { mensagem: string }) {
  return (
    <Card className="mb-4 border-danger/30">
      <CardHeader>
        <CardTitle className="text-sm text-danger">Não consegui ler o funil</CardTitle>
        <CardDescription>{mensagem}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * O aviso de lista cortada.
 *
 * Existe porque os totais de cada coluna são somados do que veio, e não do que
 * há. Sem este aviso, o número no cabeçalho da coluna "Ganhas" seria uma
 * mentira plausível — e mentira plausível em cima de dinheiro é a pior que
 * este sistema pode contar.
 */
function Aviso() {
  return (
    <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
      Mostrando as {TETO} oportunidades mexidas mais recentemente deste funil. Os totais de cada
      coluna somam só estas — não o funil inteiro.
    </p>
  );
}
