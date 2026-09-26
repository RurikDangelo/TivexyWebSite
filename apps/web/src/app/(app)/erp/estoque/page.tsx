import {
  type InventoryMovementKind,
  INVENTORY_MOVEMENT_KINDS,
  type StockStatus,
  can,
  isProductUnit,
  stockStatus,
  stockSummary,
} from '@tivexy/core';
import { Boxes, History, Package, RotateCw, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Pagination } from '@/components/page/pagination';
import { buttonVariants } from '@/components/ui/button';
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
import {
  ORDEM_PADRAO,
  POR_PAGINA,
  TETO_DO_SALDO,
  compararSaldo,
  filtroPedido,
  ordemPedida,
} from './state';

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
 * Tentar de novo é `<a>`, não `<Link>`.
 *
 * A navegação do cliente para o mesmo endereço pode servir o que está no cache
 * do roteador — devolvendo exatamente o mesmo erro sem ter ido ao banco. Um
 * anchor comum recarrega o documento, que é o que a palavra "tentar" promete.
 */
function TentarDeNovo({ href }: { href: string }) {
  return (
    <a href={href} className={buttonVariants({ variant: 'outline' })}>
      <RotateCw aria-hidden />
      Tentar de novo
    </a>
  );
}

/**
 * O estoque: quanto há de cada coisa, o que pede ação, e o que mexeu nisso.
 *
 * O saldo chega ordenado pela urgência — negativo, zerado, no mínimo, em dia —,
 * porque a pergunta de quem abre esta tela é "o que eu preciso repor". O
 * resumo precisa de todos os produtos controlados, então eles são lidos de uma
 * vez (até `TETO_DO_SALDO`); a lista é paginada depois.
 *
 * Falha de leitura e estoque vazio são **dois** estados, e a tela nunca os
 * confunde: quando a consulta não volta, nada é apresentado como zero — nem a
 * contagem do cabeçalho, nem os tiles do resumo, nem o saldo de uma linha.
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
      /*
       * Com a leitura falhada, `count` é nulo e `totalControlados` cai para
       * zero — e "0 produtos com controle de estoque" seria uma afirmação
       * sobre o banco que ninguém apurou. A frase diz o que de fato aconteceu.
       */
      descricao={
        produtosR.error === null
          ? `${contagem(totalControlados, rotulo.singular, rotulo.plural)} com controle de estoque.`
          : 'Não consegui ler o catálogo agora — a contagem fica de fora até a próxima tentativa.'
      }
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
      <Page variant="operacao">
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
      </Page>
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
      <Page variant="operacao">
        {cabecalho}
        <StockTabs aba={aba} comRazao={veRazao} className="mb-4" />

        <div className="flex flex-col gap-4">
          <LedgerFilters
            tipo={tipo}
            produto={produtoPedido ?? ''}
            produtos={paraMovimentar}
            rotuloProduto={capitalizar(rotulo.singular)}
            rotuloVendas={capitalizar(termOf(terms, 'erp.sales').plural)}
          />
          {formulario}

          {razaoR.error !== null ? (
            /*
             * Falha de leitura não é razão vazio. Uma lista vazia aqui diria
             * "nada entrou nem saiu", que é uma afirmação sobre o estoque —
             * e o que aconteceu foi que ninguém conseguiu olhar.
             */
            <EmptyState
              estado="erro"
              titulo="Não consegui ler as movimentações"
              acao={<TentarDeNovo href="/erp/estoque?aba=movimentos" />}
            >
              A consulta ao banco falhou. Isto <strong>não</strong> significa que o razão está vazio
              — significa que ele não pôde ser lido agora, e nada nesta tela foi preenchido por
              estimativa.
            </EmptyState>
          ) : (
            <MovementList
              movimentos={movimentos}
              moldura="painel"
              animar={!filtrando && pagina === 1}
              iconeVazio={filtrando ? SearchX : History}
              tituloVazio={
                filtrando ? 'Nenhuma movimentação com estes filtros' : 'Nada entrou nem saiu ainda'
              }
              acaoVazia={
                filtrando ? (
                  <Link
                    href="/erp/estoque?aba=movimentos"
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    Limpar filtros
                  </Link>
                ) : undefined
              }
              vazio={
                filtrando
                  ? 'Há movimentações registradas, mas nenhuma passa por este tipo e este cadastro. Afrouxe um dos dois.'
                  : 'O razão é o que explica por que o saldo mudou. A primeira entrada, venda ou contagem aparece aqui assim que for registrada.'
              }
            />
          )}
        </div>

        <Pagination
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={total}
          params={{ aba: 'movimentos', tipo, produto: produtoPedido }}
        />
      </Page>
    );
  }

  /* ── Aba do saldo ───────────────────────────────────────────────────── */

  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const filtro = filtroPedido(params.situacao);
  const ordem = ordemPedida(params.ordem);

  const TETO_DOS_NIVEIS = TETO_DO_SALDO * 2;
  const { data: niveis, error: erroNiveis } = await supabase
    .from('inventory_stock_levels')
    .select('product_id, quantity')
    .eq('tenant_id', tenantId)
    .limit(TETO_DOS_NIVEIS);

  /*
   * Qualquer uma das duas leituras falhando invalida a tela inteira: sem os
   * produtos não há lista, e sem os níveis o `?? 0` de cada linha
   * transformaria "não li" em "está zerado" — o KPI vermelho passaria a contar
   * produtos que têm saldo no banco. É o achado de `page.tsx:327` da auditoria,
   * e a correção é não desenhar número nenhum.
   */
  if (produtosR.error !== null || erroNiveis !== null) {
    return (
      <Page variant="operacao">
        {cabecalho}
        <StockTabs aba={aba} comRazao={veRazao} className="mb-4" />
        <EmptyState
          estado="erro"
          titulo="Não consegui ler o saldo"
          acao={<TentarDeNovo href="/erp/estoque" />}
        >
          A consulta ao banco falhou, então não dá para dizer o que há em cada prateleira. Nada foi
          estimado: o que pareceria zerado pode ter saldo, e o que pareceria em dia pode estar
          pedindo reposição.
        </EmptyState>
      </Page>
    );
  }

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

  /*
   * As duas consultas têm teto. Passado ele, o resumo deixa de ser o total da
   * empresa e vira a soma do pedaço lido — e é assim que ele passa a ser
   * apresentado, com selo de "parcial" no tile e a frase abaixo dizendo onde a
   * leitura parou. Exibir a soma truncada como total é o que o CLAUDE.md
   * proíbe, não o fato de ela ser truncada.
   */
  const catalogoTruncado = totalControlados > TETO_DO_SALDO;
  const niveisTruncados = (niveis ?? []).length >= TETO_DOS_NIVEIS;
  const parcial = catalogoTruncado
    ? `soma de ${produtos.length.toLocaleString('pt-BR')} dos ${totalControlados.toLocaleString('pt-BR')} cadastros`
    : niveisTruncados
      ? 'saldos lidos até o teto da consulta'
      : undefined;

  const termo = semAcento(q);
  const visiveis = linhas
    .filter((l) => PASSA[filtro]!(l.situacao))
    .filter(
      (l) =>
        termo === '' ||
        semAcento(l.nome).includes(termo) ||
        (l.sku !== null && semAcento(l.sku).includes(termo)),
    )
    .sort(compararSaldo(ordem));
  const pagina_ = visiveis.slice(de, de + POR_PAGINA);

  /* O que os links de ordenação precisam preservar. `pagina` e `ordem` o próprio `hrefDeOrdem` descarta. */
  const filtrosNaUrl = { q, situacao: filtro === 'todos' ? '' : filtro };

  return (
    <Page variant="operacao">
      {cabecalho}
      <StockTabs aba={aba} comRazao={veRazao} className="mb-4" />

      <div className="flex flex-col gap-4">
        <StockSummaryCards resumo={resumo} filtro={filtro} rotulo={rotulo} parcial={parcial} />
        {formulario}
        <LevelFilters q={q} situacao={filtro} ordem={ordem} plural={rotulo.plural} />

        {(catalogoTruncado || niveisTruncados) && (
          <p className="max-w-prose text-caption text-content-muted">
            {catalogoTruncado &&
              `Resumo e lista cobrem os primeiros ${TETO_DO_SALDO.toLocaleString('pt-BR')} de ${totalControlados.toLocaleString('pt-BR')} cadastros, em ordem alfabética — use a busca para achar o resto. `}
            {niveisTruncados &&
              `A leitura de saldos bateu no teto de ${TETO_DOS_NIVEIS.toLocaleString('pt-BR')} linhas: pode haver cadastro aparecendo como zerado que tem saldo no banco.`}
          </p>
        )}

        <LevelRows
          saldos={pagina_}
          podeMovimentar={podeMovimentar}
          ordem={ordem}
          params={filtrosNaUrl}
          busca={q}
          filtro={filtro}
          animar={q === '' && filtro === 'todos' && ordem === ORDEM_PADRAO && pagina === 1}
          rotulo={rotulo}
        />
      </div>

      <Pagination
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={visiveis.length}
        params={{ ...filtrosNaUrl, ordem: ordem === ORDEM_PADRAO ? '' : ordem }}
      />
    </Page>
  );
}
