import { ArrowDownRight, ArrowUpRight, Boxes, Scale } from 'lucide-react';
import type { Metadata } from 'next';

import {
  ERP_MOVEMENT_LABEL,
  type ErpMovementKind,
  type ErpUnit,
  formatCents,
  formatInstant,
  formatQuantity,
} from '@tivexy/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTimeZone } from '@/lib/tenant/settings';

import { MovementForm } from './movement-form';
import type { MovimentoListado, ProdutoDeEstoque, SaldoListado } from './state';

export const metadata: Metadata = { title: 'Estoque' };

/** Quantos lançamentos o razão mostra. Ver o aviso quando bate o teto. */
const TETO_RAZAO = 100;

/**
 * O inventário e o razão.
 *
 * ## Duas listas, uma verdade
 *
 * Em cima, o saldo por produto. Embaixo, o razão — toda entrada, saída e
 * ajuste. **O de cima é derivado do de baixo**, por gatilho, e esta tela não
 * soma nada: ela lê `erp_stock_balances` como está.
 *
 * Somar o razão aqui para conferir seria criar uma terceira resposta para uma
 * pergunta que já tem uma, e a terceira divergiria das outras no primeiro
 * lançamento concorrente. Quem confere os dois é o teste
 * `supabase/tests/erp.test.mjs`, contra Postgres.
 *
 * ## O valor do inventário usa o custo, não o preço
 *
 * Inventário é quanto **custou** o que está parado, não quanto se espera
 * vender. Somar pelo preço de venda infla o patrimônio com lucro que ainda
 * não aconteceu — e é o número que um contador recusa primeiro.
 */
