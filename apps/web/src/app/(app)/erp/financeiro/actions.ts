'use server';

/**
 * As escritas do financeiro.
 *
 * ⚠️ **Registro, não movimentação de dinheiro.** Nada aqui gera boleto, cobra
 * cartão ou fala com banco. "Marcar como pago" quer dizer que alguém anotou
 * que a conta foi paga — apresentar isso como recebimento ou pagamento de
 * verdade é o que o `CLAUDE.md` proíbe, e é proibido porque tem consequência
 * legal, não estética.
 *
 * Mesmas duas regras do resto do sistema: `requireAccess()` roda aqui dentro
 * porque Server Action é endpoint, e o tenant vem da sessão.
 */

import { FINANCE_ENTRY_KINDS, type FinanceEntryKind, parseCents } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { LANCAMENTO_INICIAL, type LancamentoFormState } from './state.ts';

const ROTA = '/erp/financeiro';

/** `YYYY-MM-DD`, que é o que `<input type="date">` manda e a coluna aceita. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function ehTipo(valor: string): valor is FinanceEntryKind {
  return (FINANCE_ENTRY_KINDS as readonly string[]).includes(valor);
}

export async function criarLancamento(
  _anterior: LancamentoFormState,
  form: FormData,
): Promise<LancamentoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...LANCAMENTO_INICIAL, erro: 'Escolha uma empresa antes de lançar.' };
  }

  const campos: Record<string, string> = {};

  const descricao = texto(form, 'description');
  if (descricao === '') campos.description = 'Obrigatório — é o que vai aparecer na lista.';

  /*
   * Valor **maior que zero**, não "em branco vale zero". Aqui é diferente do
   * preço de um produto: lançamento de R$ 0,00 não é conta nenhuma, e a
   * constraint do banco recusa.
   */
  const valor = parseCents(texto(form, 'amount_cents'));
  if (valor === null || valor <= 0) campos.amount_cents = 'Informe um valor maior que zero.';

  /*
   * A data é `YYYY-MM-DD` e vai direto para uma coluna `date` — sem passar
   * por fuso. "Vence dia 10" é um dia no calendário, e convertê-lo para
   * instante faria o vencimento mudar de dia conforme quem olha.
   */
  const vencimento = texto(form, 'due_date');
  if (!DATA_ISO.test(vencimento)) campos.due_date = 'Escolha o vencimento.';

  if (Object.keys(campos).length > 0) {
    return { ...LANCAMENTO_INICIAL, campos: campos as LancamentoFormState['campos'] };
  }

  const tipo = texto(form, 'kind');
  if (!ehTipo(tipo)) return { ...LANCAMENTO_INICIAL, erro: 'Escolha se é a pagar ou a receber.' };

  const supabase = await supabaseServer();

  const { error } = await supabase.from('finance_entries').insert({
    tenant_id: choice.tenant.id,
    kind: tipo,
    description: descricao,
    amount_cents: valor,
    due_date: vencimento,
    company_id: opcional(form, 'company_id'),
  });

  if (error !== null) {
    return {
      ...LANCAMENTO_INICIAL,
      /*
       * A política separa por `kind`: quem cuida de contas a pagar pode não
       * ter permissão de escrever recebimento. A mensagem diz qual dos dois,
       * porque "sem permissão" genérico manda a pessoa ao suporte sem saber o
       * que pedir.
       */
      erro: mensagemDeErro(
        error,
        tipo === 'payable'
          ? 'Você não tem permissão para lançar contas a pagar.'
          : 'Você não tem permissão para lançar contas a receber.',
      ),
    };
  }

  revalidatePath(ROTA);
  return { ...LANCAMENTO_INICIAL, criado: descricao };
}

/**
 * Marca como pago, ou desmarca.
 *
 * O estado atual vem no formulário e entra no `where`: dois cliques rápidos
 * não alternam duas vezes, e uma aba velha não desfaz o que alguém acabou de
 * marcar.
 */
export async function alternarPagamento(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  if (id === '') return;

  const estavaPago = texto(form, 'pago') === 'sim';

  const supabase = await supabaseServer();
  const consulta = supabase
    .from('finance_entries')
    .update({ paid_at: estavaPago ? null : new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id);

  await (estavaPago ? consulta.not('paid_at', 'is', null) : consulta.is('paid_at', null));

  revalidatePath(ROTA);
}
