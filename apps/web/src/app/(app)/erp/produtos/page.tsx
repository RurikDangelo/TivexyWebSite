import { Package } from 'lucide-react';
import type { Metadata } from 'next';

import { type ErpUnit, formatCents, formatQuantity } from '@tivexy/core';
import { BarraDeBusca, SemResultado } from '@/components/crm/search-bar';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { filtroOu, parametro, umDentre } from '@/lib/crm/busca';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { supabaseServer } from '@/lib/supabase/server';

import { alternarProduto } from './actions';
import { ProductForm } from './product-form';
import type { CategoriaOferecida, ProdutoListado } from './state';

export const metadata: Metadata = { title: 'Produtos' };

/** Os recortes. `ativos` é o padrão: é o catálogo que se vende hoje. */
const RECORTES = ['ativos', 'todos', 'inativos'] as const;

/**
 * O catálogo.
 *
 * ## O saldo vem do saldo, não de uma contagem aqui
 *
 * `erp_stock_balances` é mantido por gatilho a partir do razão. Esta tela lê e
 * mostra; ela não soma movimento nenhum. Somar aqui seria criar uma terceira
 * resposta para uma pergunta que já tem uma — e a terceira divergiria das
 * outras no primeiro ajuste.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas.
 */
export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/erp/produtos');
  if (choice.kind !== 'resolved') return null;

  const params = await searchParams;
  const termo = parametro(params, 'b');
  const recorte = umDentre(parametro(params, 'estado'), RECORTES, 'ativos');

  const supabase = await supabaseServer();

  let consulta = supabase
    .from('erp_products')
    .select(
      'id, name, sku, unit, price_cents, cost_cents, track_stock, is_active, erp_product_categories(name)',
    )
    .eq('tenant_id', choice.tenant.id);

  const filtro = filtroOu(termo, ['name', 'sku', 'description']);
  if (filtro !== null) consulta = consulta.or(filtro);

  if (recorte === 'ativos') consulta = consulta.eq('is_active', true);
  else if (recorte === 'inativos') consulta = consulta.eq('is_active', false);

  const [{ data, error }, { data: categoriasBrutas }, { data: saldos }] = await Promise.all([
    consulta.order('name').limit(200),
    supabase
      .from('erp_product_categories')
      .select('id, name')
      .eq('tenant_id', choice.tenant.id)
      .order('position'),
    supabase
      .from('erp_stock_balances')
      .select('product_id, quantity')
      .eq('tenant_id', choice.tenant.id),
  ]);

  /*
   * Os saldos vêm numa consulta só e são cruzados em memória. A alternativa
   * — uma consulta por produto — seria duzentas idas ao banco para desenhar
   * uma lista.
   */
  const porProduto = new Map<string, number>();
  for (const linha of saldos ?? []) {
    porProduto.set(String(linha.product_id), Number(linha.quantity));
  }

  const categorias: CategoriaOferecida[] = (categoriasBrutas ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
  }));

  const produtos: ProdutoListado[] = (data ?? []).map((linha) => ({
    id: String(linha.id),
    name: String(linha.name),
    sku: (linha.sku as string | null) ?? null,
    unit: linha.unit as ErpUnit,
    priceCents: Number(linha.price_cents),
    costCents: Number(linha.cost_cents),
    trackStock: linha.track_stock === true,
    isActive: linha.is_active === true,
    categoria: nomeAninhado(linha.erp_product_categories),
    saldo: linha.track_stock === true ? (porProduto.get(String(linha.id)) ?? 0) : null,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">Produtos</h1>
        <p className="mt-1 text-content-muted">
          O que a empresa vende. {produtos.length}{' '}
          {termo === '' ? (produtos.length === 1 ? 'no catálogo' : 'no catálogo') : 'encontrados'}.
        </p>
      </header>

      <div className="mb-6">
        <ProductForm categorias={categorias} />
      </div>

      <BarraDeBusca
        termo={termo}
        placeholder="Nome, código ou descrição"
        filtro={{
          nome: 'estado',
          rotulo: 'Recorte',
          valor: recorte,
          opcoes: [
            { valor: 'ativos', texto: 'Ativos' },
            { valor: 'inativos', texto: 'Inativos' },
            { valor: 'todos', texto: 'Todos' },
          ],
        }}
      />

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler o catálogo</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {produtos.length === 0 && error === null && termo !== '' ? (
        <SemResultado termo={termo} limpar="/erp/produtos" />
      ) : produtos.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <Package className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhum produto ainda</CardTitle>
            <CardDescription>
              Cadastre o primeiro com o botão acima. Serviço também entra aqui — a diferença é só se
              ele controla estoque.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {produtos.map((produto) => (
            <Linha key={produto.id} produto={produto} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Linha({ produto }: { produto: ProdutoListado }) {
  /* Margem só faz sentido quando há custo. Mostrar "100%" sobre custo zero
     seria um número certo que induz a conclusão errada. */
  const margem =
    produto.costCents > 0 && produto.priceCents > 0
      ? Math.round(((produto.priceCents - produto.costCents) / produto.priceCents) * 100)
      : null;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle p-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-content">{produto.name}</span>
          {!produto.isActive && <Badge tone="neutral">inativo</Badge>}
          {!produto.trackStock && <Badge tone="brand">serviço</Badge>}
        </div>
        <p className="mt-0.5 truncate text-sm text-content-muted">
          {[produto.sku, produto.categoria].filter(Boolean).join(' · ') || 'Sem código'}
        </p>
      </div>

      <div className="text-right">
        <p className="font-mono text-sm text-content">{formatCents(produto.priceCents)}</p>
        <p className="text-xs text-content-subtle">
          por {produto.unit}
          {margem !== null && ` · margem ${margem}%`}
        </p>
      </div>

      <Saldo produto={produto} />

      <form action={alternarProduto}>
        <input type="hidden" name="id" value={produto.id} />
        <input type="hidden" name="ativo" value={produto.isActive ? 'sim' : 'nao'} />
        <button
          type="submit"
          className="h-8 rounded-md border border-line-strong px-3 text-xs text-content-default transition-colors hover:bg-surface-muted"
        >
          {produto.isActive ? 'Desativar' : 'Reativar'}
        </button>
      </form>
    </li>
  );
}

/**
 * O saldo do produto, ou a ausência dele.
 *
 * Serviço não mostra "0" — mostra nada. Zero é um número, e um número onde não
 * existe grandeza faz a pessoa procurar de onde ele saiu.
 */
function Saldo({ produto }: { produto: ProdutoListado }) {
  if (produto.saldo === null) {
    return <span className="w-16 text-right text-xs text-content-subtle">—</span>;
  }

  const negativo = produto.saldo < 0;
  const zerado = produto.saldo === 0;

  return (
    <span className="w-20 text-right">
      <span
        className={
          negativo
            ? 'block font-mono text-sm font-medium text-danger'
            : zerado
              ? 'block font-mono text-sm text-warning'
              : 'block font-mono text-sm text-content'
        }
      >
        {formatQuantity(produto.saldo)}
      </span>
      <span className="block text-xs text-content-subtle">
        {negativo ? 'negativo' : zerado ? 'sem estoque' : 'em estoque'}
      </span>
    </span>
  );
}
