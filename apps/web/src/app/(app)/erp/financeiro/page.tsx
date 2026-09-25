import {
  type FinanceDirection,
  addDays,
  can,
  financeStatus,
  startOfMonth,
  todayIn,
} from '@tivexy/core';
import { SearchX, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Pagination } from '@/components/page/pagination';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { agruparPorSemana, segundaDaSemana, vencimentoEmTexto } from '@/lib/erp/finance-text';
import { formatDate } from '@/lib/format';
import { ilikeTerm, paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { CashflowChart, CashflowTable } from './cashflow-chart';
import { EntryForm } from './entry-form';
import { EntryRows } from './entry-rows';
import { POR_PAGINA, type LancamentoNaTela, abaPedida, filtroPedido } from './state';
import { FinanceSummary, FinanceTabs, UpcomingDues } from './summary';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/erp/financeiro') };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
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

  const cabecalho = (
    <PageHeader
      titulo={titulo}
      descricao="Regime de caixa, no dia da empresa. Nada aqui cobra, paga ou fala com banco."
    />
  );

  /* ── Visão ──────────────────────────────────────────────────────────── */

  if (aba === 'visao') {
    const segunda = segundaDaSemana(hoje);
    const [resumoR, fluxoR, proximosR] = await Promise.all([
      supabase.rpc('finance_summary', {
        p_tenant_id: tenantId,
        p_today: hoje,
        p_month_start: startOfMonth(hoje),
      }),
      supabase.rpc('finance_cashflow', {
        p_tenant_id: tenantId,
        p_from: addDays(segunda, -28),
        p_to: addDays(segunda, 34),
      }),
      supabase
        .from('finance_entries')
        .select('id, direction, description, amount_cents, due_date')
        .eq('tenant_id', tenantId)
        .is('paid_on', null)
        .is('cancelled_at', null)
        .lte('due_date', addDays(hoje, 7))
        .order('due_date')
        .limit(8),
    ]);

    const r = (Array.isArray(resumoR.data) ? resumoR.data[0] : resumoR.data) as Record<
      string,
      unknown
    > | null;
    const resumo = {
      aReceber: numero(r?.receivable_open_cents),
      aReceberVencido: numero(r?.receivable_overdue_cents),
      aReceberQuantos: numero(r?.receivable_open_count),
      aPagar: numero(r?.payable_open_cents),
      aPagarVencido: numero(r?.payable_overdue_cents),
      aPagarQuantos: numero(r?.payable_open_count),
      entrouNoMes: numero(r?.received_month_cents),
      saiuNoMes: numero(r?.paid_month_cents),
      aReceber30: numero(r?.receivable_next30_cents),
      aPagar30: numero(r?.payable_next30_cents),
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

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {cabecalho}
        <FinanceTabs aba={aba} />
        {erro !== null && (
          <div className="mb-4">
            <FormError>
              Não consegui ler o financeiro agora. Recarregue a página em instantes.
            </FormError>
          </div>
        )}
        <div className="flex flex-col gap-6">
          <FinanceSummary r={resumo} />

          <Card>
            <CardHeader>
              <CardTitle>Fluxo de caixa</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {semMovimento ? (
                <EmptyState icone={Wallet} titulo="Sem movimento nestas nove semanas">
                  O fluxo aparece com a primeira venda, ou com a primeira conta lançada em &ldquo;A
                  receber&rdquo; ou &ldquo;A pagar&rdquo;.
                </EmptyState>
              ) : (
                <>
                  <CashflowChart semanas={semanas} />
                  <CashflowTable semanas={semanas} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vencendo até daqui a 7 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <UpcomingDues
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
        </div>
      </div>
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
  consulta =
    filtro === 'pagos'
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {cabecalho}
      <FinanceTabs aba={aba} />

      <div className="mb-6 flex flex-col gap-4">
        {podeEditar && <EntryForm direcao={direcao} hoje={hoje} categorias={categorias} />}
        <form
          role="search"
          method="get"
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="aba" value={aba} />
          <Label htmlFor="q" className="sr-only">
            Buscar
          </Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Descrição, de quem, categoria"
            className="min-w-0 sm:flex-1"
          />
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
            <Select name="filtro" aria-label="Situação" defaultValue={filtro} className="sm:w-40">
              <option value="abertos">Em aberto</option>
              <option value="vencidos">Vencidos</option>
              <option value="pagos">{direcao === 'receivable' ? 'Recebidos' : 'Pagos'}</option>
              <option value="cancelados">Cancelados</option>
              <option value="todos">Todos</option>
            </Select>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </div>
        </form>
      </div>

      {listaR.error !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler a lista agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      {lancamentos.length === 0 && listaR.error === null ? (
        filtrando ? (
          <EmptyState
            icone={SearchX}
            titulo="Nada nesta situação"
            acao={
              <Link
                href={`/erp/financeiro?aba=${aba}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                Ver o que está em aberto
              </Link>
            }
          >
            {termo === null ? 'Nenhum lançamento com esse filtro.' : `Nada com “${q}”.`}
          </EmptyState>
        ) : (
          <EmptyState icone={Wallet} titulo={`Nada ${rotulo} em aberto`}>
            {direcao === 'receivable'
              ? 'Venda a prazo entra aqui sozinha. O que não vem de venda — um serviço, um aluguel recebido — se lança com o botão acima.'
              : 'Aluguel, luz, fornecedor: lance com o botão acima, e o vencimento entra no fluxo de caixa.'}
          </EmptyState>
        )
      ) : (
        <EntryRows
          lancamentos={lancamentos}
          direcao={direcao}
          podeEditar={podeEditar}
          hoje={hoje}
          rotuloVenda={rotuloVenda}
        />
      )}

      <Pagination
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={total}
        params={{ aba, filtro: filtro === 'abertos' ? '' : filtro, q }}
      />
    </div>
  );
}
