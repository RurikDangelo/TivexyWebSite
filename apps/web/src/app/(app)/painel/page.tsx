import {
  type PermissionCode,
  addDays,
  agendaBucket,
  can,
  instantFromLocal,
  stockSummary,
  todayIn,
} from '@tivexy/core';
import type { Metadata } from 'next';

import { NoTenant } from '@/components/page/no-tenant';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { quando } from '@/lib/crm/agenda-text';
import {
  type Janela,
  avisoDeTruncamento,
  funilAberto,
  janelaDoPeriodo,
  periodoPedido,
  serieDeVendas,
} from '@/lib/painel/dashboard';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import {
  type Agenda,
  type AtividadeNaAgenda,
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

const HORA = (fuso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso });

function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/*
 * Tetos das consultas que o PostgREST não sabe agregar.
 *
 * Eles existiam antes como `.limit(5000)` mudo, e a tela somava o que viesse e
 * chamava de total da empresa. Agora cada consulta pede `count: 'exact'`
 * junto: o banco diz quantas linhas existem, e quando o teto morde, o número
 * sai marcado como parcial em vez de mentir (UI_AUDIT, painel/page.tsx:139).
 */
const TETO_DE_NEGOCIOS = 5000;
const TETO_DE_PRODUTOS = 5000;
const TETO_DE_SALDOS = 10000;

/** Quantas atividades cabem no painel lateral sem virar uma segunda agenda. */
const PROXIMAS_NA_AGENDA = 5;

/* ── Leituras — cada uma só roda para quem pode ler, e falha sozinha ─── */

/**
 * As vendas do período e as do período anterior, dia a dia.
 *
 * Dois `erp_sales_daily`, e não um intervalo só: a função recusa vãos acima de
 * 92 dias, e 90 + 90 daria 180. Os totais saem da soma da própria série, não
 * de um segundo RPC — assim o número do cartão e a altura das barras não têm
 * como discordar.
 */
async function lerVendas(
  supabase: Supabase,
  tenantId: string,
  fuso: string,
  janela: Janela,
): Promise<Vendas | null> {
  const [atualR, anteriorR] = await Promise.all([
    supabase.rpc('erp_sales_daily', {
      p_tenant_id: tenantId,
      p_from: janela.inicio,
      p_to: janela.fim,
      p_time_zone: fuso,
    }),
    supabase.rpc('erp_sales_daily', {
      p_tenant_id: tenantId,
      p_from: janela.inicioAnterior,
      p_to: janela.fimAnterior,
      p_time_zone: fuso,
    }),
  ]);
  if (atualR.error !== null) return null;

  const dias = serieDeVendas(Array.isArray(atualR.data) ? atualR.data : []);
  /*
   * A janela anterior falhando não derruba o período pedido: o gráfico perde a
   * linha pontilhada e os cartões dizem "sem base para comparar", que é
   * exatamente o que aconteceu.
   */
  const anteriores =
    anteriorR.error === null && Array.isArray(anteriorR.data)
      ? serieDeVendas(anteriorR.data)
      : null;

  const soma = (s: readonly { totalCentavos: number }[]) =>
    s.reduce((t, d) => t + d.totalCentavos, 0);
  const conta = (s: readonly { vendas: number }[]) => s.reduce((t, d) => t + d.vendas, 0);

  return {
    dias,
    diasAnteriores: anteriores,
    total: soma(dias),
    quantidade: conta(dias),
    totalAnterior: anteriores === null ? null : soma(anteriores),
    /* O último dia da série é hoje: o RPC devolve todo dia do período, inclusive o de hoje. */
    hoje: dias[dias.length - 1] ?? null,
  };
}

/**
 * O dinheiro do período, e o do período anterior para a comparação.
 *
 * `finance_summary` recebe duas datas e soma o que foi pago entre elas —
 * o nome `p_month_start` é herança de quando a janela era sempre o mês. Na
 * chamada da janela anterior só `received`/`paid` são lidos: `vencido` e
 * `próximos 30` daquela chamada seriam relativos a uma data passada.
 */
