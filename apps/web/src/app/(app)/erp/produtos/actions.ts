'use server';

/**
 * As escritas da tela de produtos.
 *
 * Mesmas duas regras do resto do sistema: `requireAccess()` roda aqui dentro
 * porque Server Action é endpoint, e o tenant vem da sessão, nunca do
 * formulário. Ver `crm/leads/actions.ts` para o motivo de cada uma.
 */

import { ERP_UNITS, type ErpUnit, parseCents } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { PRODUTO_INICIAL, type ProdutoFormState } from './state.ts';

const ROTA = '/erp/produtos';

function ehUnidade(valor: string): valor is ErpUnit {
  return (ERP_UNITS as readonly string[]).includes(valor);
}

export async function criarProduto(
  _anterior: ProdutoFormState,
  form: FormData,
): Promise<ProdutoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...PRODUTO_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const campos: Record<string, string> = {};

  const nome = texto(form, 'name');
  if (nome === '') campos.name = 'Obrigatório.';

  /*
   * Preço em branco é zero, e preço torto é erro. A diferença importa: quem
   * ainda não definiu o preço deixa vazio de propósito, e quem digitou
   * `1.2.3` errou — transformar os dois em zero esconde o segundo, e o que
   * some é justamente o número que vai para a nota.
   */
  const precoBruto = texto(form, 'price_cents');
  const preco = precoBruto === '' ? 0 : parseCents(precoBruto);
  if (preco === null) campos.price_cents = 'Use 1.234,56.';

  const custoBruto = texto(form, 'cost_cents');
  const custo = custoBruto === '' ? 0 : parseCents(custoBruto);
  if (custo === null) campos.cost_cents = 'Use 1.234,56.';

  if (Object.keys(campos).length > 0) {
    return { ...PRODUTO_INICIAL, campos: campos as ProdutoFormState['campos'] };
  }

  const unidade = texto(form, 'unit');
  const supabase = await supabaseServer();

  const { error } = await supabase.from('erp_products').insert({
    tenant_id: choice.tenant.id,
    name: nome,
    sku: opcional(form, 'sku'),
    description: opcional(form, 'description'),
    category_id: opcional(form, 'category_id'),
    unit: ehUnidade(unidade) ? unidade : 'un',
    price_cents: preco,
    cost_cents: custo,
    /*
     * Serviço não tem estoque. Sem esta distinção, "hora de consultoria"
     * apareceria no inventário com saldo negativo eterno.
     */
    track_stock: texto(form, 'track_stock') === 'sim',
  });

  if (error !== null) {
    /*
     * `23505` é o índice `erp_products_sku_unique`. Traduzir é o que separa
     * "esse código já é de outro produto" de um erro que manda a pessoa abrir
     * chamado — e código repetido é o engano mais comum deste cadastro.
     */
    if (error.code === '23505') {
      return { ...PRODUTO_INICIAL, campos: { sku: 'Esse código já é de outro produto.' } };
    }
    return {
      ...PRODUTO_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para cadastrar produtos aqui.'),
    };
  }

  revalidatePath(ROTA);
  revalidatePath('/erp/estoque');
  return { ...PRODUTO_INICIAL, criado: nome };
}

/**
 * Liga e desliga o produto.
 *
 * Desativar e não apagar: produto apagado levaria junto o histórico de
 * vendas que aponta para ele — `erp_sale_items` referencia com
 * `on delete restrict` justamente para impedir isso. Desativado some das
 * listas de venda e continua no relatório do ano passado.
 */
export async function alternarProduto(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  if (id === '') return;

  const estavaAtivo = texto(form, 'ativo') === 'sim';

  const supabase = await supabaseServer();
  await supabase
    .from('erp_products')
    .update({ is_active: !estavaAtivo })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    /* O estado de origem: dois cliques rápidos não alternam duas vezes. */
    .eq('is_active', estavaAtivo);

  revalidatePath(ROTA);
}
