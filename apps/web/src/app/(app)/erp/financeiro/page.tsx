import {
  type FinanceDirection,
  addDays,
  can,
  financeStatus,
  startOfMonth,
  todayIn,
} from '@tivexy/core';
import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { FilterBar } from '@/components/page/filter-bar';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { GradeDePainel, Page } from '@/components/page/page';
import { Pagination } from '@/components/page/pagination';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Tabs } from '@/components/ui/tabs';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { agruparPorSemana, segundaDaSemana, vencimentoEmTexto } from '@/lib/erp/finance-text';
import { formatDate, formatDayMonth } from '@/lib/format';
import { ilikeTerm, paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { CashflowChart } from './cashflow-chart';
import { EntryForm } from './entry-form';
import { EntryRows } from './entry-rows';
import {
  type Aba,
  COLUNAS_DE_ORDEM,
  JANELA,
  PERIODOS,
  PERIODO_PADRAO,
  POR_PAGINA,
  type LancamentoNaTela,
  abaPedida,
  filtroPedido,
  ordemPedida,
  periodoPedido,
} from './state';
import { FinanceSummary, type ResumoFinanceiro, UpcomingDues } from './summary';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/erp/financeiro') };
}

/** Quantos vencimentos a caixa lateral mostra. O total real vem do `count`. */
const PROXIMOS_NA_TELA = 8;

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function abasDoFinanceiro(): { chave: Aba; rotulo: string; href: string }[] {
  return [
    { chave: 'visao', rotulo: 'Visão', href: '/erp/financeiro' },
    { chave: 'receber', rotulo: 'A receber', href: '/erp/financeiro?aba=receber' },
    { chave: 'pagar', rotulo: 'A pagar', href: '/erp/financeiro?aba=pagar' },
  ];
}

/**
 * O financeiro: o que entrou, o que vai entrar, o que se deve.
 *
 * Regime de caixa, e **nada aqui cobra, paga ou fala com banco**. A venda
 * lança sozinha o que tem a receber; o resto da empresa — aluguel, luz,
 * fornecedor — se lança aqui. "Hoje" é o dia do tenant, e as somas são do
 * banco (`finance_summary`, `finance_cashflow`), sobre tudo, não sobre a
 * página que está na tela.
 */
