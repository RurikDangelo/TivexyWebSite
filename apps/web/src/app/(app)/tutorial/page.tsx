import { type Viewer, can, dateIn } from '@tivexy/core';
import { blueprintByCode } from '@tivexy/core/blueprints';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { requireAccess } from '@/lib/auth/require';
import { formatDate } from '@/lib/format';
import { INTEGRACOES } from '@/lib/integrations/catalog';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import {
  type Contagem,
  type Passo,
  SECOES,
  estadoDoPasso,
  passosDoTutorial,
  progresso,
} from '@/lib/tutorial/steps';

import { type SecaoNoTrilho, TrilhoDeProgresso } from './progress-rail';
import {
  type Origem,
  PASSOS_DO_ADMIN,
  SECAO_DO_ADMIN,
  TITULO_DO_ADMIN,
  TutorialSteps,
} from './tutorial-steps';

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
 *
 * Largura `registro` (max-w-[1400px]) e não `ajuste`: a seção 3 não lista esta
 * tela, e a coluna única de 768px é justamente o achado do UI_AUDIT sobre ela —
 * doze passos rolando num monitor largo com 1100px vazios ao lado. `registro` é
 * o papel cuja medida e cuja grade de duas colunas servem ao trilho lateral que
 * a correção pede.
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
  const temEmpresa = choice.kind === 'resolved';

  const daEmpresa = progresso(naTela.map((p) => p.estado));
  /*
   * Os dois passos do Admin contam junto quando a empresa existe — e o que os
   * conta é o tamanho de `PASSOS_DO_ADMIN`, não o literal 2 que estava aqui.
   */
  const feitosDoAdmin = temEmpresa ? PASSOS_DO_ADMIN.length : 0;

  /*
   * Sem empresa escolhida não há progresso a exibir.
   *
   * Antes a barra mostrava "0 de 2" — o denominador era só o do Admin, porque
   * os outros dez passos viram `sem-empresa` e saem da conta. Ler "0 de 2" num
   * tutorial de doze passos afirma um progresso que ninguém mediu. `null` é o
   * que o trilho traduz como "não dá para medir ainda".
   */
  const feitosTotal = temEmpresa ? daEmpresa.feitos + feitosDoAdmin : null;
  const totalGeral = temEmpresa ? daEmpresa.total + PASSOS_DO_ADMIN.length : null;

  const secoesNoTrilho: readonly SecaoNoTrilho[] = [
    {
      id: SECAO_DO_ADMIN,
      rotulo: TITULO_DO_ADMIN,
      feitos: feitosDoAdmin,
      total: PASSOS_DO_ADMIN.length,
    },
    ...SECOES.filter((secao) => naTela.some((p) => p.passo.secao === secao.codigo)).map((secao) => {
      const { feitos, total } = progresso(
        naTela.filter((p) => p.passo.secao === secao.codigo).map((p) => p.estado),
      );
      return {
        id: `secao-${secao.codigo}`,
        rotulo: secao.titulo,
        feitos,
        /* Zero passos contáveis = módulo fora do contrato, ou sem empresa: não há fração. */
        total: total === 0 ? null : total,
      };
    }),
    { id: 'secao-externo', rotulo: 'O que ainda é externo', feitos: 0, total: null },
  ];

  return (
    <Page variant="registro">
      <PageHeader
        titulo="Tutorial"
        descricao="Da empresa criada no Admin à primeira venda. Cada passo diz como fazer — e está feito quando o que ele pede existe no sistema, não quando alguém marca."
      />

      <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        {/*
         * O trilho gruda abaixo do header fixo. Era um bloco no fluxo, que subia
         * junto com a rolagem e sumia — justamente a informação que a pessoa
         * mais consulta enquanto percorre os passos.
         */}
        <aside className="xl:sticky xl:top-[calc(var(--header-h)_+_1.5rem)] xl:self-start">
          <TrilhoDeProgresso feitos={feitosTotal} total={totalGeral} secoes={secoesNoTrilho} />
        </aside>

        <TutorialSteps
          passos={naTela}
          temEmpresa={temEmpresa}
          origem={origem}
          superAdmin={viewer.isSuperAdmin}
          externos={INTEGRACOES}
          podeVerIntegracoes={can(viewer, 'integrations.connections.read')}
        />
      </div>
    </Page>
  );
}
