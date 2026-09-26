import {
  type PermissionCode,
  addDays,
  can,
  instantFromLocal,
  startOfMonth,
  stockSummary,
  todayIn,
} from '@tivexy/core';
import type { Metadata } from 'next';

import { NoTenant } from '@/components/page/no-tenant';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { funilAberto, serieDeVendas } from '@/lib/painel/dashboard';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar } from '@/lib/terms/vocabulary';

import {
  type Agenda,
  Dashboard,
  type Dinheiro,
  type Estoque,
  type Funil,
  type Vendas,
} from './dashboard';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/painel') };
}

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

const DIA_POR_EXTENSO = (fuso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: fuso,
  });

function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* ── Leituras — cada uma só roda para quem pode ler, e falha sozinha ─── */

async function lerVendas(
  supabase: Supabase,
  tenantId: string,
  fuso: string,
  hoje: string,
): Promise<Vendas | null> {
  const inicioDeHoje = instantFromLocal(hoje, '00:00', fuso);
  const inicioDeAmanha = instantFromLocal(addDays(hoje, 1), '00:00', fuso);
  const inicioDoMes = instantFromLocal(startOfMonth(hoje), '00:00', fuso);
  const [hojeR, mesR, diasR] = await Promise.all([
    supabase.rpc('erp_sales_summary', {
      p_tenant_id: tenantId,
      p_from: inicioDeHoje,
      p_to: inicioDeAmanha,
    }),
    supabase.rpc('erp_sales_summary', {
      p_tenant_id: tenantId,
      p_from: inicioDoMes,
      p_to: inicioDeAmanha,
    }),
    supabase.rpc('erp_sales_daily', {
      p_tenant_id: tenantId,
      p_from: addDays(hoje, -13),
      p_to: hoje,
      p_time_zone: fuso,
    }),
  ]);
  if (hojeR.error !== null || mesR.error !== null || diasR.error !== null) return null;
  const linha = (r: unknown) =>
    (Array.isArray(r) ? r[0] : r) as Record<string, unknown> | undefined;
  const h = linha(hojeR.data);
  const m = linha(mesR.data);
  return {
    hoje: { vendas: numero(h?.sales_count), total: numero(h?.total_cents) },
    mes: { vendas: numero(m?.sales_count), total: numero(m?.total_cents) },
    dias: serieDeVendas(Array.isArray(diasR.data) ? diasR.data : []),
  };
}

async function lerDinheiro(
  supabase: Supabase,
  tenantId: string,
  hoje: string,
): Promise<Dinheiro | null> {
  const { data, error } = await supabase.rpc('finance_summary', {
    p_tenant_id: tenantId,
    p_today: hoje,
    p_month_start: startOfMonth(hoje),
  });
  if (error !== null) return null;
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    saldoDoMes: numero(r?.received_month_cents) - numero(r?.paid_month_cents),
    entrouNoMes: numero(r?.received_month_cents),
    aReceberVencido: numero(r?.receivable_overdue_cents),
    aPagar30: numero(r?.payable_next30_cents),
    aReceber30: numero(r?.receivable_next30_cents),
  };
}

async function lerFunil(
  supabase: Supabase,
  tenantId: string,
  fuso: string,
  hoje: string,
): Promise<Funil | 'sem-funil' | null> {
  const { data: funis, error } = await supabase
    .from('crm_pipelines')
    .select('id, name, is_default')
    .eq('tenant_id', tenantId)
    .order('position');
  if (error !== null) return null;
  const funil = (funis ?? []).find((f) => f.is_default === true) ?? funis?.[0];
  if (funil === undefined) return 'sem-funil';

  const inicioDoMes = instantFromLocal(startOfMonth(hoje), '00:00', fuso);
  const [etapasR, abertasR, fechadasR, todasEtapasR] = await Promise.all([
    supabase
      .from('crm_pipeline_stages')
      .select('id, name, kind, position')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id),
    supabase
      .from('crm_deals')
      .select('stage_id, value_cents')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id)
      .is('closed_at', null)
      .limit(5000),
    supabase
      .from('crm_deals')
      .select('stage_id, value_cents')
      .eq('tenant_id', tenantId)
      .gte('closed_at', inicioDoMes)
      .limit(5000),
    supabase.from('crm_pipeline_stages').select('id, kind').eq('tenant_id', tenantId),
  ]);
  if ([etapasR, abertasR, fechadasR, todasEtapasR].some((r) => r.error !== null)) return null;

  // Ganho é a etapa de ganho de qualquer funil da empresa — não só do padrão.
  const ganho = new Set(
    (todasEtapasR.data ?? []).filter((e) => e.kind === 'won').map((e) => String(e.id)),
  );
  const ganhos = (fechadasR.data ?? []).filter((d) => ganho.has(String(d.stage_id)));
  return {
    nome: String(funil.name),
    etapas: funilAberto(
      (etapasR.data ?? []).map((e) => ({
        id: String(e.id),
        nome: String(e.name),
        tipo: String(e.kind),
        posicao: numero(e.position),
      })),
      (abertasR.data ?? []).map((d) => ({
        etapaId: String(d.stage_id),
        valorCentavos: d.value_cents === null ? null : numero(d.value_cents),
      })),
    ),
    ganhosNoMes: {
      quantidade: ganhos.length,
      valor: ganhos.reduce((t, d) => t + numero(d.value_cents), 0),
    },
  };
}