async function lerDinheiro(
  supabase: Supabase,
  tenantId: string,
  hoje: string,
  janela: Janela,
): Promise<Dinheiro | null> {
  const [atualR, anteriorR] = await Promise.all([
    supabase.rpc('finance_summary', {
      p_tenant_id: tenantId,
      p_today: hoje,
      p_month_start: janela.inicio,
    }),
    supabase.rpc('finance_summary', {
      p_tenant_id: tenantId,
      p_today: janela.fimAnterior,
      p_month_start: janela.inicioAnterior,
    }),
  ]);
  if (atualR.error !== null) return null;

  const linha = (v: unknown) =>
    ((Array.isArray(v) ? v[0] : v) ?? undefined) as Record<string, unknown> | undefined;
  const r = linha(atualR.data);
  const entrou = numero(r?.received_month_cents);
  const saiu = numero(r?.paid_month_cents);

  const a = anteriorR.error === null ? linha(anteriorR.data) : undefined;
  const saldoAnterior =
    a === undefined ? null : numero(a.received_month_cents) - numero(a.paid_month_cents);

  return {
    saldo: entrou - saiu,
    entrou,
    saiu,
    saldoAnterior,
    aReceberVencido: numero(r?.receivable_overdue_cents),
    aPagar30: numero(r?.payable_next30_cents),
    aReceber30: numero(r?.receivable_next30_cents),
  };
}

/** Uma contagem do banco; falha vira `null` — nunca zero, que seria "não há". */
async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await consulta;
  return error === null ? (count ?? 0) : null;
}

