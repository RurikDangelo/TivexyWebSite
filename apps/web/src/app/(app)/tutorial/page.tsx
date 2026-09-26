import { type Viewer, can, dateIn } from '@tivexy/core';
import { blueprintByCode } from '@tivexy/core/blueprints';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/page/header';
import { requireAccess } from '@/lib/auth/require';
import { formatDate } from '@/lib/format';
import { INTEGRACOES } from '@/lib/integrations/catalog';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import {
  type Contagem,
  type Passo,
  estadoDoPasso,
  passosDoTutorial,
  progresso,
} from '@/lib/tutorial/steps';

import { type Origem, TutorialSteps } from './tutorial-steps';

export const metadata: Metadata = { title: 'Tutorial' };

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

/** Uma contagem do banco; falha vira `null` — nunca zero, que seria "ainda não fez". */
async function quantos(
  consulta: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  const { count, error } = await consulta;
  return error === null ? (count ?? 0) : null;
}

/**
 * Conta o que cada passo pede, só onde esta pessoa lê: o que ela não lê fica
 * sem contar, e o passo diz que não dá para conferir — em vez de zero.
 */
async function contar(
  supabase: Supabase,
  tenantId: string,
  viewer: Viewer,
  passos: readonly Passo[],
): Promise<Map<Contagem, number | null>> {
  const cabeca = { count: 'exact', head: true } as const;
  const tabela = (nome: string) =>
    supabase.from(nome).select('id', cabeca).eq('tenant_id', tenantId);

  const consultas: Record<Contagem, () => Promise<number | null>> = {
    'dados-da-empresa': async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('legal_name, document')
        .eq('id', tenantId)
        .maybeSingle();
      if (error !== null) return null;
      const razao = typeof data?.legal_name === 'string' ? data.legal_name.trim() : '';
      return razao !== '' && typeof data?.document === 'string' ? 1 : 0;
    },
    equipe: () => quantos(tabela('tenant_users').in('status', ['active', 'invited'])),
    'crm-leads': () => quantos(tabela('crm_leads')),
    'crm-deals': () => quantos(tabela('crm_deals')),
    'crm-activities': () => quantos(tabela('crm_activities')),
    'erp-products': () => quantos(tabela('erp_products')),
    'inventory-in': () => quantos(tabela('inventory_movements').in('kind', ['in', 'adjustment'])),
    'erp-sales': () => quantos(tabela('erp_sales')),
    'finance-entries': () => quantos(tabela('finance_entries')),
    'automation-rules': () => quantos(tabela('automation_rules')),
  };

  const pedidas = passos.filter((p) => p.leitura === null || can(viewer, p.leitura));
  const resultados = await Promise.all(
    pedidas.map(async (p) => [p.contagem, await consultas[p.contagem]()] as const),
  );
  return new Map(resultados);
}

/** De que Blueprint a empresa nasceu, e quando — da execução de provisionamento que deu certo. */
async function origemDaEmpresa(
  supabase: Supabase,
  tenantId: string,
  fuso: string,
): Promise<Origem | null> {
  const { data, error } = await supabase
    .from('provisioning_runs')
    .select('payload, finished_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error !== null || data === null) return null;
  const payload = (data.payload ?? {}) as { blueprint?: { code?: unknown } };
  const codigo = typeof payload.blueprint?.code === 'string' ? payload.blueprint.code : null;
  return {
    blueprint: codigo === null ? null : (blueprintByCode(codigo)?.name ?? null),
    quando:
      typeof data.finished_at === 'string' ? formatDate(dateIn(data.finished_at, fuso)) : null,
  };
}

/**
 * O tutorial de ponta a ponta — do Admin à primeira venda.
 *
 * O progresso é contado no banco, não marcado à mão: um passo está feito
 * quando o que ele pede existe. Pede vínculo com a empresa; o Super Admin
 * sem empresa escolhida chega pelo endereço e vê o guia sem progresso, com o
 * primeiro passo — que é dele — levando ao Admin.
 */
export default async function TutorialPage() {
  const { choice, viewer } = await requireAccess('/tutorial');
  const terms = await currentTerms();
  const passos = passosDoTutorial(terms);

  let contagens = new Map<Contagem, number | null>();
  let origem: Origem | null = null;
  if (choice.kind === 'resolved') {
    const supabase = await supabaseServer();
    const fuso = await tenantTimeZone();
    [contagens, origem] = await Promise.all([
      contar(supabase, choice.tenant.id, viewer, passos),
      origemDaEmpresa(supabase, choice.tenant.id, fuso),
    ]);
  }

  const naTela = passos.map((passo) => ({
    passo,
    estado: estadoDoPasso(passo, viewer, contagens),
  }));
  const { feitos, total } = progresso(naTela.map((p) => p.estado));
  const temEmpresa = choice.kind === 'resolved';
  // Os dois passos do Admin contam junto quando a empresa existe.
  const feitosTotal = feitos + (temEmpresa ? 2 : 0);
  const totalGeral = total + 2;
  const fracao = totalGeral === 0 ? 0 : feitosTotal / totalGeral;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo="Tutorial"
        descricao="Da empresa criada no Admin à primeira venda. Cada passo diz como fazer — e está feito quando o que ele pede existe no sistema, não quando alguém marca."
      />

      <div className="mb-6 rounded-lg border border-line-subtle bg-surface-subtle px-4 py-3">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-content-default">
            {temEmpresa ? 'Nesta empresa' : 'Escolha uma empresa para ver o progresso'}
          </span>
          <span className="font-display text-lg font-bold text-content tabular-nums">
            {feitosTotal} de {totalGeral}
          </span>
        </p>
        <div
          role="progressbar"
          aria-label="Passos feitos"
          aria-valuemin={0}
          aria-valuemax={totalGeral}
          aria-valuenow={feitosTotal}
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div
            className="h-full origin-left animate-fill rounded-full bg-success"
            style={{ width: `${Math.round(fracao * 100)}%` }}
          />
        </div>
        {temEmpresa && feitosTotal === totalGeral && (
          <p className="mt-2 text-sm text-success">
            Tudo feito. Daqui em diante, o painel mostra o negócio.
          </p>
        )}
      </div>

      <TutorialSteps
        passos={naTela}
        temEmpresa={temEmpresa}
        origem={origem}
        superAdmin={viewer.isSuperAdmin}
        externos={INTEGRACOES}
        podeVerIntegracoes={can(viewer, 'integrations.connections.read')}
      />
    </div>
  );
}
