import { addDays, can, instantFromLocal, todayIn } from '@tivexy/core';
import { CreditCard, Plus, ShoppingCart } from 'lucide-react';
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
import { formatInstant } from '@/lib/format';
import { paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import {
  SaleRows,
  SalesFilters,
  SalesSummary,
  type VazioDaLista,
  type VendaListada,
} from './sale-rows';
import {
  POR_PAGINA,
  type Periodo,
  ordemNaUrl,
  ordenacaoPedida,
  periodoPedido,
  situacaoDeVendaPedida,
} from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/erp/vendas') };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

const DIAS_ATRAS: Record<Periodo, number | null> = { hoje: 0, '7d': 6, '30d': 29, tudo: null };
const NO_PERIODO: Record<Periodo, string> = {
  hoje: 'hoje',
  '7d': 'nos últimos 7 dias',
  '30d': 'nos últimos 30 dias',
  tudo: 'até agora',
};

/**
 * As vendas, com o resumo do período em cima.
 *
 * O período é o dia do tenant — "hoje" em Manaus começa uma hora depois de
 * "hoje" em São Paulo —, convertido para instantes com `instantFromLocal`, e o
 * resumo vem de `erp_sales_summary()`: a soma é do banco, sobre todas as
 * vendas do período, e não da página que está na tela.
 */
export default async function VendasPage({ searchParams }: PageProps<'/erp/vendas'>) {
  const { choice, viewer } = await requireAccess('/erp/vendas');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/erp/vendas');
  const rotulo = termOf(terms, 'erp.sales');
  const podeVender = can(viewer, 'erp.sales.write');

  const params = await searchParams;
  const periodo = periodoPedido(params.periodo);
  const situacao = situacaoDeVendaPedida(params.situacao);
  const numeroBruto = typeof params.numero === 'string' ? params.numero.trim() : '';
  const numero = /^\d{1,12}$/.test(numeroBruto) ? numeroBruto : '';
  const ordenacao = ordenacaoPedida(params.ordem);
  const ordem = ordemNaUrl(ordenacao);
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;

  const fuso = await tenantTimeZone();
  const hoje = todayIn(fuso);
  const atras = DIAS_ATRAS[periodo];
  const inicio =
    atras === null
      ? '2000-01-01T00:00:00Z'
      : instantFromLocal(addDays(hoje, -atras), '00:00', fuso);
  const fim =
    atras === null ? '2100-01-01T00:00:00Z' : instantFromLocal(addDays(hoje, 1), '00:00', fuso);

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('erp_sales')
    .select(
      'id, number, status, sold_at, total_cents, customer:erp_customers(name), payments:erp_sale_payments(method_name)',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .gte('sold_at', inicio)
    .lt('sold_at', fim);
  if (situacao === 'concluidas') consulta = consulta.eq('status', 'completed');
  else if (situacao === 'canceladas') consulta = consulta.eq('status', 'cancelled');
  if (numero !== '') consulta = consulta.eq('number', numero);

  /*
   * A ordenação pedida na URL entra na consulta, nunca na página: ordenar só os
   * 50 registros já carregados diria "o maior total" sobre um recorte, e o
   * recorte não é o período. `ordenacaoPedida` já traduziu a chave da URL para
   * o nome real da coluna — nada do endereço chega cru ao `.order()`.
   *
   * Sem pedido, a ordem continua sendo a de antes: mais recente primeiro.
   */
  const ordenada =
    ordenacao === null
      ? consulta.order('sold_at', { ascending: false }).order('number', { ascending: false })
      : ordenacao.coluna === 'number'
        ? consulta.order('number', { ascending: ordenacao.ascendente })
        : consulta
            .order(ordenacao.coluna, { ascending: ordenacao.ascendente })
            /* Desempate estável: duas vendas do mesmo instante não podem trocar de lugar entre páginas. */
            .order('number', { ascending: false });

  const [lista, resumoR] = await Promise.all([
    ordenada.range(de, de + POR_PAGINA - 1),
    supabase.rpc('erp_sales_summary', { p_tenant_id: tenantId, p_from: inicio, p_to: fim }),
  ]);

  const vendas: VendaListada[] = (lista.data ?? []).map((v) => ({
    id: String(v.id),
    numero: Number(v.number),
    quando: formatInstant(String(v.sold_at), fuso),
    cliente: relacao<{ name: string }>(v.customer)?.name ?? null,
    formas: (Array.isArray(v.payments) ? v.payments : [])
      .map((p) => String((p as { method_name?: unknown }).method_name ?? ''))
      .filter((n) => n !== ''),
    totalCentavos: Number(v.total_cents),
    cancelada: v.status === 'cancelled',
  }));
  const total = lista.count ?? vendas.length;

  const linhaDoResumo = (Array.isArray(resumoR.data) ? resumoR.data[0] : resumoR.data) as {
    sales_count?: unknown;
    total_cents?: unknown;
    discount_cents?: unknown;
    cancelled_count?: unknown;
  } | null;
  const resumo = {
    vendas: Number(linhaDoResumo?.sales_count ?? 0),
    totalCentavos: Number(linhaDoResumo?.total_cents ?? 0),
    descontoCentavos: Number(linhaDoResumo?.discount_cents ?? 0),
    canceladas: Number(linhaDoResumo?.cancelled_count ?? 0),
  };

  const filtrando = situacao !== 'todas' || numero !== '';
  /* Um evento de entrada por rota: paginar, filtrar ou ordenar não repete a coreografia. */
  const animar = Object.keys(params).length === 0;

  const paramsDaUrl = {
    periodo: periodo === '30d' ? '' : periodo,
    situacao: situacao === 'todas' ? '' : situacao,
    numero,
    ordem,
  };

  /*
   * Três ausências diferentes, três respostas diferentes. A da falha vive aqui
   * fora da tabela: um cabeçalho de colunas de pé sobre uma leitura que não
   * aconteceu afirma que a consulta voltou vazia, e ela não voltou.
   */
  const vazio: VazioDaLista = filtrando
    ? {
        icone: ShoppingCart,
        titulo: 'Nada encontrado com este filtro',
        frase:
          numero !== ''
            ? `Nenhum registro com o nº ${numero} ${NO_PERIODO[periodo]}. O número existe fora deste período?`
            : `Nenhum registro nesta situação ${NO_PERIODO[periodo]}. Afrouxe o filtro para ver o resto.`,
        acao: (
          <Link
            href={`/erp/vendas?periodo=${periodo}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Limpar os filtros
          </Link>
        ),
      }
    : {
        icone: ShoppingCart,
        titulo: `Sem ${rotulo.plural} ${NO_PERIODO[periodo]}`,
        frase: podeVender
          ? 'Cada registro baixa o estoque e lança o que entra no caixa — é daqui que o resto do ERP se alimenta.'
          : 'Quando alguém da equipe registrar, aparece aqui.',
        acao: (
          <>
            {podeVender && (
              <Link href="/erp/vendas/nova" className={buttonVariants({ size: 'sm' })}>
                <Plus aria-hidden />
                Registrar {rotulo.singular}
              </Link>
            )}
            {periodo !== 'tudo' && (
              <Link
                href="/erp/vendas?periodo=tudo"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ver desde o início
              </Link>
            )}
          </>
        ),
      };

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={titulo}
        descricao={`${capitalizar(NO_PERIODO[periodo])}, no fuso da empresa.`}
        acoes={
          <>
            <Link href="/erp/vendas/formas" className={buttonVariants({ variant: 'outline' })}>
              <CreditCard aria-hidden />
              Formas de pagamento
            </Link>
            {podeVender && (
              <Link href="/erp/vendas/nova" className={buttonVariants()}>
                <Plus aria-hidden />
                Registrar {rotulo.singular}
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {resumoR.error === null ? (
          <SalesSummary resumo={resumo} rotuloPlural={capitalizar(rotulo.plural)} />
        ) : (
          /* Falhar em somar não pode virar quatro zeros: zero é uma medida, e esta não foi feita. */
          <EmptyState
            estado="erro"
            titulo="Não consegui somar o período"
            densidade="compacta"
            acao={
              <Link
                href={`/erp/vendas?periodo=${periodo}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Tentar de novo
              </Link>
            }
          >
            Os números do topo ficaram de fora desta carga. A lista abaixo continua valendo.
          </EmptyState>
        )}

        <SalesFilters periodo={periodo} situacao={situacao} numero={numero} ordem={ordem} />

        {lista.error !== null ? (
          <EmptyState
            estado="erro"
            titulo="Não consegui ler os registros"
            acao={
              <Link href="/erp/vendas" className={buttonVariants({ variant: 'outline' })}>
                Tentar de novo
              </Link>
            }
          >
            A leitura falhou no meio do caminho — não sei dizer se há registros neste período.
            Recarregue em instantes.
          </EmptyState>
        ) : (
          <>
            <SaleRows
              vendas={vendas}
              rotuloSingular={capitalizar(rotulo.singular)}
              ordem={ordem === '' ? null : ordem}
              params={paramsDaUrl}
              animar={animar}
              vazio={vazio}
            />
            <Pagination
              pagina={pagina}
              porPagina={POR_PAGINA}
              total={total}
              params={paramsDaUrl}
              className="mt-0"
            />
          </>
        )}
      </div>
    </Page>
  );
}
