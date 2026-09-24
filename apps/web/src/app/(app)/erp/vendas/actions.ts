'use server';

/**
 * As escritas das vendas.
 *
 * Mesmas duas regras do resto do sistema: `requireAccess()` roda aqui dentro
 * porque Server Action é endpoint, e o tenant vem da sessão, nunca do
 * formulário.
 *
 * ## O que estas funções NÃO fazem
 *
 * Nenhuma delas escreve `total_cents`, número de venda, saldo de estoque ou
 * lançamento financeiro. Essas quatro coisas são consequência, e quem as
 * produz é o banco — dois gatilhos e a função `erp_confirm_sale()`. Escrever
 * qualquer uma daqui seria criar uma segunda verdade.
 */

import { parseCents, parseQuantity } from '@tivexy/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import {
  CONFIRMAR_INICIAL,
  type ConfirmarState,
  ITEM_INICIAL,
  type ItemFormState,
  type NovaVendaState,
  PAGAMENTO_INICIAL,
  type PagamentoFormState,
} from './state.ts';

const ROTA = '/erp/vendas';

/** Recarrega a lista e a ficha da venda, que mostram o mesmo estado. */
function recarregar(id: string): void {
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
}

/**
 * Abre um rascunho e leva para a ficha.
 *
 * O rascunho existe porque montar uma venda item a item precisa de um estado
 * em que nada aconteceu no mundo. Sem ele, cada linha acrescentada mexeria no
 * estoque, e desistir no meio deixaria o inventário errado.
 */