export default async function EstoquePage() {
  const { choice } = await requireAccess('/erp/estoque');
  if (choice.kind !== 'resolved') return null;

  const supabase = await supabaseServer();
  const fuso = await currentTimeZone();

  const [saldosResposta, movimentosResposta, produtosResposta] = await Promise.all([
    supabase
      .from('erp_stock_balances')
      .select('product_id, quantity, erp_products(name, sku, unit, cost_cents, track_stock)')
      .eq('tenant_id', choice.tenant.id),
    supabase
      .from('erp_stock_movements')
      .select('id, kind, quantity, reason, created_at, erp_products(name), erp_sales(number)')
      .eq('tenant_id', choice.tenant.id)
      .order('created_at', { ascending: false })
      .limit(TETO_RAZAO),
    supabase
      .from('erp_products')
      .select('id, name, unit')
      .eq('tenant_id', choice.tenant.id)
      .eq('track_stock', true)
      .eq('is_active', true)
      .order('name')
      .limit(200),
  ]);

  const saldos: SaldoListado[] = (saldosResposta.data ?? [])
    .map((linha) => {
      const produto = (
        Array.isArray(linha.erp_products) ? linha.erp_products[0] : linha.erp_products
      ) as {
        name?: unknown;
        sku?: unknown;
        unit?: unknown;
        cost_cents?: unknown;
        track_stock?: unknown;
      } | null;

      return {
        productId: String(linha.product_id),
        nome: typeof produto?.name === 'string' ? produto.name : '—',
        sku: typeof produto?.sku === 'string' ? produto.sku : null,
        unit: (produto?.unit ?? 'un') as ErpUnit,
        quantidade: Number(linha.quantity),
        custoCents: Number(produto?.cost_cents ?? 0),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const movimentos: MovimentoListado[] = (movimentosResposta.data ?? []).map((linha) => {
    const venda = (Array.isArray(linha.erp_sales) ? linha.erp_sales[0] : linha.erp_sales) as {
      number?: unknown;
    } | null;

    return {
      id: String(linha.id),
      produto: nomeAninhado(linha.erp_products) ?? '—',
      kind: linha.kind as ErpMovementKind,
      quantity: Number(linha.quantity),
      reason: (linha.reason as string | null) ?? null,
      vendaNumero: typeof venda?.number === 'number' ? venda.number : null,
      createdAt: String(linha.created_at),
    };
  });

  const produtos: ProdutoDeEstoque[] = (produtosResposta.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    unit: linha.unit as ErpUnit,
  }));

  /*
   * Em centavos inteiros do começo ao fim. `quantidade` pode ser fracionária,
   * então cada linha arredonda antes de somar — somar frações e arredondar no
   * fim produz o centavo que não bate com a soma das linhas na tela.
   */
  const valorTotal = saldos.reduce(
    (soma, linha) => soma + Math.round(linha.quantidade * linha.custoCents),
    0,
  );
  const negativos = saldos.filter((linha) => linha.quantidade < 0);
  const semCusto = saldos.some((linha) => linha.custoCents === 0 && linha.quantidade > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">Estoque</h1>
        <p className="mt-1 text-content-muted">O que está parado, e tudo que entrou e saiu.</p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Itens com saldo" valor={String(saldos.length)} icone={Boxes} />
        <Numero
          rotulo="Valor a custo"
          valor={formatCents(valorTotal)}
          icone={Scale}
          nota={semCusto ? 'Há item sem custo cadastrado' : undefined}
        />
        <Numero
          rotulo="Saldos negativos"
          valor={String(negativos.length)}
          icone={ArrowDownRight}
          alerta={negativos.length > 0}
        />
      </div>

      <div className="mb-6">
        <MovementForm produtos={produtos} />
      </div>

      {negativos.length > 0 && (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {negativos.length === 1 ? 'Um item está' : `${negativos.length} itens estão`} com saldo
          negativo — saiu mais do que entrou. Normalmente é entrada não lançada, e o conserto é um
          ajuste, nunca editar o razão.
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
          Inventário
        </h2>
        {saldos.length === 0 ? (
          <Card>
            <CardHeader>
              <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
                <Boxes className="size-5 text-content-subtle" aria-hidden />
              </div>
              <CardTitle>Nada em estoque ainda</CardTitle>
              <CardDescription>
                Lance a primeira entrada acima. O saldo nasce do movimento — não há como digitá-lo
                direto, e isso é de propósito.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
            {saldos.map((linha) => (
              <li
                key={linha.productId}
                className="flex items-center gap-4 border-b border-line-subtle p-4 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-content">{linha.nome}</span>
                  <span className="block truncate text-xs text-content-subtle">
                    {linha.sku ?? 'sem código'}
                    {linha.custoCents > 0 && ` · custo ${formatCents(linha.custoCents)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={
                      linha.quantidade < 0
                        ? 'block font-mono text-sm font-medium text-danger'
                        : 'block font-mono text-sm text-content'
                    }
                  >
                    {formatQuantity(linha.quantidade)} {linha.unit}
                  </span>
                  {linha.custoCents > 0 && (
                    <span className="block text-xs text-content-subtle">
                      {formatCents(Math.round(linha.quantidade * linha.custoCents))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-content-subtle">
          Razão
        </h2>

        {movimentos.length === TETO_RAZAO && (
          <p className="mb-2 text-xs text-content-subtle">
            Mostrando os {TETO_RAZAO} lançamentos mais recentes. O saldo acima conta todos.
          </p>
        )}

        {movimentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-subtle px-4 py-6 text-center text-sm text-content-muted">
            Nenhum lançamento ainda.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
            {movimentos.map((movimento) => (
              <Lancamento key={movimento.id} movimento={movimento} fuso={fuso} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  icone: Icone,
  nota,
  alerta = false,
}: {
  rotulo: string;
  valor: string;
  icone: typeof Boxes;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-raised p-4">
      <div className="flex items-center gap-2">
        <Icone
          className={alerta ? 'size-4 text-warning' : 'size-4 text-content-subtle'}
          aria-hidden
        />
        <span className="text-xs text-content-muted">{rotulo}</span>
      </div>
      <p
        className={
          alerta
            ? 'mt-1 font-display text-xl font-bold text-warning'
            : 'mt-1 font-display text-xl font-bold text-content'
        }
      >
        {valor}
      </p>
      {nota !== undefined && <p className="mt-0.5 text-xs text-content-subtle">{nota}</p>}
    </div>
  );
}

const TOM_MOVIMENTO: Record<ErpMovementKind, 'success' | 'danger' | 'warning'> = {
  in: 'success',
  out: 'danger',
  adjustment: 'warning',
};

function Lancamento({ movimento, fuso }: { movimento: MovimentoListado; fuso: string }) {
  const Seta = movimento.kind === 'out' ? ArrowDownRight : ArrowUpRight;

  return (
    <li className="flex items-center gap-3 border-b border-line-subtle p-3 last:border-b-0">
      <Seta
        className={
          movimento.kind === 'out' ? 'size-4 shrink-0 text-danger' : 'size-4 shrink-0 text-success'
        }
        aria-hidden
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-content">{movimento.produto}</span>
        <span className="block truncate text-xs text-content-subtle">
          {movimento.vendaNumero !== null
            ? `Venda #${movimento.vendaNumero}`
            : (movimento.reason ?? 'sem motivo registrado')}
        </span>
      </span>

      <Badge tone={TOM_MOVIMENTO[movimento.kind]}>{ERP_MOVEMENT_LABEL[movimento.kind]}</Badge>

      <span className="w-16 text-right font-mono text-sm text-content">
        {formatQuantity(movimento.quantity)}
      </span>

      <time
        dateTime={movimento.createdAt}
        className="hidden w-28 text-right text-xs text-content-subtle sm:block"
      >
        {formatInstant(new Date(movimento.createdAt), fuso)}
      </time>
    </li>
  );
}