export default async function FinanceiroPage({ searchParams }: PageProps<'/erp/financeiro'>) {
  const { choice, viewer } = await requireAccess('/erp/financeiro');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/erp/financeiro');
  const rotuloVenda = capitalizar(termOf(terms, 'erp.sales').singular);
  const fuso = await tenantTimeZone();
  const hoje = todayIn(fuso);
  const supabase = await supabaseServer();

  const params = await searchParams;
  const aba = abaPedida(params.aba);
  const abas = <Tabs rotulo="Financeiro" itens={abasDoFinanceiro()} ativa={aba} className="mb-6" />;

  /* ── Visão ──────────────────────────────────────────────────────────── */

  if (aba === 'visao') {
    const periodo = periodoPedido(params.periodo);
    const janela = JANELA[periodo];
    const segunda = segundaDaSemana(hoje);
    /*
     * A janela vinha de duas constantes no código (-28 / +34 dias), sem
     * controle e sem estar escrita na tela. Agora sai do parâmetro, e o
     * intervalo resolvido vai na descrição do cartão — o padrão reproduz
     * exatamente a janela antiga.
     */
    const janelaDe = addDays(segunda, -7 * janela.atras);
    const janelaAte = addDays(segunda, 7 * janela.adiante + 6);

    const [resumoR, fluxoR, proximosR] = await Promise.all([
      supabase.rpc('finance_summary', {
        p_tenant_id: tenantId,
        p_today: hoje,
        p_month_start: startOfMonth(hoje),
      }),
      supabase.rpc('finance_cashflow', {
        p_tenant_id: tenantId,
        p_from: janelaDe,
        p_to: janelaAte,
      }),
      supabase
        .from('finance_entries')
        /*
         * `count: 'exact'` junto com o `limit`: a caixa mostra oito, e sem o
         * total ninguém saberia que existem mais — um corte de consulta
         * passando por lista completa (CLAUDE.md).
         */
        .select('id, direction, description, amount_cents, due_date', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .is('paid_on', null)
        .is('cancelled_at', null)
        .lte('due_date', addDays(hoje, 7))
        .order('due_date')
        .limit(PROXIMOS_NA_TELA),
    ]);

    const r = (Array.isArray(resumoR.data) ? resumoR.data[0] : resumoR.data) as Record<
      string,
      unknown
    > | null;
    /* Falha de leitura não é caixa zerado: `null` faz cada cartão dizer que não leu. */
    const resumo: ResumoFinanceiro | null =
      resumoR.error !== null || r === null
        ? null
        : {
            aReceber: numero(r.receivable_open_cents),
            aReceberVencido: numero(r.receivable_overdue_cents),
            aReceberQuantos: numero(r.receivable_open_count),
            aPagar: numero(r.payable_open_cents),
            aPagarVencido: numero(r.payable_overdue_cents),
            aPagarQuantos: numero(r.payable_open_count),
            entrouNoMes: numero(r.received_month_cents),
            saiuNoMes: numero(r.paid_month_cents),
            aReceber30: numero(r.receivable_next30_cents),
            aPagar30: numero(r.payable_next30_cents),
          };

    const semanas = agruparPorSemana(
      ((fluxoR.data ?? []) as Record<string, unknown>[]).map((d) => ({
        dia: String(d.day),
        recebido: numero(d.received_cents),
        pago: numero(d.paid_cents),
        aReceber: numero(d.to_receive_cents),
        aPagar: numero(d.to_pay_cents),
      })),
      hoje,
    );
    const semMovimento = semanas.every((s) => s.recebido + s.pago + s.aReceber + s.aPagar === 0);
    const erro = resumoR.error ?? fluxoR.error ?? proximosR.error;
    /* Chegada limpa: trocar a janela do fluxo não re-executa a entrada da faixa (seção 8, regra 3). */
    const primeiraChegada = params.periodo === undefined;

    return (
      <Page variant="operacao">
        <PageHeader
          titulo={titulo}
          descricao="Regime de caixa, no dia da empresa. Nada aqui cobra, paga ou fala com banco."
        />
        {abas}

        {erro !== null && (
          <div className="mb-4">
            <FormError>
              Não consegui ler o financeiro agora. Recarregue a página em instantes.
            </FormError>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <FinanceSummary r={resumo} animar={primeiraChegada} />

          <GradeDePainel>
            <Card>
              <CardHeader>
                <CardTitle>Fluxo de caixa</CardTitle>
                <CardDescription>
                  {formatDayMonth(janelaDe)} a {formatDayMonth(janelaAte)}, por semana
                </CardDescription>
                <CardAction>
                  <Segmented
                    como="link"
                    rotulo="Janela do fluxo de caixa"
                    ativa={periodo}
                    itens={PERIODOS.map((p) => ({
                      chave: p,
                      rotulo: JANELA[p].rotulo,
                      href:
                        p === PERIODO_PADRAO ? '/erp/financeiro' : `/erp/financeiro?periodo=${p}`,
                    }))}
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                {fluxoR.error !== null ? (
                  <EmptyState
                    estado="erro"
                    titulo="Não consegui ler o fluxo"
                    densidade="compacta"
                    moldura={false}
                  >
                    A consulta do fluxo de caixa falhou. Isto é a tela, não o dado: recarregue em
                    instantes.
                  </EmptyState>
                ) : semMovimento ? (
                  <EmptyState
                    icone={Wallet}
                    titulo={`Sem movimento nestas ${janela.rotulo}`}
                    densidade="compacta"
                    moldura={false}
                    acao={
                      <Link
                        href="/erp/financeiro?aba=receber"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Lançar uma conta a receber
                      </Link>
                    }
                  >
                    O fluxo aparece com a primeira venda, ou com a primeira conta lançada em
                    &ldquo;A receber&rdquo; ou &ldquo;A pagar&rdquo;. Uma janela maior também pode
                    alcançar movimento mais antigo.
                  </EmptyState>
                ) : (
                  <CashflowChart semanas={semanas} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vencendo até daqui a 7 dias</CardTitle>
                <CardDescription>
                  Das duas direções, do mais próximo ao mais distante.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UpcomingDues
                  erro={proximosR.error !== null}
                  total={proximosR.count ?? 0}
                  itens={(proximosR.data ?? []).map((l) => ({
                    id: String(l.id),
                    direcao: l.direction === 'receivable' ? 'receivable' : 'payable',
                    descricao: String(l.description),
                    valorCentavos: numero(l.amount_cents),
                    prazoTexto: vencimentoEmTexto(String(l.due_date), hoje),
                    vencido: String(l.due_date) < hoje,
                  }))}
                />
              </CardContent>
            </Card>
          </GradeDePainel>
        </div>
      </Page>
    );
  }

  /* ── A receber / A pagar ────────────────────────────────────────────── */

  const direcao: FinanceDirection = aba === 'receber' ? 'receivable' : 'payable';
  const podeEditar = can(
    viewer,
    direcao === 'receivable' ? 'finance.receivables.write' : 'finance.payables.write',
  );
  const filtro = filtroPedido(params.filtro);
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const termo = ilikeTerm(q);
  const pagina = paginaPedida(params.pagina);
  const ordem = ordemPedida(params.ordem);
  const de = (pagina - 1) * POR_PAGINA;

  let consulta = supabase
    .from('finance_entries')
    .select(
      'id, description, counterparty, category, amount_cents, due_date, paid_on, cancelled_at, cancel_reason, customer:erp_customers(name), sale:erp_sales(id, number)',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('direction', direcao);
  if (filtro === 'abertos') consulta = consulta.is('paid_on', null).is('cancelled_at', null);
  else if (filtro === 'vencidos') {
    consulta = consulta.is('paid_on', null).is('cancelled_at', null).lt('due_date', hoje);
  } else if (filtro === 'pagos') consulta = consulta.not('paid_on', 'is', null);
  else if (filtro === 'cancelados') consulta = consulta.not('cancelled_at', 'is', null);
  if (termo !== null) {
    consulta = consulta.or(
      `description.ilike.${termo},counterparty.ilike.${termo},category.ilike.${termo}`,
    );
  }
  /*
   * A coluna clicada manda; sem ela, a ordem continua sendo a que o filtro
   * pede — em aberto por vencimento, pagos pela baixa mais recente. O
   * cabeçalho ordenável é acréscimo, não troca de comportamento.
   */
  consulta =
    ordem !== null
      ? consulta.order(COLUNAS_DE_ORDEM[ordem.coluna], { ascending: ordem.crescente })
      : filtro === 'pagos'
        ? consulta.order('paid_on', { ascending: false })
        : filtro === 'abertos' || filtro === 'vencidos'
          ? consulta.order('due_date')
          : consulta.order('created_at', { ascending: false });

  const [listaR, categoriasR] = await Promise.all([
    consulta.order('id').range(de, de + POR_PAGINA - 1),
    podeEditar
      ? supabase
          .from('finance_entries')
          .select('category')
          .eq('tenant_id', tenantId)
          .not('category', 'is', null)
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  const lancamentos: LancamentoNaTela[] = (listaR.data ?? []).map((l) => {
    const venda = relacao<{ id: string; number: number }>(l.sale);
    const pagoEm = typeof l.paid_on === 'string' ? l.paid_on : null;
    const canceladoEm = typeof l.cancelled_at === 'string' ? l.cancelled_at : null;
    return {
      id: String(l.id),
      descricao: String(l.description),
      quem:
        relacao<{ name: string }>(l.customer)?.name ??
        (typeof l.counterparty === 'string' ? l.counterparty : null),
      categoria: typeof l.category === 'string' ? l.category : null,
      valorCentavos: numero(l.amount_cents),
      vencimento: String(l.due_date),
      vencimentoTexto: formatDate(String(l.due_date)),
      prazoTexto: vencimentoEmTexto(String(l.due_date), hoje),
      pagoEm: pagoEm === null ? null : formatDate(pagoEm),
      situacao: financeStatus(
        { paidAt: pagoEm, cancelledAt: canceladoEm, dueDate: String(l.due_date) },
        hoje,
      ),
      motivoDoCancelamento: typeof l.cancel_reason === 'string' ? l.cancel_reason : null,
      venda: venda === null ? null : { id: venda.id, numero: Number(venda.number) },
    };
  });
  const total = listaR.count ?? lancamentos.length;
  const categorias = [
    ...new Set(
      (categoriasR.data ?? [])
        .map((c) => (typeof c.category === 'string' ? c.category : ''))
        .filter((c) => c !== ''),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filtrando = filtro !== 'abertos' || termo !== null;
  const rotulo = direcao === 'receivable' ? 'a receber' : 'a pagar';
  /* Filtrar, buscar, ordenar ou paginar não re-executa a coreografia de entrada. */
  const primeiraChegada = !filtrando && ordem === null && pagina === 1;
  const paramsDaOrdem = { aba, filtro: filtro === 'abertos' ? '' : filtro, q };

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={titulo}
        descricao="Regime de caixa, no dia da empresa. Nada aqui cobra, paga ou fala com banco."
        acoes={
          podeEditar ? (
            <EntryForm direcao={direcao} hoje={hoje} categorias={categorias} />
          ) : undefined
        }
      />
      {abas}

      {/* A aba e a ordenação sobrevivem ao filtro; a página, não — filtrar volta à primeira. */}
      <FilterBar
        className="mb-4"
        busca={{
          rotulo: 'Buscar lançamento',
          placeholder: 'Descrição, de quem, categoria',
          valor: q,
        }}
        ocultos={ordem === null ? { aba } : { aba, ordem: ordem.texto }}
        filtros={
          <Select name="filtro" aria-label="Situação" defaultValue={filtro} className="md:w-44">
            <option value="abertos">Em aberto</option>
            <option value="vencidos">Vencidos</option>
            <option value="pagos">{direcao === 'receivable' ? 'Recebidos' : 'Pagos'}</option>
            <option value="cancelados">Cancelados</option>
            <option value="todos">Todos</option>
          </Select>
        }
      />

      {listaR.error !== null ? (
        /*
         * Três ausências, três telas. Falha de leitura NÃO cai no estado vazio:
         * "nada nesta situação" depois de um erro de banco afirma o contrário
         * do que se sabe.
         */
        <EmptyState estado="erro" titulo="Não consegui ler a lista">
          A consulta ao banco falhou. Nada foi perdido — isto é a tela. Recarregue a página em
          instantes; se continuar, o erro está do lado do servidor.
        </EmptyState>
      ) : lancamentos.length === 0 ? (
        filtrando ? (
          <EmptyState
            estado="busca"
            titulo={termo === null ? 'Nada nesta situação' : `Nada com “${q}”`}
            acao={
              <Link
                href={`/erp/financeiro?aba=${aba}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Ver o que está em aberto
              </Link>
            }
          >
            {termo === null
              ? 'Nenhum lançamento desta direção está nesta situação agora. Troque o filtro para ver as outras.'
              : 'A busca olha descrição, contraparte e categoria, e o filtro de situação continua valendo. Tente um pedaço menor do nome, ou volte para o que está em aberto.'}
          </EmptyState>
        ) : (
          <EmptyState
            icone={Wallet}
            titulo={`Nada ${rotulo} em aberto`}
            acao={
              /* Lançar é a ação `brand` do cabeçalho; aqui fica só a saída lateral. */
              <Link href="/erp/financeiro" className={buttonVariants({ variant: 'outline' })}>
                Voltar à visão do caixa
              </Link>
            }
          >
            {direcao === 'receivable'
              ? 'Venda a prazo entra aqui sozinha. O que não vem de venda — um serviço, um aluguel recebido — se lança pelo botão no topo da tela, e o vencimento entra no fluxo de caixa.'
              : 'Aluguel, luz, fornecedor: lance pelo botão no topo da tela, e o vencimento entra no fluxo de caixa.'}
          </EmptyState>
        )
      ) : (
        <EntryRows
          lancamentos={lancamentos}
          direcao={direcao}
          podeEditar={podeEditar}
          hoje={hoje}
          rotuloVenda={rotuloVenda}
          ordem={ordem === null ? null : ordem.texto}
          paramsDaOrdem={paramsDaOrdem}
          animar={primeiraChegada}
        />
      )}

      <Pagination
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={total}
        params={{ ...paramsDaOrdem, ordem: ordem === null ? '' : ordem.texto }}
      />
    </Page>
  );
}
