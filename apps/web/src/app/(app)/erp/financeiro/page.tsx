import { CreditCard, TrendingDown, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FINANCE_ENTRY_LABEL, type FinanceEntryKind, dayIn, formatCents } from '@tivexy/core';
import { CashFlowChart } from '@/components/erp/cash-flow-chart';
import type { Opcao } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { parametro, umDentre } from '@/lib/crm/busca';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { type LancamentoDoFluxo, semanasDoFluxo } from '@/lib/erp/fluxo';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import { alternarPagamento } from './actions';
import { EntryForm } from './entry-form';
import type { LancamentoListado } from './state';

export const metadata: Metadata = { title: 'Financeiro' };

const RECORTES = ['abertos', 'todos', 'pagos', 'receber', 'pagar'] as const;

/**
 * Contas a pagar e a receber, com a previsão de caixa.
 *
 * ## O que esta tela é, e o que ela não é
 *
 * É um **livro de contas**. Nada aqui gera boleto, cobra cartão ou fala com
 * banco — "marcar como pago" quer dizer que alguém anotou que a conta foi
 * paga. A tela repete isso onde a confusão seria cara, e não num rodapé.
 *
 * ## O gráfico só existe quando há dado
 *
 * Sem lançamento em aberto, nenhuma barra é desenhada: `CashFlowChart`
 * devolve `null` e o estado vazio aparece. Gráfico com número inventado é o
 * que o `CLAUDE.md` proíbe, e num gráfico de dinheiro a mentira é pior — ela
 * parece um relatório.
 *
 * ## "Hoje" é do cliente
 *
 * O que está vencido depende do dia de hoje **no fuso do tenant**, não no do
 * servidor, que na Vercel é UTC. Quem responde isso é `dayIn()`, no Core.
 */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/erp/financeiro');
  if (choice.kind !== 'resolved') return null;

  const recorte = umDentre(parametro(await searchParams, 'estado'), RECORTES, 'abertos');
  const supabase = await supabaseServer();
  const fuso = await currentTimeZone();
  const hoje = dayIn(new Date(), fuso);

  let consulta = supabase
    .from('finance_entries')
    .select(
      'id, kind, description, amount_cents, due_date, paid_at, crm_companies(name), erp_sales(number)',
    )
    .eq('tenant_id', choice.tenant.id);

  if (recorte === 'abertos') consulta = consulta.is('paid_at', null);
  else if (recorte === 'pagos') consulta = consulta.not('paid_at', 'is', null);
  else if (recorte === 'receber') consulta = consulta.eq('kind', 'receivable');
  else if (recorte === 'pagar') consulta = consulta.eq('kind', 'payable');

  const [{ data, error }, emAbertoResposta, clientesResposta] = await Promise.all([
    consulta.order('due_date').limit(200),
    /*
     * O gráfico e os números do topo leem **todos** os lançamentos em aberto,
     * independentemente do recorte da lista. Um gráfico que mudasse com o
     * filtro da tabela mostraria "previsão de caixa" de um pedaço do caixa —
     * e ninguém olha a legenda antes de tirar conclusão de um gráfico.
     */
    supabase
      .from('finance_entries')
      .select('kind, due_date, amount_cents')
      .eq('tenant_id', choice.tenant.id)
      .is('paid_at', null)
      .limit(2000),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', choice.tenant.id)
      .order('name')
      .limit(200),
  ]);

  const lancamentos: LancamentoListado[] = (data ?? []).map((linha) => {
    const venda = (Array.isArray(linha.erp_sales) ? linha.erp_sales[0] : linha.erp_sales) as {
      number?: unknown;
    } | null;

    return {
      id: String(linha.id),
      kind: linha.kind as FinanceEntryKind,
      description: String(linha.description),
      amountCents: Number(linha.amount_cents),
      dueDate: String(linha.due_date),
      paidAt: (linha.paid_at as string | null) ?? null,
      empresa: nomeAninhado(linha.crm_companies),
      vendaNumero: typeof venda?.number === 'number' ? venda.number : null,
    };
  });

  const emAberto: LancamentoDoFluxo[] = (emAbertoResposta.data ?? []).map((linha) => ({
    kind: linha.kind as FinanceEntryKind,
    dueDate: String(linha.due_date),
    amountCents: Number(linha.amount_cents),
  }));

  const clientes: Opcao[] = (clientesResposta.data ?? []).map((linha) => ({
    valor: String(linha.id),
    texto: String(linha.name),
  }));

  const semanas = semanasDoFluxo(hoje, emAberto);

  const aReceber = emAberto
    .filter((l) => l.kind === 'receivable')
    .reduce((soma, l) => soma + l.amountCents, 0);
  const aPagar = emAberto
    .filter((l) => l.kind === 'payable')
    .reduce((soma, l) => soma + l.amountCents, 0);
  const vencidos = emAberto.filter((l) => l.dueDate < hoje);
  const vencidoCents = vencidos.reduce(
    (soma, l) => soma + (l.kind === 'receivable' ? l.amountCents : -l.amountCents),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">Financeiro</h1>
        <p className="mt-1 text-content-muted">
          Contas a pagar e a receber. É um livro — não cobra, não emite nota.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Numero
          rotulo="A receber em aberto"
          valor={formatCents(aReceber)}
          icone={TrendingUp}
          cor="var(--tvx-blue-500)"
        />
        <Numero
          rotulo="A pagar em aberto"
          valor={formatCents(aPagar)}
          icone={TrendingDown}
          cor="var(--tvx-danger-500)"
        />
        <Numero
          rotulo="Saldo previsto"
          valor={formatCents(aReceber - aPagar)}
          icone={CreditCard}
          nota={
            vencidos.length > 0
              ? `${vencidos.length} vencido${vencidos.length === 1 ? '' : 's'}, saldo ${formatCents(vencidoCents)}`
              : 'Nada vencido'
          }
          alerta={vencidos.length > 0}
        />
      </div>

      {emAberto.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Previsão de caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart semanas={semanas} />
            <p className="mt-3 text-xs text-content-subtle">
              O que já venceu entra na primeira semana, em vez de sumir — atraso é caixa que ainda
              vai acontecer, e escondê-lo faria a previsão parecer melhor do que é.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <EntryForm clientes={clientes} />
      </div>

      <nav aria-label="Recortes" className="mb-4 flex flex-wrap gap-1.5">
        {RECORTES.map((opcao) => (
          <Link
            key={opcao}
            href={opcao === 'abertos' ? '/erp/financeiro' : `/erp/financeiro?estado=${opcao}`}
            aria-current={opcao === recorte ? 'page' : undefined}
            className={
              opcao === recorte
                ? 'rounded-md border border-transparent bg-surface-brand px-3 py-1.5 text-sm text-content-on-brand'
                : 'rounded-md border border-line-strong px-3 py-1.5 text-sm text-content-default transition-colors hover:bg-surface-muted'
            }
          >
            {ROTULO_RECORTE[opcao]}
          </Link>
        ))}
      </nav>

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler o financeiro</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {lancamentos.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <CreditCard className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhum lançamento neste recorte</CardTitle>
            <CardDescription>
              Confirmar uma venda gera o recebimento automaticamente. Contas a pagar entram por
              aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {lancamentos.map((lancamento) => (
            <Linha key={lancamento.id} lancamento={lancamento} hoje={hoje} />
          ))}
        </ul>
      )}
    </div>
  );
}

