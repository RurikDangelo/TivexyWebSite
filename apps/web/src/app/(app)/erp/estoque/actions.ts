'use server';

/**
 * Registrar entrada, saída e contagem.
 *
 * O produto é lido do banco antes de conferir o formulário: a unidade dele
 * decide se 1,5 é quantidade ou erro, e ele precisa controlar estoque. Quem
 * garante as duas coisas de novo é o gatilho do banco; a leitura aqui é para
 * a mensagem sair no campo certo.
 *
 * Na contagem a diferença é do banco: grava-se o contado, e o gatilho calcula
 * contra o saldo daquele instante, com a linha presa.
 */

import { type InventoryMovementKind, formatQuantity, isProductUnit } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { MOVIMENTO } from '@/lib/erp/labels';
import { parseMovementInput } from '@/lib/erp/movement-input';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { MOVIMENTO_INICIAL, type MovimentoFormState } from './state';

const ROTA = '/erp/estoque';

export async function registrarMovimento(
  anterior: MovimentoFormState,
  form: FormData,
): Promise<MovimentoFormState> {
  const falha = { ...MOVIMENTO_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };
  const tenantId = choice.tenant.id;

  const produtoId = campo(form, 'produto');
  if (!isUuid(produtoId)) return { ...falha, campos: { produto: 'Escolha da lista.' } };

  const supabase = await supabaseServer();
  const { data: produto } = await supabase
    .from('erp_products')
    .select('id, name, unit, track_stock')
    .eq('id', produtoId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (produto === null) return { ...falha, campos: { produto: 'Não encontrei este cadastro.' } };
  if (produto.track_stock !== true) {
    return {
      ...falha,
      campos: { produto: 'Este cadastro não controla estoque — ligue na página dele.' },
    };
  }

  const unidade = isProductUnit(produto.unit) ? produto.unit : 'un';
  const conferido = parseMovementInput(form, unidade);
  if (!conferido.ok) return { ...falha, campos: conferido.campos };
  const v = conferido.valor;

  const { error } = await supabase.from('inventory_movements').insert({
    tenant_id: tenantId,
    product_id: v.produtoId,
    kind: v.tipo satisfies InventoryMovementKind,
    quantity: v.quantidade,
    counted_quantity: v.contada,
    unit_cost_cents: v.custoCentavos,
    reason: v.motivo,
  });

  if (error !== null) {
    return {
      ...falha,
      erro:
        error.code === '42501'
          ? 'Registrar movimentação é de quem cuida do estoque.'
          : dbErrorMessage(error),
    };
  }

  // O saldo depois, para quem registrou conferir. Quem não pode ver saldo
  // recebe a confirmação sem o número.
  const { data: saldo } = await supabase
    .from('inventory_stock_levels')
    .select('quantity')
    .eq('tenant_id', tenantId)
    .eq('product_id', v.produtoId)
    .maybeSingle();

  const nome = String(produto.name);
  const oque =
    v.tipo === 'adjustment'
      ? `Contagem de ${nome}: ${formatQuantity(v.contada ?? 0, unidade)}`
      : `${MOVIMENTO[v.tipo]} de ${formatQuantity(Math.abs(v.quantidade), unidade)} em ${nome}`;
  const depois =
    saldo === null ? '' : ` Saldo agora: ${formatQuantity(Number(saldo.quantity), unidade)}.`;

  revalidatePath(ROTA);
  revalidatePath(`/erp/produtos/${v.produtoId}`);
  revalidatePath('/erp/produtos');
  return { ...MOVIMENTO_INICIAL, ok: `${oque}.${depois}`, rodada: anterior.rodada + 1 };
}
