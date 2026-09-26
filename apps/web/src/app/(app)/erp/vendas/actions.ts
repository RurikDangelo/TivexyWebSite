'use server';

/**
 * Registrar, cancelar, e o cadastro rápido de cliente de dentro da venda.
 *
 * A venda é gravada por `erp_register_sale()` — uma função SECURITY INVOKER,
 * numa transação: venda, itens e pagamentos juntos, cada escrita pelo RLS. A
 * baixa de estoque e a conta a receber nascem por gatilho, no módulo de cada
 * uma. Antes de chamar, esta ação refaz as contas com o preço do cadastro —
 * não para garantir (o banco refaz de novo), mas para a recusa sair em reais
 * e no campo certo, e não em centavos numa frase do banco.
 */

import {
  type ProductUnit,
  checkDocument,
  checkQuantity,
  formatCents,
  isProductUnit,
  saleTotals,
} from '@tivexy/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { parseSaleInput } from '@/lib/erp/sale-input';
import { campo, isUuid, opcional } from '@/lib/ids';
import { currentSettings } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';

import {
  ACAO_INICIAL,
  type AcaoState,
  CLIENTE_INICIAL,
  type ClienteRapidoState,
  VENDA_INICIAL,
  type VendaFormState,
} from './state';

const ROTA = '/erp/vendas';

function revalidarTudo(id?: string) {
  revalidatePath(ROTA);
  if (id !== undefined) revalidatePath(`${ROTA}/${id}`);
  revalidatePath('/erp/estoque');
  revalidatePath('/erp/produtos');
  revalidatePath('/erp/financeiro');
  revalidatePath('/painel');
}

export async function registrarVenda(
  _anterior: VendaFormState,
  form: FormData,
): Promise<VendaFormState> {
  const { choice } = await requireAccess(`${ROTA}/nova`);
  if (choice.kind !== 'resolved') return { ...VENDA_INICIAL, erro: 'Escolha uma empresa.' };
  const tenantId = choice.tenant.id;

  const conferido = parseSaleInput(form);
  if (!conferido.ok) return { ...VENDA_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const ids = [...new Set(v.itens.map((i) => i.produtoId))];
  const { data: produtos } = await supabase
    .from('erp_products')
    .select('id, name, unit, price_cents, active')
    .eq('tenant_id', tenantId)
    .in('id', ids);

  const porId = new Map((produtos ?? []).map((p) => [String(p.id), p]));
  const linhas: { quantidade: number; precoCentavos: number }[] = [];
  for (const item of v.itens) {
    const p = porId.get(item.produtoId);
    if (p === undefined) {
      return {
        ...VENDA_INICIAL,
        campos: { itens: 'Um dos itens saiu do cadastro. Recarregue a página.' },
      };
    }
    if (p.active !== true) {
      return {
        ...VENDA_INICIAL,
        campos: { itens: `"${String(p.name)}" saiu de venda. Tire da lista.` },
      };
    }
    const unidade: ProductUnit = isProductUnit(p.unit) ? p.unit : 'un';
    const problema = checkQuantity(item.quantidade, unidade);
    if (problema !== null) {
      return { ...VENDA_INICIAL, campos: { itens: `"${String(p.name)}": ${problema}.` } };
    }
    linhas.push({ quantidade: item.quantidade, precoCentavos: Number(p.price_cents) });
  }

  const { subtotal, total } = saleTotals(linhas, v.descontoCentavos);
  if (v.descontoCentavos > subtotal) {
    return {
      ...VENDA_INICIAL,
      campos: { desconto: `O desconto passa do valor dos itens, ${formatCents(subtotal)}.` },
    };
  }

  const pago = v.pagamentos.reduce((soma, p) => soma + p.centavos, 0);
  if (pago !== total) {
    return {
      ...VENDA_INICIAL,
      campos: {
        pagamentos:
          pago < total
            ? `Faltam ${formatCents(total - pago)} para fechar ${formatCents(total)}.`
            : `Os pagamentos passam ${formatCents(pago - total)} do total, ${formatCents(total)}.`,
      },
    };
  }

  const ajustes = await currentSettings();
  if (ajustes['erp.sales_requires_customer'] === true && v.clienteId === null) {
    return {
      ...VENDA_INICIAL,
      campos: { cliente: 'Escolha quem comprou — esta empresa exige identificar.' },
    };
  }

  const { data, error } = await supabase.rpc('erp_register_sale', {
    p_tenant_id: tenantId,
    p_items: v.itens.map((i) => ({ product_id: i.produtoId, quantity: i.quantidade })),
    p_payments: v.pagamentos.map((p) => ({
      payment_method_id: p.formaId,
      amount_cents: p.centavos,
    })),
    p_customer_id: v.clienteId,
    p_discount_cents: v.descontoCentavos,
    p_notes: v.observacao,
  });

  if (error !== null) return { ...VENDA_INICIAL, erro: dbErrorMessage(error) };

  const venda = data as { id?: unknown } | null;
  const id = typeof venda?.id === 'string' ? venda.id : null;
  revalidarTudo(id ?? undefined);
  redirect(id === null ? ROTA : `${ROTA}/${id}?registrada=1`);
}

/**
 * Cancelar é `erp.sales.cancel` — permissão própria. `erp_cancel_sale()` dá
 * a mensagem; quem garante é a política de `update` da tabela. O que o
 * cancelamento desfaz fora da venda é dos gatilhos de estoque e financeiro.
 */
export async function cancelarVenda(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ACAO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = campo(form, 'id');
  if (!isUuid(id)) return { ...ACAO_INICIAL, erro: 'Não encontrei esta venda.' };
  const motivo = campo(form, 'motivo');
  if (motivo === '') return { ...ACAO_INICIAL, erro: 'Diga o motivo — ele fica na história.' };
  if (motivo.length > 300) return { ...ACAO_INICIAL, erro: 'No máximo 300 caracteres.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('erp_cancel_sale', { p_sale_id: id, p_reason: motivo });
  if (error !== null) return { ...ACAO_INICIAL, erro: dbErrorMessage(error) };

  revalidarTudo(id);
  return { ...ACAO_INICIAL, ok: 'Cancelada.' };
}

export async function criarClienteRapido(
  _a: ClienteRapidoState,
  form: FormData,
): Promise<ClienteRapidoState> {
  const { choice } = await requireAccess(`${ROTA}/nova`);
  if (choice.kind !== 'resolved') return { ...CLIENTE_INICIAL, erro: 'Escolha uma empresa.' };

  const nome = campo(form, 'nome');
  if (nome === '') return { ...CLIENTE_INICIAL, campos: { nome: 'Obrigatório.' } };
  if (nome.length > 160)
    return { ...CLIENTE_INICIAL, campos: { nome: 'No máximo 160 caracteres.' } };

  let documento: string | null = null;
  const bruto = opcional(form, 'documento');
  if (bruto !== null) {
    const conferido = checkDocument(bruto);
    if (!conferido.ok) return { ...CLIENTE_INICIAL, campos: { documento: conferido.error } };
    documento = conferido.value;
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_customers')
    .insert({ tenant_id: choice.tenant.id, name: nome, document: documento })
    .select('id, name')
    .single();

  if (error !== null) {
    return error.code === '23505'
      ? {
          ...CLIENTE_INICIAL,
          campos: { documento: 'Já há cadastro com este documento — procure na lista.' },
        }
      : { ...CLIENTE_INICIAL, erro: dbErrorMessage(error) };
  }

  revalidatePath(`${ROTA}/nova`);
  return { ...CLIENTE_INICIAL, cliente: { id: String(data.id), nome: String(data.name) } };
}
