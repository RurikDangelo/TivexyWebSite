'use server';

/**
 * As escritas de categoria. Pedem `erp.products.write` — a política da
 * tabela —, e a conferência aqui é só para a mensagem.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { ACAO_INICIAL, type AcaoState } from '../state';

const ROTA = '/erp/produtos';
const REPETIDA = 'Já existe uma categoria com esse nome.';

const falha = (erro: string): AcaoState => ({ ...ACAO_INICIAL, erro });

function pronto(ok: string): AcaoState {
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/categorias`);
  return { ...ACAO_INICIAL, ok };
}

function nomeConferido(form: FormData): string | AcaoState {
  const nome = campo(form, 'nome');
  if (nome === '') return falha('Dê um nome à categoria.');
  if (nome.length > 60) return falha('No máximo 60 caracteres.');
  return nome;
}

export async function criarCategoria(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');

  const nome = nomeConferido(form);
  if (typeof nome !== 'string') return nome;

  const supabase = await supabaseServer();
  const { data: ultimas } = await supabase
    .from('erp_product_categories')
    .select('position')
    .eq('tenant_id', choice.tenant.id)
    .order('position', { ascending: false })
    .limit(1);
  const posicao = Number(ultimas?.[0]?.position ?? 0) + 1;

  const { error } = await supabase
    .from('erp_product_categories')
    .insert({ tenant_id: choice.tenant.id, name: nome, position: posicao });
  if (error !== null) return falha(dbErrorMessage(error, REPETIDA));
  return pronto(`${nome} entrou na lista.`);
}

export async function renomearCategoria(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');

  const id = campo(form, 'id');
  if (!isUuid(id)) return falha('Categoria não encontrada.');
  const nome = nomeConferido(form);
  if (typeof nome !== 'string') return nome;

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_product_categories')
    .update({ name: nome })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return falha(dbErrorMessage(error, REPETIDA));
  if (data.length === 0) return falha('Não foi possível salvar: sem permissão.');
  return pronto('Nome salvo.');
}

/**
 * Apagar uma categoria não apaga produto nenhum: a chave é
 * `on delete set null (category_id)`, e os produtos dela ficam "sem
 * categoria". A confirmação diz quantos.
 */
export async function excluirCategoria(_a: AcaoState, form: FormData): Promise<AcaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');

  const id = campo(form, 'id');
  if (!isUuid(id)) return falha('Categoria não encontrada.');

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('erp_product_categories')
    .delete()
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return falha(dbErrorMessage(error));
  if (data.length === 0) return falha('Não foi possível apagar: sem permissão.');
  return pronto('Categoria apagada.');
}
