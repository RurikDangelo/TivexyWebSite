import {
  type InventoryMovementKind,
  UNIT_INFO,
  can,
  formatCents,
  formatCentsInput,
  formatQuantity,
  formatQuantityInput,
  grossMargin,
  isProductUnit,
  stockStatus,
} from '@tivexy/core';
import { Ban } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/page/empty-state';
import { type Fato, Facts } from '@/components/page/facts';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { GradeDeRegistro, Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { MOVIMENTO, formatMargin } from '@/lib/erp/labels';
import { formatInstant } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { nomeDe, tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

import { MovementList, type MovimentoNaTela } from '../../movement-list';
import { EditProductForm } from '../product-form';
import { SituacaoDoEstoque } from '../product-rows';
import { ProductStatusActions } from './status-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: capitalizar(termOf(await currentTerms(), 'erp.products').singular) };
}

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/** Quantas movimentações a consulta traz. O número está na tela: lista cortada que não se diz cortada é mentira. */
const MOVIMENTOS_NA_TELA = 10;

/**
 * Colunas laterais que acompanham a rolagem.
 *
 * O topo é `--header-h` mais o `py-6` do `<main>`, e não um `top-20` escolhido
 * a olho: mudar a altura do cabeçalho passa a mover as colunas junto, em vez de
 * deixá-las presas a um número que já não corresponde a nada.
 */
const COLUNA_FIXA =
  'flex flex-col gap-4 xl:sticky xl:top-[calc(var(--header-h)+1.5rem)] xl:self-start';

/**
 * Um produto: quanto custa, quanto rende, quanto há — e o que mexeu nisso.
 *
 * As últimas movimentações aparecem para quem pode vê-las: é a resposta para
 * "por que o sistema diz 3 se na prateleira tem 5", que é a pergunta que traz
 * alguém a esta página.
 */
export default async function ProdutoPage({ params }: PageProps<'/erp/produtos/[id]'>) {
  const { choice, viewer } = await requireAccess('/erp/produtos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const { data: produto } = await supabase
    .from('erp_products')
    .select(
      'id, name, description, sku, barcode, unit, price_cents, cost_cents, track_stock, min_stock, active, category_id, created_at, category:erp_product_categories(name)',
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (produto === null) notFound();

  const terms = await currentTerms();
  const fuso = await tenantTimeZone();
  const rotulo = termOf(terms, 'erp.products');
  const rotuloVenda = capitalizar(termOf(terms, 'erp.sales').singular);
  const podeEditar = can(viewer, 'erp.products.write');
  const podeExcluir = can(viewer, 'erp.products.delete');
  const comEstoque = viewer.enabledModules.has('inventory');
  const controla = produto.track_stock === true;
  const veMovimentos = comEstoque && controla && can(viewer, 'inventory.movements.read');

  const unidade = isProductUnit(produto.unit) ? produto.unit : 'un';
  const preco = Number(produto.price_cents);
  const custo = produto.cost_cents === null ? null : Number(produto.cost_cents);
  const minimo = produto.min_stock === null ? null : Number(produto.min_stock);
  const margem = grossMargin(preco, custo);

  /* `error: null` explícito nos ramos que não consultam: é o que permite,
     abaixo, distinguir "não perguntei" de "perguntei e falhou". */
  const [saldoR, movimentosR, categoriasR, membros] = await Promise.all([
    comEstoque && controla
      ? supabase
          .from('inventory_stock_levels')
          .select('quantity')
          .eq('tenant_id', tenantId)
          .eq('product_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    veMovimentos
      ? supabase
          .from('inventory_movements')
          .select(
            'id, kind, quantity, counted_quantity, reason, created_by, created_at, sale:erp_sales(number)',
          )
          .eq('tenant_id', tenantId)
          .eq('product_id', id)
          .order('created_at', { ascending: false })
          .limit(MOVIMENTOS_NA_TELA)
      : Promise.resolve({ data: [], error: null }),
    podeEditar
      ? supabase
          .from('erp_product_categories')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .order('position')
          .order('name')
      : Promise.resolve({ data: [] }),
    veMovimentos ? tenantMembers(tenantId) : Promise.resolve([]),
  ]);

  /*
   * Saldo que não foi lido não é saldo zero. Sem esta guarda, uma falha de
   * leitura vira "0 un · sem estoque" na ficha — a tela afirmando um número
   * que o banco não devolveu.
   */
  const saldoIndisponivel = comEstoque && controla && saldoR.error !== null;
  const saldo = saldoR.data === null ? 0 : Number(saldoR.data.quantity);
  const situacao = stockStatus({ trackStock: controla, quantity: saldo, minStock: minimo });
  const categoria = relacao<{ name: string }>(produto.category);

  const movimentos: MovimentoNaTela[] = (movimentosR.data ?? []).map((m) => {
    const kind = String(m.kind) as InventoryMovementKind;
    const venda = relacao<{ number: number }>(m.sale);
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
      unidade,
    };
  });

  const descricaoDoProduto =
    typeof produto.description === 'string' && produto.description !== ''
      ? produto.description
      : null;

  const fatos: Fato[] = [
    {
      rotulo: 'Preço de venda',
      valor: (
        <span className="tabular-nums">
          {formatCents(preco)} <span className="text-content-muted">por {unidade}</span>
        </span>
      ),
      numerico: true,
    },
    {
      rotulo: 'Custo',
      valor: custo === null ? null : formatCents(custo),
      numerico: true,
    },
    {
      rotulo: 'Margem',
      valor:
        margem === null ? null : (
          <span className={cn(margem < 0 && 'text-danger')}>
            {formatMargin(margem)}
            {margem < 0 ? ' — abaixo do custo' : ''}
          </span>
        ),
      numerico: true,
    },
    { rotulo: 'Unidade', valor: `${unidade} — ${UNIT_INFO[unidade].singular}` },
    { rotulo: 'Categoria', valor: categoria?.name ?? null },
    {
      rotulo: 'Código interno',
      valor: typeof produto.sku === 'string' ? produto.sku : null,
      numerico: true,
    },
    {
      rotulo: 'Código de barras',
      valor: typeof produto.barcode === 'string' ? produto.barcode : null,
      numerico: true,
    },
    ...(comEstoque
      ? [
          {
            rotulo: 'Estoque',
            valor: !controla ? (
              'Não controla — serviço ou item feito na hora'
            ) : saldoIndisponivel ? (
              <span className="text-content-muted">
                Não consegui ler o saldo agora. Recarregue a página.
              </span>
            ) : (
              <SituacaoDoEstoque saldo={saldo} situacao={situacao} unidade={unidade} />
            ),
          },
          ...(controla && !saldoIndisponivel
            ? [
                {
                  rotulo: 'Estoque mínimo',
                  valor: minimo === null ? null : formatQuantity(minimo, unidade),
                  numerico: true,
                },
              ]
            : []),
        ]
      : []),
    { rotulo: 'Cadastro', valor: formatInstant(String(produto.created_at), fuso) },
  ];

  const temAcoes = podeEditar || podeExcluir;

  return (
    <Page variant="registro">
      <PageHeader
        titulo={String(produto.name)}
        trilha={[{ rotulo: sectionTitle(terms, '/erp/produtos'), href: '/erp/produtos' }]}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            {capitalizar(rotulo.singular)}
            {produto.active !== true && (
              <Badge Icone={Ban} className="align-middle">
                Fora de venda
              </Badge>
            )}
          </span>
        }
      />

      {/* Sem permissão de escrita nem de exclusão não há terceira coluna — e uma
          faixa de 20rem vazia à direita leria como conteúdo que não carregou. */}
      <GradeDeRegistro className={temAcoes ? undefined : 'xl:grid-cols-[18rem_minmax(0,1fr)]'}>
        <div className={COLUNA_FIXA}>
          <Card>
            <CardHeader>
              <CardTitle>Ficha</CardTitle>
            </CardHeader>
            <CardContent>
              <Facts fatos={fatos} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {veMovimentos && (
            <Card>
              <CardHeader>
                <CardTitle>Últimas movimentações</CardTitle>
                {/* O `.limit()` está dito na tela: a lista é um recorte, não o histórico. */}
                <CardDescription>
                  As {MOVIMENTOS_NA_TELA} mais recentes. O histórico completo fica no estoque.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {movimentosR.error !== null ? (
                  <EmptyState
                    estado="erro"
                    titulo="Não consegui ler as movimentações"
                    densidade="compacta"
                    moldura={false}
                  >
                    A leitura falhou agora, então não dá para saber se houve movimento. Recarregue a
                    página em instantes.
                  </EmptyState>
                ) : (
                  <MovementList
                    movimentos={movimentos}
                    vazio="Nada entrou nem saiu ainda. A primeira entrada, a primeira venda ou uma contagem aparecem aqui."
                  />
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{podeEditar ? 'Editar cadastro' : 'Descrição'}</CardTitle>
            </CardHeader>
            <CardContent>
              {podeEditar ? (
                <EditProductForm
                  singular={rotulo.singular}
                  categorias={(categoriasR.data ?? []).map((c) => ({
                    id: String(c.id),
                    nome: String(c.name),
                  }))}
                  comEstoque={comEstoque}
                  inicial={{
                    id: String(produto.id),
                    nome: String(produto.name),
                    categoriaId:
                      typeof produto.category_id === 'string' ? produto.category_id : null,
                    unidade,
                    preco: formatCentsInput(preco),
                    custo: custo === null ? null : formatCentsInput(custo),
                    sku: typeof produto.sku === 'string' ? produto.sku : null,
                    codigoDeBarras: typeof produto.barcode === 'string' ? produto.barcode : null,
                    controlaEstoque: controla,
                    estoqueMinimo: minimo === null ? null : formatQuantityInput(minimo),
                    descricao: descricaoDoProduto,
                  }}
                />
              ) : descricaoDoProduto === null ? (
                <p className="text-body text-content-subtle">Sem descrição.</p>
              ) : (
                /* `max-w-prose` no parágrafo, nunca no contêiner: a medida de
                   leitura é do texto, e a coluna continua servindo à tabela. */
                <p className="max-w-prose whitespace-pre-wrap text-body-lg text-content-default">
                  {descricaoDoProduto}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {temAcoes && (
          <div className={COLUNA_FIXA}>
            <Card>
              <CardHeader>
                <CardTitle>Situação</CardTitle>
              </CardHeader>
              <CardContent>
                <ProductStatusActions
                  id={String(produto.id)}
                  nome={String(produto.name)}
                  ativo={produto.active === true}
                  podeEditar={podeEditar}
                  podeExcluir={podeExcluir}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </GradeDeRegistro>
    </Page>
  );
}
