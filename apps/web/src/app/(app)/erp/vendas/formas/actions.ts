'use server';

/**
 * As escritas de forma de pagamento. Pedem `core.settings.write` — a política
 * da tabela: o prazo decide quando a venda vira dinheiro, e isso não é
 * decisão de balcão. Forma usada em venda não se apaga (a chave estrangeira
 * recusa); desliga-se, e ela sai do balcão.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { parsePaymentMethodInput } from '@/lib/erp/payment-method-input';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { FORMA_INICIAL, type FormaState } from './state';

const ROTA = '/erp/vendas/formas';
const REPETIDA = 'Já existe uma forma com esse nome.';

function pronto(anterior: FormaState, ok: string): FormaState {
  revalidatePath(ROTA);
  revalidatePath('/erp/vendas/nova');
  return { ...FORMA_INICIAL, ok, rodada: anterior.rodada + 1 };
}

export async function criarForma(anterior: FormaState, form: FormData): Promise<FormaState> {
  const falha = { ...FORMA_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };

  const conferido = parsePaymentMethodInput(form);
  if (!conferido.ok) return { ...falha, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { data: ultimas } = await supabase
    .from('erp_payment_methods')
    .select('position')
    .eq('tenant_id', choice.tenant.id)
    .order('position', { ascending: false })
    .limit(1);

  const { error } = await supabase.from('erp_payment_methods').insert({
    tenant_id: choice.tenant.id,
    name: v.nome,
    code: v.codigo,
    settlement_days: v.prazoEmDias,
    active: true,
    position: Number(ultimas?.[0]?.position ?? 0) + 1,
  });
  if (error !== null) {
    return {
      ...falha,
      erro:
        error.code === '42501'
          ? 'Só quem administra a empresa cadastra forma de pagamento.'
          : dbErrorMessage(error, REPETIDA),
    };
  }
  return pronto(anterior, `${v.nome} entrou no balcão.`);
}

export async function salvarForma(anterior: FormaState, form: FormData): Promise<FormaState> {
  const falha = { ...FORMA_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };

  const id = campo(form, 'id');
  if (!isUuid(id)) return { ...falha, erro: 'Não encontrei esta forma.' };
  const conferido = parsePaymentMethodInput(form);
  if (!conferido.ok) return { ...falha, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_payment_methods')
    .update({ name: v.nome, code: v.codigo, settlement_days: v.prazoEmDias, active: v.ativa })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return { ...falha, erro: dbErrorMessage(error, REPETIDA) };
  if (data.length === 0) {
    return { ...falha, erro: 'Não foi possível salvar: só quem administra a empresa muda isto.' };
  }
  return pronto(anterior, v.ativa ? 'Salvo.' : 'Salvo — fora do balcão.');
}