const ROTULO_RECORTE: Record<(typeof RECORTES)[number], string> = {
  abertos: 'Em aberto',
  todos: 'Todos',
  pagos: 'Pagos',
  receber: 'A receber',
  pagar: 'A pagar',
};

function Numero({
  rotulo,
  valor,
  icone: Icone,
  cor,
  nota,
  alerta = false,
}: {
  rotulo: string;
  valor: string;
  icone: typeof CreditCard;
  cor?: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-raised p-4">
      <div className="flex items-center gap-2">
        <Icone
          className="size-4"
          style={cor === undefined ? undefined : { color: cor }}
          aria-hidden
        />
        <span className="text-xs text-content-muted">{rotulo}</span>
      </div>
      {/* O número fica com cor de texto, nunca com a da série — o ícone ao
          lado é que carrega a identidade. */}
      <p className="mt-1 font-display text-xl font-bold text-content">{valor}</p>
      {nota !== undefined && (
        <p
          className={alerta ? 'mt-0.5 text-xs text-warning' : 'mt-0.5 text-xs text-content-subtle'}
        >
          {nota}
        </p>
      )}
    </div>
  );
}

/** `2026-10-10` vira `10/10`, sem passar por `Date` — a coluna é `date`. */
function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function Linha({ lancamento, hoje }: { lancamento: LancamentoListado; hoje: string }) {
  const pago = lancamento.paidAt !== null;
  const vencido = !pago && lancamento.dueDate < hoje;
  const receber = lancamento.kind === 'receivable';

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-subtle p-4 last:border-b-0">
      <form action={alternarPagamento} className="shrink-0">
        <input type="hidden" name="id" value={lancamento.id} />
        <input type="hidden" name="pago" value={pago ? 'sim' : 'nao'} />
        <button
          type="submit"
          aria-label={
            pago
              ? `Desmarcar ${lancamento.description}`
              : `Marcar ${lancamento.description} como pago`
          }
          className={
            pago
              ? 'flex size-5 items-center justify-center rounded border border-success bg-success text-white'
              : 'flex size-5 items-center justify-center rounded border border-line-strong transition-colors hover:border-content-accent hover:bg-surface-muted'
          }
        >
          {pago && (
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
        <p className={pago ? 'text-content-muted line-through' : 'font-medium text-content'}>
          {lancamento.description}
        </p>
        <p className="truncate text-xs text-content-subtle">
          {[
            lancamento.empresa,
            lancamento.vendaNumero === null ? null : `Venda #${lancamento.vendaNumero}`,
          ]
            .filter(Boolean)
            .join(' · ') || 'Sem vínculo'}
        </p>
      </div>

      {/* O quadradinho é o mesmo das séries do gráfico: ver a mesma cor nos
          dois lugares liga a linha à barra que ela compõe. */}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-[2px]"
          style={{ backgroundColor: receber ? 'var(--tvx-blue-500)' : 'var(--tvx-danger-500)' }}
        />
        <span className="text-xs text-content-muted">{FINANCE_ENTRY_LABEL[lancamento.kind]}</span>
      </span>

      <span className="w-24 text-right font-mono text-sm text-content">
        {formatCents(lancamento.amountCents)}
      </span>

      <span className="w-20 text-right">
        {vencido ? (
          <Badge tone="danger">venceu {dataCurta(lancamento.dueDate)}</Badge>
        ) : (
          <span className="text-xs text-content-subtle">{dataCurta(lancamento.dueDate)}</span>
        )}
      </span>
    </li>
  );
}
