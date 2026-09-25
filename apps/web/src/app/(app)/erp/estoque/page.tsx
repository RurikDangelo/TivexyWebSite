import {
  type InventoryMovementKind,
  INVENTORY_MOVEMENT_KINDS,
  STOCK_STATUS_ORDER,
  type StockStatus,
  can,
  isProductUnit,
  stockStatus,
  stockSummary,
} from '@tivexy/core';
import { Boxes, Package, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Pagination } from '@/components/page/pagination';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { MOVIMENTO } from '@/lib/erp/labels';
import { isTipoAMao } from '@/lib/erp/movement-input';
import { contagem, formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { MovementList, type MovimentoNaTela } from '../movement-list';
import { type Aba, LedgerFilters, LevelFilters, StockTabs } from './filters';
import { LevelRows, type SaldoNaTela, StockSummaryCards } from './levels';
import { MovementForm } from './movement-form';
import { POR_PAGINA, TETO_DO_SALDO, filtroPedido } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/erp/estoque') };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/** Busca sem acento e sem caixa: "acucar" acha "Açúcar". */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const PASSA: Record<string, (s: StockStatus) => boolean> = {
  todos: () => true,
  repor: (s) => s === 'low' || s === 'out',
  negativo: (s) => s === 'negative',
  'em-dia': (s) => s === 'ok',
};

/**
 * O estoque: quanto há de cada coisa, o que pede ação, e o que mexeu nisso.
 *
 * O saldo vem ordenado pela urgência — negativo, zerado, no mínimo, em dia —,
 * porque a pergunta de quem abre esta tela é "o que eu preciso repor". O
 * resumo precisa de todos os produtos controlados, então eles são lidos de
 * uma vez (até `TETO_DO_SALDO`); a lista é paginada depois.
 */