/** Uma contagem do banco; falha vira `null` — nunca zero, que seria "não há". */
async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await consulta;
  return error === null ? (count ?? 0) : null;
}

async function lerAgenda(
  supabase: Supabase,
  tenantId: string,
  eu: string,
  fuso: string,
  hoje: string,
): Promise<Agenda> {
  const inicioDeHoje = instantFromLocal(hoje, '00:00', fuso);
  const inicioDeAmanha = instantFromLocal(addDays(hoje, 1), '00:00', fuso);
  const minhas = () =>
    supabase
      .from('crm_activities')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('owner_id', eu)
      .is('done_at', null);
  const [atrasadas, deHoje] = await Promise.all([
    contar(minhas().lt('due_at', inicioDeHoje)),
    contar(minhas().gte('due_at', inicioDeHoje).lt('due_at', inicioDeAmanha)),
  ]);
  return { atrasadas, hoje: deHoje };
}

async function lerEstoque(supabase: Supabase, tenantId: string): Promise<Estoque | null> {
  const [produtosR, saldosR] = await Promise.all([
    supabase
      .from('erp_products')
      .select('id, min_stock, cost_cents')
      .eq('tenant_id', tenantId)
      .eq('track_stock', true)
      .eq('active', true)
      .limit(5000),
    supabase
      .from('inventory_stock_levels')
      .select('product_id, quantity')
      .eq('tenant_id', tenantId)
      .limit(10000),
  ]);
  if (produtosR.error !== null || saldosR.error !== null) return null;
  const saldo = new Map(
    (saldosR.data ?? []).map((s) => [String(s.product_id), numero(s.quantity)]),
  );
  const produtos = produtosR.data ?? [];
  const resumo = stockSummary(
    produtos.map((p) => ({
      trackStock: true,
      quantity: saldo.get(String(p.id)) ?? 0,
      minStock: p.min_stock === null ? null : numero(p.min_stock),
      costCents: p.cost_cents === null ? null : numero(p.cost_cents),
    })),
  );
  return {
    negativos: resumo.porSituacao.negative,
    zerados: resumo.porSituacao.out,
    noMinimo: resumo.porSituacao.low,
    controlados: produtos.length,
  };
}

/* ── A página ────────────────────────────────────────────────────────── */

/**
 * O painel do negócio: vendas, dinheiro, funil, agenda e estoque.
 *
 * **Todo número é consulta ao banco da empresa, agora.** Nada de série fixa,
 * de estimativa ou de número de exemplo. Cada seção só aparece para quem tem
 * o módulo e pode ler o que ela soma — e, sem dado, diz como passar a ter.
 */
export default async function PainelPage() {
  const { choice, viewer } = await requireAccess('/painel');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const [terms, fuso, supabase] = await Promise.all([
    currentTerms(),
    tenantTimeZone(),
    supabaseServer(),
  ]);
  const hoje = todayIn(fuso);
  const pode = (p: PermissionCode) => can(viewer, p);
  const eu = viewer.userId;

  const [vendas, dinheiro, funil, agenda, leadsNoMes, estoque] = await Promise.all([
    pode('erp.sales.read') ? lerVendas(supabase, tenantId, fuso, hoje) : undefined,
    pode('finance.cashflow.read') ? lerDinheiro(supabase, tenantId, hoje) : undefined,
    pode('crm.deals.read') ? lerFunil(supabase, tenantId, fuso, hoje) : undefined,
    pode('crm.activities.read') && eu !== null
      ? lerAgenda(supabase, tenantId, eu, fuso, hoje)
      : undefined,
    pode('crm.leads.read')
      ? contar(
          supabase
            .from('crm_leads')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', instantFromLocal(startOfMonth(hoje), '00:00', fuso)),
        )
      : undefined,
    pode('inventory.stock.read') ? lerEstoque(supabase, tenantId) : undefined,
  ]);

  const dataDeHoje = capitalizar(
    DIA_POR_EXTENSO(fuso).format(new Date(instantFromLocal(hoje, '12:00', fuso))),
  );

  return (
    <Dashboard
      terms={terms}
      hoje={hoje}
      dataDeHoje={dataDeHoje}
      podeRegistrarVenda={pode('erp.sales.write')}
      vendas={vendas}
      dinheiro={dinheiro}
      funil={funil}
      agenda={agenda}
      leadsNoMes={leadsNoMes}
      estoque={estoque}
    />
  );
}
