'use server';

/**
 * O lançamento de movimento de estoque.
 *
 * ## A tela nunca escreve o saldo
 *
 * `erp_stock_balances` é mantido por gatilho a partir do razão, e o
 * privilégio de escrita foi revogado de `authenticated` — quem tentasse
 * receberia "permission denied", não "nenhuma linha afetada". Aqui se escreve
 * **movimento**; o saldo é consequência.
 *
 * Não é preciosismo: uma coluna de saldo que a aplicação pudesse acertar
 * passaria a discordar do que de fato entrou e saiu no primeiro acerto
 * manual, sem erro nenhum, e o sintoma seria o inventário não fechar meses
 * depois.
 *
 * ## Corrigir é lançar ajuste
 *
 * O razão é append-only, com gatilho recusando `update` e `delete`. Um erro de
 * digitação se conserta lançando o ajuste contrário — que fica no histórico,
 * que é justamente o que se quer poder auditar depois.
 */

import { ERP_MOVEMENT_KINDS, type ErpMovementKind, parseQuantity } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { MOVIMENTO_INICIAL, type MovimentoFormState } from './state.ts';

const ROTA = '/erp/estoque';

function ehTipo(valor: string): valor is ErpMovementKind {
  return (ERP_MOVEMENT_KINDS as readonly string[]).includes(valor);
}

export async function lancarMovimento(
  _anterior: MovimentoFormState,
  form: FormData,
): Promise<MovimentoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...MOVIMENTO_INICIAL, erro: 'Escolha uma empresa antes de lançar.' };
  }

  const campos: Record<string, string> = {};

  const produtoId = texto(form, 'product_id');
  if (produtoId === '') campos.product_id = 'Escolha o produto.';

  const tipo = texto(form, 'kind');
  if (!ehTipo(tipo)) campos.kind = 'Escolha o tipo do movimento.';

  /*
   * A quantidade é sempre positiva — há constraint provando. O sinal vem do
   * tipo: quantidade negativa com tipo `in` seria uma saída disfarçada de
   * entrada, e nenhuma soma perceberia.
   */
  const quantidade = parseQuantity(texto(form, 'quantity'));
  if (quantidade === null) campos.quantity = 'Use 1,5 — e maior que zero.';

  if (Object.keys(campos).length > 0) {
    return { ...MOVIMENTO_INICIAL, campos: campos as MovimentoFormState['campos'] };
  }

  const supabase = await supabaseServer();

  /*
   * O produto precisa ser deste tenant **e** controlar estoque. A chave
   * composta já recusaria o primeiro; o segundo não tem constraint, e sem
   * esta conferência um serviço ganharia saldo — exatamente o que
   * `track_stock` existe para impedir.
   */
  const { data: produto } = await supabase
    .from('erp_products')
    .select('id, name, track_stock')
    .eq('id', produtoId)
    .eq('tenant_id', choice.tenant.id)
    .maybeSingle();

  if (produto === null) {
    return { ...MOVIMENTO_INICIAL, campos: { product_id: 'Esse produto não está na sua lista.' } };
  }
  if (produto.track_stock !== true) {
    return {
      ...MOVIMENTO_INICIAL,
      campos: { product_id: 'Serviço não tem estoque para movimentar.' },
    };
  }

  const { error } = await supabase.from('erp_stock_movements').insert({
    tenant_id: choice.tenant.id,
    product_id: produtoId,
    kind: tipo,
    quantity: quantidade,
    reason: opcional(form, 'reason'),
  });

  if (error !== null) {
    return {
      ...MOVIMENTO_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para movimentar estoque aqui.'),
    };
  }

  revalidatePath(ROTA);
  revalidatePath('/erp/produtos');
  return { ...MOVIMENTO_INICIAL, criado: String(produto.name) };
}