export async function abrirVenda(
  _anterior: NovaVendaState,
  form: FormData,
): Promise<NovaVendaState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa antes de vender.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_sales')
    .insert({
      tenant_id: choice.tenant.id,
      company_id: opcional(form, 'company_id'),
      contact_id: opcional(form, 'contact_id'),
    })
    .select('id')
    .maybeSingle();

  if (error !== null || data === null) {
    return {
      erro:
        error === null
          ? 'Não consegui abrir a venda.'
          : mensagemDeErro(error, 'Você não tem permissão para registrar vendas aqui.'),
    };
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}/${String(data.id)}`);
}

/** O rascunho que esta ação pode mexer: deste tenant, e ainda rascunho. */
async function rascunhoDoTenant(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  tenantId: string,
  id: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('erp_sales')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    /*
     * `status = 'draft'` no `where`, e não num `if` depois de ler: é o que
     * impede uma aba velha de acrescentar item numa venda que outra pessoa
     * acabou de confirmar — a venda já teria baixado estoque pelo total
     * antigo.
     */
    .eq('status', 'draft')
    .maybeSingle();

  return data === null ? null : { id: String(data.id) };
}

export async function adicionarItem(
  _anterior: ItemFormState,
  form: FormData,
): Promise<ItemFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ITEM_INICIAL, erro: 'Escolha uma empresa.' };

  const vendaId = texto(form, 'venda');
  const supabase = await supabaseServer();
  const venda = await rascunhoDoTenant(supabase, choice.tenant.id, vendaId);
  if (venda === null) {
    return { ...ITEM_INICIAL, erro: 'Esta venda não é mais um rascunho — recarregue a página.' };
  }

  const campos: Record<string, string> = {};

  const produtoId = texto(form, 'product_id');
  if (produtoId === '') campos.product_id = 'Escolha o produto.';

  const quantidade = parseQuantity(texto(form, 'quantity'));
  if (quantidade === null) campos.quantity = 'Use 1,5 — e maior que zero.';

  /*
   * Preço em branco herda o do cadastro, e quem lê o cadastro é **o
   * servidor**. A tela poderia mandar o valor herdado num campo escondido, e
   * aí o preço da venda viria do navegador — quem editasse o campo venderia
   * pelo valor que quisesse. Aqui ele vem da tabela.
   */
  const precoBruto = texto(form, 'unit_price_cents');
  let preco = precoBruto === '' ? null : parseCents(precoBruto);
  if (precoBruto !== '' && preco === null) campos.unit_price_cents = 'Use 1.234,56.';

  if (Object.keys(campos).length > 0) {
    return { ...ITEM_INICIAL, campos: campos as ItemFormState['campos'] };
  }

  if (preco === null) {
    const { data: produto } = await supabase
      .from('erp_products')
      .select('price_cents')
      .eq('id', produtoId)
      .eq('tenant_id', choice.tenant.id)
      .maybeSingle();

    if (produto === null) {
      return { ...ITEM_INICIAL, campos: { product_id: 'Esse produto não está na sua lista.' } };
    }
    preco = Number(produto.price_cents);
  }

  /*
   * O preço é gravado no item, não lido do produto na hora do relatório. Não é
   * redundância: ler o preço atual num relatório de seis meses atrás mostraria
   * o faturamento de então com os preços de hoje.
   */
  const { error } = await supabase.from('erp_sale_items').insert({
    tenant_id: choice.tenant.id,
    sale_id: venda.id,
    product_id: produtoId,
    quantity: quantidade,
    unit_price_cents: preco,
  });

  if (error !== null) {
    return {
      ...ITEM_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para editar esta venda.'),
    };
  }

  recarregar(venda.id);
  return ITEM_INICIAL;
}

export async function removerItem(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const vendaId = texto(form, 'venda');
  const itemId = texto(form, 'item');
  if (itemId === '') return;

  const supabase = await supabaseServer();
  const venda = await rascunhoDoTenant(supabase, choice.tenant.id, vendaId);
  if (venda === null) return;

  await supabase
    .from('erp_sale_items')
    .delete()
    .eq('id', itemId)
    .eq('tenant_id', choice.tenant.id)
    .eq('sale_id', venda.id);

  recarregar(venda.id);
}

/**
 * Muda o desconto.
 *
 * Não recalcula o total: quem recalcula é o gatilho
 * `erp_sales_recalc_discount`. Calcular aqui daria o mesmo número quase
 * sempre, e "quase sempre" em cima de dinheiro é o que produz a diferença de
 * um centavo que ninguém explica.
 */
export async function mudarDesconto(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const vendaId = texto(form, 'venda');
  const bruto = texto(form, 'desconto');
  const desconto = bruto === '' ? 0 : parseCents(bruto);
  if (desconto === null) return;

  const supabase = await supabaseServer();
  const venda = await rascunhoDoTenant(supabase, choice.tenant.id, vendaId);
  if (venda === null) return;

  await supabase
    .from('erp_sales')
    .update({ discount_cents: desconto })
    .eq('id', venda.id)
    .eq('tenant_id', choice.tenant.id);

  recarregar(venda.id);
}

/**
 * Registra como o cliente pagou.
 *
 * ⚠️ **Registro, não cobrança.** Nada aqui fala com adquirente, gera boleto ou
 * confirma pagamento. Uma linha "Cartão de crédito" quer dizer que alguém
 * anotou que o cliente pagou com cartão — e apresentar isso como recebimento
 * de verdade é o que o `CLAUDE.md` proíbe.
 */
export async function registrarPagamento(
  _anterior: PagamentoFormState,
  form: FormData,
): Promise<PagamentoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa.' };

  const vendaId = texto(form, 'venda');
  const formaId = texto(form, 'payment_method_id');
  const valor = parseCents(texto(form, 'amount_cents'));

  if (formaId === '' || valor === null || valor <= 0) {
    return { erro: 'Escolha a forma e informe um valor maior que zero.' };
  }

  const supabase = await supabaseServer();

  /*
   * Aqui vale para rascunho **e** para confirmada: o cliente pode pagar
   * depois, e a venda já estar fechada. O que não vale é mexer em venda de
   * outro tenant, e disso cuida o `where`.
   */
  const { data: venda } = await supabase
    .from('erp_sales')
    .select('id')
    .eq('id', vendaId)
    .eq('tenant_id', choice.tenant.id)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (venda === null) return { erro: 'Venda não encontrada.' };

  const { error } = await supabase.from('erp_sale_payments').insert({
    tenant_id: choice.tenant.id,
    sale_id: String(venda.id),
    payment_method_id: formaId,
    amount_cents: valor,
  });

  if (error !== null) {
    return { erro: mensagemDeErro(error, 'Você não tem permissão para editar esta venda.') };
  }

  recarregar(String(venda.id));
  return PAGAMENTO_INICIAL;
}

/**
 * Confirma a venda.
 *
 * Quem faz o trabalho é `erp_confirm_sale()`, no banco. São quatro escritas
 * que só fazem sentido juntas — número, estado, baixa de estoque e
 * recebimento — e o cliente PostgREST não tem transação: daqui seriam quatro
 * chamadas, com quatro pontos onde a rede pode cair. O pior desfecho parcial
 * não parece defeito: o estoque baixa e a venda continua rascunho.
 *
 * A função é `SECURITY INVOKER`, então cada escrita passa pelo RLS como se
 * tivesse partido daqui. Isto **não** é atalho para escrever o que a pessoa
 * não poderia.
 */
export async function confirmarVenda(
  _anterior: ConfirmarState,
  form: FormData,
): Promise<ConfirmarState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...CONFIRMAR_INICIAL, erro: 'Escolha uma empresa.' };

  const vendaId = texto(form, 'venda');
  if (vendaId === '') return { ...CONFIRMAR_INICIAL, erro: 'Venda não informada.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('erp_confirm_sale', { p_sale_id: vendaId });

  if (error !== null) {
    /*
     * A função levanta mensagens escritas para gente — "uma venda sem itens
     * não tem o que confirmar", "este cliente exige identificar quem
     * comprou". Repassar é melhor que um texto genérico.
     */
    return {
      ...CONFIRMAR_INICIAL,
      erro: error.message.replace(/^error:\s*/i, '') || 'Não consegui confirmar.',
    };
  }

  const linha = (Array.isArray(data) ? data[0] : data) as { number?: unknown } | null;

  recarregar(vendaId);
  revalidatePath('/erp/estoque');
  revalidatePath('/erp/financeiro');
  return { erro: null, numero: typeof linha?.number === 'number' ? linha.number : null };
}

/**
 * Cancela a venda.
 *
 * **Só rascunho.** Cancelar uma venda confirmada teria que devolver o estoque
 * e estornar o recebimento, e as duas coisas têm consequência contábil — não
 * são o oposto simétrico de confirmar. Enquanto esse caminho não existir, a
 * tela diz isso em vez de oferecer um botão que faria metade.
 */
export async function cancelarVenda(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const vendaId = texto(form, 'venda');
  if (vendaId === '') return;

  const supabase = await supabaseServer();
  await supabase
    .from('erp_sales')
    .delete()
    .eq('id', vendaId)
    .eq('tenant_id', choice.tenant.id)
    .eq('status', 'draft');

  revalidatePath(ROTA);
  redirect(ROTA);
}
