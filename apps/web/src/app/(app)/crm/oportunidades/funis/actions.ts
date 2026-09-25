'use server';

/**
 * As escritas do editor de funil.
 *
 * O banco segura o que importa — etapa com oportunidades não muda de tipo
 * nem de funil, e não sai (`on delete restrict`); funil novo nasce com ganho
 * e perda. O que fica aqui é o que o banco não sabe dizer bem: que remover a
 * última etapa de ganho deixaria o funil sem saída. `missingExits()` é a
 * mesma regra que o quadro usa para avisar.
 */

import { type CrmStageKind, CRM_STAGE_KINDS, can, missingExits } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import type { AcaoState } from './state';

const ROTA = '/crm/oportunidades';

async function podeMexer(): Promise<{ tenantId: string } | { erro: string }> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { erro: 'Escolha uma empresa.' };
  if (!can(viewer, 'crm.deals.write')) {
    return { erro: 'Só quem pode editar oportunidades muda o funil.' };
  }
  return { tenantId: choice.tenant.id };
}

function pronto(ok: string): AcaoState {
  revalidatePath(ROTA, 'layout');
  return { erro: null, ok };
}

const falha = (erro: string): AcaoState => ({ erro, ok: null });

export async function criarFunil(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const nome = campo(form, 'nome');
  if (nome === '') return falha('Dê um nome ao funil.');

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('crm_create_pipeline', {
    p_tenant_id: ctx.tenantId,
    p_name: nome,
  });
  if (error !== null) return falha(dbErrorMessage(error, 'Já existe um funil com esse nome.'));
  return pronto(`${nome} foi criado, com as etapas de ganho e perda.`);
}

export async function renomear(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const id = campo(form, 'id');
  const nome = campo(form, 'nome');
  const tabela = campo(form, 'alvo') === 'funil' ? 'crm_pipelines' : 'crm_pipeline_stages';
  if (!isUuid(id)) return falha('Não encontrei o que renomear.');
  if (nome === '') return falha('O nome não pode ficar em branco.');

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from(tabela)
    .update({ name: nome })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error !== null) return falha(dbErrorMessage(error, 'Já existe outro com esse nome.'));
  return pronto('Nome salvo.');
}

export async function tornarPadrao(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const id = campo(form, 'id');
  if (!isUuid(id)) return falha('Funil não encontrado.');

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('crm_set_default_pipeline', { p_pipeline_id: id });
  if (error !== null) return falha(dbErrorMessage(error));
  return pronto('É o funil que abre primeiro agora.');
}

export async function excluirFunil(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const id = campo(form, 'id');
  if (!isUuid(id)) return falha('Funil não encontrado.');

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('crm_pipelines')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error !== null) {
    return falha(
      error.code === '23503'
        ? `Esvazie o funil antes de excluir: ainda há ${termOf(await currentTerms(), 'crm.deals').plural} nele.`
        : dbErrorMessage(error),
    );
  }
  return pronto('Funil excluído.');
}

/** As etapas do funil de uma etapa, para as regras que olham o conjunto. */
async function etapasDoFunil(tenantId: string, pipelineId: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, kind, position')
    .eq('tenant_id', tenantId)
    .eq('pipeline_id', pipelineId)
    .order('position');
  return (data ?? []).map((e) => ({
    id: String(e.id),
    name: String(e.name),
    kind: e.kind as CrmStageKind,
    position: Number(e.position),
  }));
}

export async function criarEtapa(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const funil = campo(form, 'funil');
  const nome = campo(form, 'nome');
  const tipo = campo(form, 'tipo') as CrmStageKind;
  if (!isUuid(funil)) return falha('Funil não encontrado.');
  if (nome === '') return falha('Dê um nome à etapa.');
  if (!CRM_STAGE_KINDS.includes(tipo)) return falha('Escolha o tipo da etapa.');

  const etapas = await etapasDoFunil(ctx.tenantId, funil);
  const posicao = Math.max(0, ...etapas.map((e) => e.position)) + 1;

  const supabase = await supabaseServer();
  const { error } = await supabase.from('crm_pipeline_stages').insert({
    tenant_id: ctx.tenantId,
    pipeline_id: funil,
    name: nome,
    kind: tipo,
    position: posicao,
  });
  if (error !== null)
    return falha(dbErrorMessage(error, 'Este funil já tem uma etapa com esse nome.'));
  return pronto(`${nome} entrou no funil.`);
}

