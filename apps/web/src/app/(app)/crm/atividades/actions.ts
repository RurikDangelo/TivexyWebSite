'use server';

/**
 * As escritas da agenda.
 *
 * `requireAccess()` de novo aqui dentro, e o tenant da sessão. O fuso vem das
 * configurações do tenant, lido no servidor: a hora digitada é a da parede de
 * quem usa o sistema, e é o fuso da empresa que a converte.
 */

import { can } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { parseActivityInput } from '@/lib/crm/activity-input';
import { dbErrorMessage } from '@/lib/db-errors';
import { isUuid } from '@/lib/ids';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';

import { ATIVIDADE_INICIAL, type AtividadeFormState, type ConcluirResultado } from './state';

const ROTA = '/crm/atividades';

/** A agenda aparece também nas páginas de pessoa, conta e oportunidade. */
function revalidarCrm() {
  revalidatePath('/crm', 'layout');
}

export async function criarAtividade(
  _anterior: AtividadeFormState,
  form: FormData,
): Promise<AtividadeFormState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ATIVIDADE_INICIAL, erro: 'Escolha uma empresa.' };

  const conferido = parseActivityInput(form, await tenantTimeZone());
  if (!conferido.ok) return { ...ATIVIDADE_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { error } = await supabase.from('crm_activities').insert({
    tenant_id: choice.tenant.id,
    type_id: v.tipoId,
    subject: v.assunto,
    notes: v.notas,
    due_at: v.venceEm,
    owner_id: v.responsavelId ?? viewer.userId,
    [v.alvo.coluna]: v.alvo.id,
  });

  if (error !== null) {
    /*
     * 23503 aqui é o alvo que não é deste tenant — ou que sumiu. A chave
     * composta recusa; a mensagem diz o que a pessoa pode fazer.
     */
    return error.code === '23503'
      ? { ...ATIVIDADE_INICIAL, campos: { alvo: 'Este registro não existe mais. Escolha outro.' } }
      : { ...ATIVIDADE_INICIAL, erro: dbErrorMessage(error) };
  }

  revalidarCrm();
  return { ...ATIVIDADE_INICIAL, salvo: v.assunto };
}

/**
 * Marca como feita, ou reabre.
 *
 * O estado de origem vai no `where`: dois cliques não carimbam duas horas, e
 * reabrir o que já estava aberto não faz nada. A hora é `now()` do servidor,
 * não do navegador — o relógio de quem clica pode estar errado.
 */
export async function concluirAtividade(id: string, feita: boolean): Promise<ConcluirResultado> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa.' };
  if (!isUuid(id)) return { erro: 'Atividade não encontrada.' };
  if (!can(viewer, 'crm.activities.write')) {
    return { erro: 'Você pode ver a agenda, mas não mudar nada nela.' };
  }

  const supabase = await supabaseServer();
  const consulta = supabase
    .from('crm_activities')
    .update({ done_at: feita ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id);
  const { error } = await (feita
    ? consulta.is('done_at', null)
    : consulta.not('done_at', 'is', null));

  revalidarCrm();
  return { erro: error === null ? null : dbErrorMessage(error) };
}
