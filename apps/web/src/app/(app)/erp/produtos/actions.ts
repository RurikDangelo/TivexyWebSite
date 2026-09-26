'use server';

/**
 * As escritas de produto.
 *
 * `requireAccess()` de novo aqui dentro — Server Action é endpoint. O tenant
 * vem da sessão, nunca do formulário. Quem garante a permissão é o RLS:
 * escrever pede `erp.products.write`, apagar pede `erp.products.delete`, em
 * políticas separadas.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campoRepetido, parseProductInput } from '@/lib/erp/product-input';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { ACAO_INICIAL, type AcaoState, PRODUTO_INICIAL, type ProdutoFormState } from './state';

const ROTA = '/erp/produtos';

const REPETIDO = {
  sku: 'Outro produto já usa este código.',
  codigoDeBarras: 'Outro produto já usa este código de barras.',
} as const;

function falhaDoBanco(error: { code?: string; message?: string }): ProdutoFormState {
  const repetido = error.code === '23505' ? campoRepetido(error.message) : null;
  if (repetido === 'sku' || repetido === 'codigoDeBarras') {
    return { ...PRODUTO_INICIAL, campos: { [repetido]: REPETIDO[repetido] } };
  }
  if (error.code === '23503') {
    return {
      ...PRODUTO_INICIAL,
      erro: 'A categoria escolhida não existe mais. Recarregue a página.',
    };
  }
  return { ...PRODUTO_INICIAL, erro: dbErrorMessage(error) };
}

export async function criarProduto(
  anterior: ProdutoFormState,
  form: FormData,
): Promise<ProdutoFormState> {
  const { choice } = await requireAccess(ROTA);
  const falha = { ...PRODUTO_INICIAL, rodada: anterior.rodada };
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };

  const conferido = parseProductInput(form);
  if (!conferido.ok) return { ...falha, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { error } = await supabase.from('erp_products').insert({
    tenant_id: choice.tenant.id,
    name: v.nome,
    category_id: v.categoriaId,
    unit: v.unidade,
    price_cents: v.precoCentavos,
    cost_cents: v.custoCentavos,
    sku: v.sku,
    barcode: v.codigoDeBarras,
    // Sem o interruptor na tela (tenant sem estoque), nasce controlando: é o
    // padrão certo para quando o módulo for contratado.
    track_stock: v.controlaEstoque ?? true,
    min_stock: v.estoqueMinimo,
    description: v.descricao,
  });

  if (error !== null) return { ...falhaDoBanco(error), rodada: anterior.rodada };

  revalidatePath(ROTA);
  return { ...PRODUTO_INICIAL, salvo: v.nome, rodada: anterior.rodada + 1 };
}

export async function editarProduto(
  _anterior: ProdutoFormState,
  form: FormData,
): Promise<ProdutoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...PRODUTO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = form.get('id');
  if (!isUuid(id)) return { ...PRODUTO_INICIAL, erro: 'Não encontrei este produto.' };

  const conferido = parseProductInput(form);
  if (!conferido.ok) return { ...PRODUTO_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_products')
    .update({
      name: v.nome,
      category_id: v.categoriaId,
      unit: v.unidade,
      price_cents: v.precoCentavos,
      cost_cents: v.custoCentavos,
      sku: v.sku,
      barcode: v.codigoDeBarras,
      ...(v.controlaEstoque === null ? {} : { track_stock: v.controlaEstoque }),
      min_stock: v.estoqueMinimo,
      description: v.descricao,
    })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) return falhaDoBanco(error);
  if (data.length === 0) {
    return {
      ...PRODUTO_INICIAL,
      erro: 'Não foi possível salvar: sem permissão, ou o produto não existe mais.',
    };
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ...PRODUTO_INICIAL, salvo: v.nome };
}

/**
 * Tirar de venda e voltar a vender.
 *
 * Produto com história não se apaga — é assim que ele sai da tela de venda
 * sem sumir das vendas antigas.
 */
export async function mudarSituacaoProduto(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ACAO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = campo(form, 'id');
  if (!isUuid(id)) return { ...ACAO_INICIAL, erro: 'Não encontrei este produto.' };
  const ativo = campo(form, 'ativo') === '1';

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_products')
    .update({ active: ativo })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) return { ...ACAO_INICIAL, erro: dbErrorMessage(error) };
  if (data.length === 0) return { ...ACAO_INICIAL, erro: 'Não foi possível: sem permissão.' };

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ...ACAO_INICIAL, ok: ativo ? 'Voltou a vender.' : 'Saiu de venda.' };
}

/**
 * Apagar de vez — só o que nunca teve venda nem movimentação.
 *
 * Quem decide é a chave estrangeira: item de venda e movimentação de estoque
 * apontam para o produto, e o banco recusa. A mensagem diz o caminho certo.
 */
export async function excluirProduto(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ACAO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = campo(form, 'id');
  if (!isUuid(id)) return { ...ACAO_INICIAL, erro: 'Não encontrei este produto.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_products')
    .delete()
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) {
    return {
      ...ACAO_INICIAL,
      erro:
        error.code === '23503'
          ? 'Este produto já tem venda ou movimentação de estoque, e a história precisa dele. Tire de venda em vez de apagar.'
          : dbErrorMessage(error),
    };
  }
  if (data.length === 0) {
    return { ...ACAO_INICIAL, erro: 'Apagar produto é de quem administra o cadastro.' };
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}
