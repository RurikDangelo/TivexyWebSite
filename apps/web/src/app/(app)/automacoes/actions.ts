'use server';

/**
 * As escritas de automação. Pedem `automation.rules.write` — e, para uma
 * regra que cria atividade no CRM, também `crm.activities.write`: quem
 * escreve a regra precisa poder fazer o que ela faz. As duas conferências
 * estão na política da tabela; as daqui só dão a mensagem certa antes.
 */

import { type Viewer, can } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { parseRuleForm } from '@/lib/automation/rule-input';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { ACAO_INICIAL, type AcaoState, REGRA_INICIAL, type RegraState } from './state';

const ROTA = '/automacoes';
const SEM_ESCRITA = 'Você vê as automações desta empresa, mas não cria nem muda.';
const SEM_ATIVIDADE = 'Criar atividade por automação pede a permissão de criar atividade no CRM.';

function podeEscrever(viewer: Viewer, acao: string): string | null {
  if (!can(viewer, 'automation.rules.write')) return SEM_ESCRITA;
  if (acao === 'crm.activity.create' && !can(viewer, 'crm.activities.write')) return SEM_ATIVIDADE;
  return null;
}

export async function criarRegra(anterior: RegraState, form: FormData): Promise<RegraState> {
  const falha = { ...REGRA_INICIAL, rodada: anterior.rodada };
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };

  const conferido = parseRuleForm(form);
  if (!conferido.ok) return { ...falha, problemas: conferido.problemas };
  const r = conferido.regra;
  const negado = podeEscrever(viewer, r.acao);
  if (negado !== null) return { ...falha, erro: negado };

  const supabase = await supabaseServer();
  const { error } = await supabase.from('automation_rules').insert({
    tenant_id: choice.tenant.id,
    name: r.nome,
    trigger: r.gatilho,
    conditions: r.condicoes,
    action: r.acao,
    action_params: r.params,
    active: true,
  });
  if (error !== null) {
    return { ...falha, erro: error.code === '42501' ? SEM_ESCRITA : dbErrorMessage(error) };
  }
  revalidatePath(ROTA);
  return {
    ...REGRA_INICIAL,
    ok: `Em vigor: ${r.nome}. Vale para os próximos eventos — não para os que já passaram.`,
    rodada: anterior.rodada + 1,
  };
}

export async function salvarRegra(anterior: RegraState, form: FormData): Promise<RegraState> {
  const falha = { ...REGRA_INICIAL, rodada: anterior.rodada };
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: 'Escolha uma empresa.' };

  const id = campo(form, 'id');
  if (!isUuid(id)) return { ...falha, erro: 'Não encontrei esta automação.' };
  const conferido = parseRuleForm(form);
  if (!conferido.ok) return { ...falha, problemas: conferido.problemas };
  const r = conferido.regra;
  const negado = podeEscrever(viewer, r.acao);
  if (negado !== null) return { ...falha, erro: negado };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('automation_rules')
    .update({
      name: r.nome,
      trigger: r.gatilho,
      conditions: r.condicoes,
      action: r.acao,
      action_params: r.params,
    })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) {
    return { ...falha, erro: error.code === '42501' ? SEM_ESCRITA : dbErrorMessage(error) };
  }
  if (data.length === 0) return { ...falha, erro: 'Não foi possível salvar. ' + SEM_ESCRITA };
  revalidatePath(ROTA);
  return { ...REGRA_INICIAL, ok: 'Salvo.', rodada: anterior.rodada + 1 };
}

/** Ligar ou desligar — chamada direto do interruptor, sem formulário. */
export async function alternarRegra(id: string, ativa: boolean): Promise<AcaoState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa.' };
  if (!isUuid(id)) return { erro: 'Não encontrei esta automação.' };
  if (!can(viewer, 'automation.rules.write')) return { erro: SEM_ESCRITA };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('automation_rules')
    .update({ active: ativa })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return { erro: dbErrorMessage(error) };
  /*
   * Zero linhas com permissão de escrever: a regra cria atividade e quem
   * desliga não pode criar atividade — a política pede as duas, até para
   * desligar. Dizer isso é melhor que um "não foi possível" sem motivo.
   */
  if (data.length === 0) return { erro: `${SEM_ATIVIDADE} Peça a quem tem.` };
  revalidatePath(ROTA);
  return ACAO_INICIAL;
}

export async function excluirRegra(_anterior: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa.' };
  const id = campo(form, 'id');
  if (!isUuid(id)) return { erro: 'Não encontrei esta automação.' };
  if (!can(viewer, 'automation.rules.write')) return { erro: SEM_ESCRITA };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return { erro: dbErrorMessage(error) };
  if (data.length === 0) return { erro: 'Não foi possível excluir. ' + SEM_ESCRITA };
  revalidatePath(ROTA);
  return ACAO_INICIAL;
}