/**
 * Sobe ou desce uma etapa em andamento.
 *
 * Troca a posição com a vizinha do mesmo tipo: ganho e perda ficam sempre no
 * fim do quadro, então só a ordem das etapas em andamento é escolha de alguém.
 * São duas escritas sem transação — se a segunda falhar, duas etapas ficam com
 * a mesma posição, e `orderStages` desempata pelo nome. Nada se perde.
 */
export async function moverEtapa(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const id = campo(form, 'id');
  const funil = campo(form, 'funil');
  const direcao = campo(form, 'direcao') === 'cima' ? -1 : 1;
  if (!isUuid(id) || !isUuid(funil)) return falha('Etapa não encontrada.');

  const abertas = (await etapasDoFunil(ctx.tenantId, funil))
    .filter((e) => e.kind === 'open')
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'));
  const i = abertas.findIndex((e) => e.id === id);
  const vizinha = abertas[i + direcao];
  const esta = abertas[i];
  if (esta === undefined || vizinha === undefined) return { erro: null, ok: null };

  /* Posições iguais trocariam por nada: a de baixo ganha uma a mais. */
  const [pEsta, pVizinha] =
    esta.position === vizinha.position
      ? direcao < 0
        ? [vizinha.position, vizinha.position + 1]
        : [vizinha.position + 1, vizinha.position]
      : [vizinha.position, esta.position];

  const supabase = await supabaseServer();
  const a = await supabase
    .from('crm_pipeline_stages')
    .update({ position: pEsta })
    .eq('id', esta.id)
    .eq('tenant_id', ctx.tenantId);
  if (a.error !== null) return falha(dbErrorMessage(a.error));
  const b = await supabase
    .from('crm_pipeline_stages')
    .update({ position: pVizinha })
    .eq('id', vizinha.id)
    .eq('tenant_id', ctx.tenantId);
  if (b.error !== null) return falha(dbErrorMessage(b.error));

  return pronto(`${esta.name} mudou de lugar.`);
}

export async function mudarTipo(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const id = campo(form, 'id');
  const funil = campo(form, 'funil');
  const tipo = campo(form, 'tipo') as CrmStageKind;
  if (!isUuid(id) || !isUuid(funil)) return falha('Etapa não encontrada.');
  if (!CRM_STAGE_KINDS.includes(tipo)) return falha('Tipo inválido.');

  const etapas = await etapasDoFunil(ctx.tenantId, funil);
  const depois = etapas.map((e) => (e.id === id ? { ...e, kind: tipo } : e));
  const faltaria = missingExits(depois).filter((k) => !missingExits(etapas).includes(k));
  if (faltaria.length > 0) {
    return falha(
      faltaria.includes('won')
        ? 'É a única etapa de ganho: sem ela, nada no funil fecha como venda.'
        : 'É a única etapa de perda: sem ela, não há onde registrar quem não comprou.',
    );
  }

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('crm_pipeline_stages')
    .update({ kind: tipo })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error !== null) return falha(dbErrorMessage(error));
  return pronto('Tipo da etapa salvo.');
}

export async function excluirEtapa(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const ctx = await podeMexer();
  if ('erro' in ctx) return falha(ctx.erro);

  const id = campo(form, 'id');
  const funil = campo(form, 'funil');
  if (!isUuid(id) || !isUuid(funil)) return falha('Etapa não encontrada.');

  const etapas = await etapasDoFunil(ctx.tenantId, funil);
  const faltaria = missingExits(etapas.filter((e) => e.id !== id)).filter(
    (k) => !missingExits(etapas).includes(k),
  );
  if (faltaria.length > 0) {
    return falha(
      faltaria.includes('won')
        ? 'É a única etapa de ganho: sem ela, nada no funil fecha como venda.'
        : 'É a única etapa de perda: sem ela, não há onde registrar quem não comprou.',
    );
  }

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from('crm_pipeline_stages')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error !== null) {
    return falha(
      error.code === '23503'
        ? `Esvazie a etapa antes de excluir: ainda há ${termOf(await currentTerms(), 'crm.deals').plural} nela.`
        : dbErrorMessage(error),
    );
  }
  return pronto('Etapa excluída.');
}