async function lerFunil(
  supabase: Supabase,
  tenantId: string,
  fuso: string,
  janela: Janela,
  rotuloDeNegocios: string,
): Promise<Funil | 'sem-funil' | null> {
  const { data: funis, error } = await supabase
    .from('crm_pipelines')
    .select('id, name, is_default')
    .eq('tenant_id', tenantId)
    .order('position');
  if (error !== null) return null;
  const funil = (funis ?? []).find((f) => f.is_default === true) ?? funis?.[0];
  if (funil === undefined) return 'sem-funil';

  const desde = instantFromLocal(janela.inicio, '00:00', fuso);
  const ate = instantFromLocal(addDays(janela.fim, 1), '00:00', fuso);
  const desdeAnterior = instantFromLocal(janela.inicioAnterior, '00:00', fuso);

  const [etapasR, abertasR, fechadasR, fechadasAnterioresR, todasEtapasR] = await Promise.all([
    supabase
      .from('crm_pipeline_stages')
      .select('id, name, kind, position')
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id),
    supabase
      .from('crm_deals')
      .select('stage_id, value_cents', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('pipeline_id', funil.id)
      .is('closed_at', null)
      .limit(TETO_DE_NEGOCIOS),
    supabase
      .from('crm_deals')
      .select('stage_id, value_cents', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('closed_at', desde)
      .lt('closed_at', ate)
      .limit(TETO_DE_NEGOCIOS),
    supabase
      .from('crm_deals')
      .select('stage_id, value_cents', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('closed_at', desdeAnterior)
      .lt('closed_at', desde)
      .limit(TETO_DE_NEGOCIOS),
    supabase.from('crm_pipeline_stages').select('id, kind').eq('tenant_id', tenantId),
  ]);
  if ([etapasR, abertasR, fechadasR, todasEtapasR].some((r) => r.error !== null)) return null;

  // Ganho é a etapa de ganho de qualquer funil da empresa — não só do padrão.
  const ganho = new Set(
    (todasEtapasR.data ?? []).filter((e) => e.kind === 'won').map((e) => String(e.id)),
  );
  const somarGanhos = (linhas: { stage_id: string | null; value_cents: number | null }[]) => {
    const ganhas = linhas.filter((d) => ganho.has(String(d.stage_id)));
    return {
      quantidade: ganhas.length,
      valor: ganhas.reduce((t, d) => t + numero(d.value_cents), 0),
    };
  };

  const abertas = abertasR.data ?? [];
  const fechadas = fechadasR.data ?? [];
  const ganhos = somarGanhos(fechadas);

  /*
   * A janela anterior só vira base de comparação se tiver sido lida inteira.
   * Comparar contra uma soma truncada produziria uma variação inventada — pior
   * que não comparar, porque parece medida.
   */
  const anterioresCompletas =
    fechadasAnterioresR.error === null &&
    avisoDeTruncamento(
      (fechadasAnterioresR.data ?? []).length,
      fechadasAnterioresR.count,
      rotuloDeNegocios,
    ) === null;

  return {
    nome: String(funil.name),
    etapas: funilAberto(
      (etapasR.data ?? []).map((e) => ({
        id: String(e.id),
        nome: String(e.name),
        tipo: String(e.kind),
        posicao: numero(e.position),
      })),
      abertas.map((d) => ({
        etapaId: String(d.stage_id),
        valorCentavos: d.value_cents === null ? null : numero(d.value_cents),
      })),
    ),
    parcialDoAberto: avisoDeTruncamento(abertas.length, abertasR.count, rotuloDeNegocios),
    ganhos,
    parcialDosGanhos: avisoDeTruncamento(fechadas.length, fechadasR.count, rotuloDeNegocios),
    ganhosAnteriores: anterioresCompletas
      ? somarGanhos(fechadasAnterioresR.data ?? []).valor
      : null,
  };
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

  const [atrasadas, deHoje, proximasR] = await Promise.all([
    contar(minhas().lt('due_at', inicioDeHoje)),
    contar(minhas().gte('due_at', inicioDeHoje).lt('due_at', inicioDeAmanha)),
    /*
     * A agenda era contada com `head: true` e nunca trazia nada: o painel sabia
     * que havia sete atividades e não dizia uma. Cinco linhas com assunto e
     * prazo é o que transforma o número em algo acionável (UI_AUDIT,
     * dashboard.tsx:74).
     */
    supabase
      .from('crm_activities')
      .select('id, subject, due_at, lead_id, contact_id, company_id, deal_id')
      .eq('tenant_id', tenantId)
      .eq('owner_id', eu)
      .is('done_at', null)
      .not('due_at', 'is', null)
      .order('due_at')
      .limit(PROXIMAS_NA_AGENDA),
  ]);

  /*
   * Um instante só para a lista inteira. `agendaBucket` compara com "agora", e
   * chamar `new Date()` por linha faria duas atividades do mesmo segundo caírem
   * em faixas diferentes quando a consulta atravessa a virada de um minuto.
   */
  const agora = new Date();

  return {
    atrasadas,
    hoje: deHoje,
    /* `null` distingue "a lista não pôde ser lida" de "não há nada marcado". */
    proximas:
      proximasR.error !== null
        ? null
        : (proximasR.data ?? []).map((a): AtividadeNaAgenda => {
            const vence = a.due_at === null ? null : String(a.due_at);
            const faixa = agendaBucket(vence, agora, fuso);
            return {
              id: String(a.id),
              assunto: String(a.subject),
              /* Mesma frase da agenda de verdade — "14:30", "sex. 02/10 · 14:30". */
              quandoTexto: vence === null ? null : quando(vence, faixa, fuso),
              atrasada: faixa === 'overdue',
              alvo: alvoDaAtividade(a),
            };
          }),
  };
}

/**
 * Para onde a linha da agenda leva.
 *
 * O `check` da tabela garante exatamente um alvo preenchido, então a ordem das
 * comparações não cria ambiguidade. Lead vai para a lista porque `/crm/leads`
 * não tem tela de registro — mandar para uma rota que não existe seria pior
 * que mandar para a lista.
 */
function alvoDaAtividade(a: {
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_id: string | null;
}): AtividadeNaAgenda['alvo'] {
  if (a.deal_id !== null) return { tipo: 'negocio', id: String(a.deal_id) };
  if (a.contact_id !== null) return { tipo: 'contato', id: String(a.contact_id) };
  if (a.company_id !== null) return { tipo: 'empresa', id: String(a.company_id) };
  if (a.lead_id !== null) return { tipo: 'lead', id: String(a.lead_id) };
  return null;
}

/**
 * O estoque controlado, e o que dele não deu para apurar.
 *
 * Duas honestidades novas aqui. A primeira: as duas consultas pedem
 * `count: 'exact'`, e o que passar do teto vira aviso de soma parcial. A
 * segunda: produto **sem linha de saldo** só conta como zerado quando a
 * consulta de saldos veio inteira. Truncada, a linha pode existir e não ter
 * vindo — e tratá-la como zero pintaria de vermelho um produto com estoque
 * (UI_AUDIT, painel/page.tsx:139).
 */
async function lerEstoque(
  supabase: Supabase,
  tenantId: string,
  rotuloDeProdutos: string,
): Promise<Estoque | null> {
  const [produtosR, saldosR] = await Promise.all([
    supabase
      .from('erp_products')
      .select('id, min_stock, cost_cents', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('track_stock', true)
      .eq('active', true)
      .limit(TETO_DE_PRODUTOS),
    supabase
      .from('inventory_stock_levels')
      .select('product_id, quantity', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .limit(TETO_DE_SALDOS),
  ]);
  if (produtosR.error !== null || saldosR.error !== null) return null;

  const saldos = saldosR.data ?? [];
  const saldosTruncados = avisoDeTruncamento(saldos.length, saldosR.count, 'saldos') !== null;
  const saldo = new Map(saldos.map((s) => [String(s.product_id), numero(s.quantity)]));

  const produtos = produtosR.data ?? [];
  const apurados = produtos.filter((p) => !saldosTruncados || saldo.has(String(p.id)));

  const resumo = stockSummary(
    apurados.map((p) => ({
      trackStock: true,
      /* Sem linha de saldo e com a leitura completa: o produto nunca se moveu, e zero é fato. */
      quantity: saldo.get(String(p.id)) ?? 0,
      minStock: p.min_stock === null ? null : numero(p.min_stock),
      costCents: p.cost_cents === null ? null : numero(p.cost_cents),
    })),
  );

  const naoApurados = produtos.length - apurados.length;
  const avisos = [
    avisoDeTruncamento(produtos.length, produtosR.count, `${rotuloDeProdutos} controlados`),
    naoApurados > 0 ? `${naoApurados.toLocaleString('pt-BR')} sem saldo apurado` : null,
  ].filter((a): a is string => a !== null);

  return {
    negativos: resumo.porSituacao.negative,
    zerados: resumo.porSituacao.out,
    noMinimo: resumo.porSituacao.low,
    controlados: apurados.length,
    parcial: avisos.length > 0 ? avisos.join(' · ') : null,
  };
}

/* ── A página ────────────────────────────────────────────────────────── */

/**
 * O painel do negócio: vendas, dinheiro, funil, agenda e estoque.
 *
 * **Todo número é consulta ao banco da empresa, agora.** Nada de série fixa,
 * de estimativa ou de número de exemplo. Cada seção só aparece para quem tem
 * o módulo e pode ler o que ela soma — e, sem dado, diz como passar a ter.
 *
 * Três estados por seção, e a distinção é rigorosa: `undefined` é "esta pessoa
 * não pode ler isto" e a seção some; `null` é "a leitura falhou" e a seção
 * aparece dizendo isso; qualquer outra coisa é dado. Falha nunca vira zero.
 *
 * A janela é `?periodo=7d|30d|90d`, e toda comparação é contra a janela
 * imediatamente anterior de mesmo tamanho — nunca contra uma base que não foi
 * lida.
 */
export default async function PainelPage({ searchParams }: PageProps<'/painel'>) {
  const { choice, viewer } = await requireAccess('/painel');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const [terms, fuso, supabase, params] = await Promise.all([
    currentTerms(),
    tenantTimeZone(),
    supabaseServer(),
    searchParams,
  ]);
  const hoje = todayIn(fuso);
  const periodo = periodoPedido(params.periodo);
  const janela = janelaDoPeriodo(hoje, periodo);
  const pode = (p: PermissionCode) => can(viewer, p);
  const eu = viewer.userId;

  const desde = instantFromLocal(janela.inicio, '00:00', fuso);
  const desdeAnterior = instantFromLocal(janela.inicioAnterior, '00:00', fuso);
  const leadsDoTenant = () =>
    supabase
      .from('crm_leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

  const [vendas, dinheiro, funil, agenda, leads, leadsAnteriores, estoque] = await Promise.all([
    pode('erp.sales.read') ? lerVendas(supabase, tenantId, fuso, janela) : undefined,
    pode('finance.cashflow.read') ? lerDinheiro(supabase, tenantId, hoje, janela) : undefined,
    pode('crm.deals.read')
      ? lerFunil(supabase, tenantId, fuso, janela, termOf(terms, 'crm.deals').plural)
      : undefined,
    pode('crm.activities.read') && eu !== null
      ? lerAgenda(supabase, tenantId, eu, fuso, hoje)
      : undefined,
    pode('crm.leads.read') ? contar(leadsDoTenant().gte('created_at', desde)) : undefined,
    pode('crm.leads.read')
      ? contar(leadsDoTenant().gte('created_at', desdeAnterior).lt('created_at', desde))
      : undefined,
    pode('inventory.stock.read')
      ? lerEstoque(supabase, tenantId, termOf(terms, 'erp.products').plural)
      : undefined,
  ]);

  const dataDeHoje = capitalizar(
    DIA_POR_EXTENSO(fuso).format(new Date(instantFromLocal(hoje, '12:00', fuso))),
  );

  return (
    <Dashboard
      terms={terms}
      periodo={periodo}
      janela={janela}
      dataDeHoje={dataDeHoje}
      /* O relógio da leitura: o painel é lido quando a página é montada, e é este o instante. */
      lidoAs={HORA(fuso).format(new Date())}
      /*
       * Entrada só na primeira renderização da rota (seção 8, regra 3). Trocar
       * o período escreve `?periodo=` no endereço, e a partir daí a coreografia
       * não se repete — o que muda é o número, e disso cuida o `CountUp`.
       */
      animarEntrada={params.periodo === undefined}
      podeRegistrarVenda={pode('erp.sales.write')}
      podeLancarConta={pode('finance.payables.write') || pode('finance.receivables.write')}
      podeCriarNegocio={pode('crm.deals.write')}
      podeCriarAtividade={pode('crm.activities.write')}
      vendas={vendas}
      dinheiro={dinheiro}
      funil={funil}
      agenda={agenda}
      leads={leads}
      leadsAnteriores={leadsAnteriores}
      estoque={estoque}
    />
  );
}