export default async function EstoquePage({ searchParams }: PageProps<'/erp/estoque'>) {
  const { choice, viewer } = await requireAccess('/erp/estoque');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/erp/estoque');
  const rotulo = termOf(terms, 'inventory.stock');
  const rotuloVenda = capitalizar(termOf(terms, 'erp.sales').singular);
  const veRazao = can(viewer, 'inventory.movements.read');
  const podeMovimentar = can(viewer, 'inventory.movements.write');

  const params = await searchParams;
  const aba: Aba = params.aba === 'movimentos' && veRazao ? 'movimentos' : 'saldo';
  const produtoPedido = isUuid(params.produto) ? params.produto : null;
  const tipoInicial = isTipoAMao(params.tipo) ? params.tipo : 'in';
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await supabaseServer();
  const produtosR = await supabase
    .from('erp_products')
    .select(
      'id, name, sku, unit, min_stock, cost_cents, active, category:erp_product_categories(name)',
      {
        count: 'exact',
      },
    )
    .eq('tenant_id', tenantId)
    .eq('track_stock', true)
    .order('name')
    .order('id')
    .limit(TETO_DO_SALDO);

  const produtos = (produtosR.data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.name),
    sku: typeof p.sku === 'string' ? p.sku : null,
    unidade: isProductUnit(p.unit) ? p.unit : ('un' as const),
    minimo: p.min_stock === null ? null : Number(p.min_stock),
    custo: p.cost_cents === null ? null : Number(p.cost_cents),
    ativo: p.active === true,
    categoria: relacao<{ name: string }>(p.category)?.name ?? null,
  }));
  const totalControlados = produtosR.count ?? produtos.length;
  const paraMovimentar = produtos
    .filter((p) => p.ativo)
    .map((p) => ({ id: p.id, nome: p.nome, unidade: p.unidade }));

  const formulario = podeMovimentar && totalControlados > 0 && (
    <MovementForm
      produtos={paraMovimentar}
      rotuloProduto={capitalizar(rotulo.singular)}
      produtoInicial={aba === 'saldo' ? produtoPedido : null}
      tipoInicial={tipoInicial}
    />
  );

  const cabecalho = (
    <PageHeader
      titulo={titulo}
      descricao={`${contagem(totalControlados, rotulo.singular, rotulo.plural)} com controle de estoque.`}
      acoes={
        <Link href="/erp/produtos" className={buttonVariants({ variant: 'outline' })}>
          <Package aria-hidden />
          {sectionTitle(terms, '/erp/produtos')}
        </Link>
      }
    />
  );

  if (produtosR.error === null && totalControlados === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {cabecalho}
        <EmptyState
          icone={Boxes}
          titulo={`Ainda não há ${rotulo.plural}`}
          acao={
            <Link href="/erp/produtos" className={buttonVariants({ variant: 'outline' })}>
              Ir para {sectionTitle(terms, '/erp/produtos')}
            </Link>
          }
        >
          O estoque lista o que foi cadastrado com &ldquo;Controla estoque&rdquo; ligado. Cadastre
          lá; a primeira entrada se registra aqui.
        </EmptyState>
      </div>
    );
  }

  /* ── Aba do razão ───────────────────────────────────────────────────── */

  if (aba === 'movimentos') {
    const tipo =
      typeof params.tipo === 'string' &&
      (INVENTORY_MOVEMENT_KINDS as readonly string[]).includes(params.tipo)
        ? params.tipo
        : '';
    let consulta = supabase
      .from('inventory_movements')
      .select(
        'id, kind, quantity, counted_quantity, reason, created_by, created_at, product:erp_products(id, name, unit), sale:erp_sales(number)',
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId);
    if (tipo !== '') consulta = consulta.eq('kind', tipo);
    if (produtoPedido !== null) consulta = consulta.eq('product_id', produtoPedido);

    const [razaoR, membros, fuso] = await Promise.all([
      consulta
        .order('created_at', { ascending: false })
        .order('id')
        .range(de, de + POR_PAGINA - 1),
      tenantMembers(tenantId),
      tenantTimeZone(),
    ]);

    const movimentos: MovimentoNaTela[] = (razaoR.data ?? []).map((m) => {
      const kind = String(m.kind) as InventoryMovementKind;
      const venda = relacao<{ number: number }>(m.sale);
      const produto = relacao<{ id: string; name: string; unit: string }>(m.product);
      const unidade = isProductUnit(produto?.unit) ? produto.unit : 'un';
      return {
        id: String(m.id),
        rotulo:
          venda === null
            ? MOVIMENTO[kind]
            : kind === 'sale'
              ? `${rotuloVenda} nº ${venda.number}`
              : `Devolução · ${rotuloVenda} nº ${venda.number}`,
        quantidade: Number(m.quantity),
        contado: m.counted_quantity === null ? null : Number(m.counted_quantity),
        motivo: typeof m.reason === 'string' ? m.reason : null,
        quando: formatInstant(String(m.created_at), fuso),
        quem: nomeDe(membros, typeof m.created_by === 'string' ? m.created_by : null),
        produto: produto === null ? null : { id: produto.id, nome: produto.name, unidade },
        unidade,
      };
    });
    const total = razaoR.count ?? movimentos.length;
    const filtrando = tipo !== '' || produtoPedido !== null;

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {cabecalho}
        <StockTabs aba={aba} comRazao={veRazao} />
        <div className="mb-6 flex flex-col gap-4">
          <LedgerFilters
            tipo={tipo}
            produto={produtoPedido ?? ''}
            produtos={paraMovimentar}
            rotuloProduto={capitalizar(rotulo.singular)}
            rotuloVendas={capitalizar(termOf(terms, 'erp.sales').plural)}
          />
          {formulario}
        </div>
        {razaoR.error !== null && (
          <div className="mb-4">
            <FormError>Não consegui ler as movimentações agora. Recarregue em instantes.</FormError>
          </div>
        )}
        <Card>
          <CardContent className="pt-5">
            <MovementList
              movimentos={movimentos}
              vazio={
                filtrando
                  ? 'Nenhuma movimentação com esses filtros.'
                  : 'Nada entrou nem saiu ainda. A primeira entrada, venda ou contagem aparece aqui.'
              }
            />
          </CardContent>
        </Card>
        <Pagination
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={total}
          params={{ aba: 'movimentos', tipo, produto: produtoPedido }}
        />
      </div>
    );
  }

  /* ── Aba do saldo ───────────────────────────────────────────────────── */

  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const filtro = filtroPedido(params.situacao);
  const { data: niveis, error: erroNiveis } = await supabase
    .from('inventory_stock_levels')
    .select('product_id, quantity')
    .eq('tenant_id', tenantId)
    .limit(TETO_DO_SALDO * 2);
  const saldoDe = new Map((niveis ?? []).map((n) => [String(n.product_id), Number(n.quantity)]));

  const linhas: (SaldoNaTela & { custo: number | null; sku: string | null })[] = produtos.map(
    (p) => {
      const saldo = saldoDe.get(p.id) ?? 0;
      return {
        ...p,
        saldo,
        situacao: stockStatus({ trackStock: true, quantity: saldo, minStock: p.minimo }),
      };
    },
  );
  const resumo = stockSummary(
    linhas.map((l) => ({
      trackStock: true,
      quantity: l.saldo,
      minStock: l.minimo,
      costCents: l.custo,
    })),
  );

  const termo = semAcento(q);
  const visiveis = linhas
    .filter((l) => PASSA[filtro]!(l.situacao))
    .filter(
      (l) =>
        termo === '' ||
        semAcento(l.nome).includes(termo) ||
        (l.sku !== null && semAcento(l.sku).includes(termo)),
    )
    .sort(
      (a, b) =>
        STOCK_STATUS_ORDER.indexOf(a.situacao) - STOCK_STATUS_ORDER.indexOf(b.situacao) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
  const pagina_ = visiveis.slice(de, de + POR_PAGINA);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {cabecalho}
      <StockTabs aba={aba} comRazao={veRazao} />

      <div className="mb-6 flex flex-col gap-4">
        <StockSummaryCards resumo={resumo} filtro={filtro} rotulo={rotulo} />
        {formulario}
        <LevelFilters q={q} situacao={filtro} plural={rotulo.plural} />
      </div>

      {(produtosR.error !== null || erroNiveis !== null) && (
        <div className="mb-4">
          <FormError>Não consegui ler o saldo agora. Recarregue a página em instantes.</FormError>
        </div>
      )}
      {totalControlados > TETO_DO_SALDO && (
        <p className="mb-4 text-sm text-content-muted">
          Mostrando os primeiros {TETO_DO_SALDO.toLocaleString('pt-BR')} de{' '}
          {totalControlados.toLocaleString('pt-BR')}, em ordem alfabética. Use a busca para achar o
          resto.
        </p>
      )}

      {pagina_.length === 0 ? (
        <EmptyState
          icone={SearchX}
          titulo="Nada nesta situação"
          acao={
            <Link href="/erp/estoque" className={buttonVariants({ variant: 'outline' })}>
              Ver tudo
            </Link>
          }
        >
          {q === ''
            ? 'Nenhum cadastro está nesta situação agora — o que é bom sinal.'
            : `Nenhum cadastro tem “${q}” no nome ou no código.`}
        </EmptyState>
      ) : (
        <LevelRows saldos={pagina_} podeMovimentar={podeMovimentar} />
      )}

      <Pagination
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={visiveis.length}
        params={{ q, situacao: filtro === 'todos' ? '' : filtro }}
      />
    </div>
  );
}
