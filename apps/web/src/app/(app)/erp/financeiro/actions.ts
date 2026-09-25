'use server';

/**
 * As escritas do financeiro: lançar, dar baixa, desfazer, cancelar.
 *
 * A permissão é por direção — `finance.receivables.write` ou
 * `finance.payables.write` —, e quem garante é o RLS. O lançamento que nasceu
 * de uma venda segue a venda: o gatilho do banco só deixa registrar a baixa,
 * e as mensagens dele ("este lançamento veio da venda nº 12…") chegam à tela.
 */

import { isIsoDate, todayIn } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { parseFinanceEntryInput } from '@/lib/erp/finance-input';
import { campo, isUuid } from '@/lib/ids';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';

import {
  ACAO_INICIAL,
  type AcaoState,
  LANCAMENTO_INICIAL,
  type LancamentoFormState,
} from './state';

const ROTA = '/erp/financeiro';

function revalidar() {
  revalidatePath(ROTA);
  revalidatePath('/painel');
}

const SEM_PERMISSAO = 'Sem permissão para isso aqui — é de quem cuida do financeiro.';

export async function criarLancamento(
  anterior: LancamentoFormState,
  form: FormData,
): Promise<LancamentoFormState> {
  const falha = { ...LANCAMENTO_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };

  const hoje = todayIn(await tenantTimeZone());
  const conferido = parseFinanceEntryInput(form, hoje);
  if (!conferido.ok) return { ...falha, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { error } = await supabase.from('finance_entries').insert({
    tenant_id: choice.tenant.id,
    direction: v.direcao,
    description: v.descricao,
    amount_cents: v.valorCentavos,
    due_date: v.vencimento,
    paid_on: v.pagoEm,
    counterparty: v.contraparte,
    category: v.categoria,
    notes: v.observacao,
  });

  if (error !== null) {
    return {
      ...falha,
      erro: error.code === '42501' ? SEM_PERMISSAO : dbErrorMessage(error),
    };
  }
  revalidar();
  return {
    ...LANCAMENTO_INICIAL,
    ok: `Lançamento feito: ${v.descricao}.`,
    rodada: anterior.rodada + 1,
  };
}

async function atualizar(
  form: FormData,
  mudanca: Record<string, unknown>,
  ok: string,
): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ACAO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = campo(form, 'id');
  if (!isUuid(id)) return { ...ACAO_INICIAL, erro: 'Não encontrei este lançamento.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('finance_entries')
    .update(mudanca)
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) return { ...ACAO_INICIAL, erro: dbErrorMessage(error) };
  if (data.length === 0) return { ...ACAO_INICIAL, erro: SEM_PERMISSAO };
  revalidar();
  return { ...ACAO_INICIAL, ok };
}

/** O dinheiro se moveu: registra o dia. Hoje por padrão; nunca no futuro. */
export async function darBaixa(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const dia = campo(form, 'pagoEm');
  const hoje = todayIn(await tenantTimeZone());
  if (!isIsoDate(dia)) return { ...ACAO_INICIAL, erro: 'Em que dia o dinheiro se moveu?' };
  if (dia > hoje) {
    return { ...ACAO_INICIAL, erro: 'Pagamento é o que já aconteceu: a data não pode ser futura.' };
  }
  return atualizar(form, { paid_on: dia }, 'Baixa registrada.');
}

/** Registrou por engano: volta a ficar em aberto. */
export async function desfazerBaixa(_a: AcaoState, form: FormData): Promise<AcaoState> {
  return atualizar(form, { paid_on: null }, 'Voltou a ficar em aberto.');
}

/**
 * Lançamento errado não se apaga — cancela-se, com motivo. O da venda o banco
 * recusa, e diz para cancelar a venda.
 */
export async function cancelarLancamento(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const motivo = campo(form, 'motivo');
  if (motivo === '') return { ...ACAO_INICIAL, erro: 'Diga o motivo — ele fica na história.' };
  if (motivo.length > 300) return { ...ACAO_INICIAL, erro: 'No máximo 300 caracteres.' };
  return atualizar(
    form,
    { cancelled_at: new Date().toISOString(), cancel_reason: motivo },
    'Cancelado.',
  );
}
