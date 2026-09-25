'use server';

/**
 * As escritas do funil.
 *
 * Nenhuma confia na tela. `requireAccess()` roda de novo aqui dentro —
 * Server Action é endpoint, e quem descobrir o identificador pode chamá-la
 * sem abrir a página. Abaixo disso, o RLS nega a escrita a quem não tem
 * `crm.deals.write`.
 *
 * O tenant vem da sessão, nunca do formulário: quem participa de duas empresas
 * tem permissão nas duas, e o RLS não escolhe em qual a linha cai.
 */

import { can } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { parseDealInput } from '@/lib/crm/deal-input';
import { dbErrorMessage } from '@/lib/db-errors';
import { isUuid } from '@/lib/ids';
import { requireAccess } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';

import { type MoverResultado, NEGOCIO_INICIAL, type NegocioFormState } from './state';

const ROTA = '/crm/oportunidades';

/** O funil de uma etapa deste tenant, ou `null`. A etapa decide o funil. */
async function funilDaEtapa(tenantId: string, etapaId: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('pipeline_id')
    .eq('id', etapaId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data === null ? null : String(data.pipeline_id);
}

export async function criarOportunidade(
  _anterior: NegocioFormState,
  form: FormData,
): Promise<NegocioFormState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...NEGOCIO_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const conferido = parseDealInput(form);
  if (!conferido.ok) return { ...NEGOCIO_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const funil = await funilDaEtapa(choice.tenant.id, v.etapaId);
  if (funil === null) return { ...NEGOCIO_INICIAL, campos: { etapa: 'Etapa não encontrada.' } };

  const supabase = await supabaseServer();
  const { error } = await supabase.from('crm_deals').insert({
    tenant_id: choice.tenant.id,
    pipeline_id: funil,
    stage_id: v.etapaId,
    title: v.titulo,
    value_cents: v.valorCentavos,
    company_id: v.contaId,
    contact_id: v.pessoaId,
    /* Sem responsável escolhido, quem cadastrou. Oportunidade sem dono é a que ninguém liga. */
    owner_id: v.responsavelId ?? viewer.userId,
    expected_close_date: v.previsao,
    notes: v.notas,
  });

  if (error !== null) return { ...NEGOCIO_INICIAL, erro: dbErrorMessage(error) };

  revalidatePath(ROTA);
  return { ...NEGOCIO_INICIAL, salvo: v.titulo };
}

export async function editarOportunidade(
  _anterior: NegocioFormState,
  form: FormData,
): Promise<NegocioFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...NEGOCIO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = form.get('id');
  if (!isUuid(id)) return { ...NEGOCIO_INICIAL, erro: 'Não encontrei este registro.' };

  const conferido = parseDealInput(form);
  if (!conferido.ok) return { ...NEGOCIO_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const funil = await funilDaEtapa(choice.tenant.id, v.etapaId);
  if (funil === null) return { ...NEGOCIO_INICIAL, campos: { etapa: 'Etapa não encontrada.' } };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('crm_deals')
    .update({
      pipeline_id: funil,
      stage_id: v.etapaId,
      title: v.titulo,
      value_cents: v.valorCentavos,
      company_id: v.contaId,
      contact_id: v.pessoaId,
      owner_id: v.responsavelId,
      expected_close_date: v.previsao,
      notes: v.notas,
    })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) return { ...NEGOCIO_INICIAL, erro: dbErrorMessage(error) };
  /* Zero linhas sem erro é o RLS negando em silêncio, ou o registro que sumiu. */
  if (data.length === 0) {
    return {
      ...NEGOCIO_INICIAL,
      erro: 'Não foi possível salvar: sem permissão, ou o registro não existe mais.',
    };
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ...NEGOCIO_INICIAL, salvo: v.titulo };
}

/**
 * Move a oportunidade de etapa — o arrastar do quadro e o menu "Mover para".
 *
 * A etapa de origem vai no `where`. Dois cliques rápidos, ou duas pessoas
 * arrastando o mesmo cartão, não aplicam o movimento duas vezes: o segundo
 * encontra a oportunidade fora da origem e não toca em nada.
 *
 * `closed_at` não é escrito aqui. Quem carimba e limpa é o gatilho
 * `sync_deal_closed_at`, que vale também para importação e para SQL.
 */
export async function moverOportunidade(
  id: string,
  de: string,
  para: string,
): Promise<MoverResultado> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa.' };
  if (!isUuid(id) || !isUuid(de) || !isUuid(para)) return { erro: 'Movimento inválido.' };
  if (de === para) return { erro: null };

  if (!can(viewer, 'crm.deals.write')) {
    return { erro: 'Você pode ver o funil, mas não mover nada nele.' };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('crm_deals')
    .update({ stage_id: para })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .eq('stage_id', de)
    .select('id');

  revalidatePath(ROTA);

  if (error !== null) return { erro: dbErrorMessage(error) };
  if (data.length === 0) {
    return { erro: 'O cartão mudou de lugar enquanto você olhava. O quadro foi atualizado.' };
  }
  return { erro: null };
}
