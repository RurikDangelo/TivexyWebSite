'use server';

/**
 * As escritas das configurações.
 *
 * Três permissões diferentes, e cada formulário respeita a sua:
 *
 *   dados da empresa     core.tenant.write    (política de `tenants`)
 *   preferências         core.settings.write  (`update_tenant_settings()`)
 *   tipos de atividade   crm.activities.write (política da tabela)
 *
 * A conferência aqui é para a mensagem; quem garante é o banco.
 */

import { type ModuleCode, TENANT_SETTINGS, can, checkDocument, overridesFrom } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid, opcional } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { CONFIG_INICIAL, type ConfigState } from './state';

const ROTA = '/configuracoes';

const falha = (erro: string, campos: Record<string, string> = {}): ConfigState => ({
  erro,
  campos,
  ok: null,
});

function pronto(ok: string): ConfigState {
  /* Fuso e nome da empresa aparecem em toda tela. */
  revalidatePath('/', 'layout');
  return { ...CONFIG_INICIAL, ok };
}

export async function salvarEmpresa(_a: ConfigState, form: FormData): Promise<ConfigState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');
  if (!can(viewer, 'core.tenant.write')) {
    return falha('Só quem administra a conta muda os dados da empresa.');
  }

  const campos: Record<string, string> = {};
  const nome = campo(form, 'nome');
  if (nome === '') campos.nome = 'Obrigatório.';
  const razaoSocial = opcional(form, 'razaoSocial');

  let documento: string | null = null;
  const docBruto = opcional(form, 'documento');
  if (docBruto !== null) {
    const conferido = checkDocument(docBruto);
    if (conferido.ok) documento = conferido.value;
    else campos.documento = conferido.error;
  }
  if (Object.keys(campos).length > 0) return falha('', campos);

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('tenants')
    .update({ name: nome, legal_name: razaoSocial, document: documento })
    .eq('id', choice.tenant.id)
    .select('id');

  if (error !== null) return falha(dbErrorMessage(error));
  if (data.length === 0) return falha('Não foi possível salvar: sem permissão.');
  return pronto('Dados da empresa salvos.');
}

/**
 * As preferências: só as dos módulos habilitados, e só a diferença do padrão.
 *
 * Caixa de seleção desmarcada não vem no formulário — ausência é `false`. Por
 * isso toda configuração booleana dos módulos habilitados é lida, marcada ou
 * não: o formulário desenha todas.
 */
export async function salvarPreferencias(_a: ConfigState, form: FormData): Promise<ConfigState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');
  if (!can(viewer, 'core.settings.write')) {
    return falha('Você pode ver as configurações, mas não mudar.');
  }

  const modulos = [...viewer.enabledModules] as ModuleCode[];
  const valores: Record<string, unknown> = {};
  for (const def of TENANT_SETTINGS) {
    if (!viewer.enabledModules.has(def.module)) continue;
    if (def.type === 'boolean') valores[def.key] = form.get(def.key) === 'on';
    else if (def.type === 'number') valores[def.key] = Number(campo(form, def.key));
    else valores[def.key] = campo(form, def.key);
  }

  const supabase = await supabaseServer();
  const { data: atual } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', choice.tenant.id)
    .maybeSingle();
  const anteriores =
    atual?.settings !== null &&
    typeof atual?.settings === 'object' &&
    !Array.isArray(atual.settings)
      ? (atual.settings as Record<string, unknown>)
      : {};

  const r = overridesFrom(anteriores, valores, modulos);
  if (!r.ok) return falha('Revise os campos marcados.', r.problems);

  const { error } = await supabase.rpc('update_tenant_settings', {
    p_tenant_id: choice.tenant.id,
    p_settings: r.overrides,
  });
  if (error !== null) return falha(dbErrorMessage(error));
  return pronto('Preferências salvas.');
}

export async function criarTipo(_a: ConfigState, form: FormData): Promise<ConfigState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');

  const nome = campo(form, 'nome');
  if (nome === '') return falha('', { nome: 'Dê um nome ao tipo.' });

  const supabase = await supabaseServer();
  const { data: ultimos } = await supabase
    .from('crm_activity_types')
    .select('position')
    .eq('tenant_id', choice.tenant.id)
    .order('position', { ascending: false })
    .limit(1);
  const posicao = Number(ultimos?.[0]?.position ?? 0) + 1;

  const { error } = await supabase
    .from('crm_activity_types')
    .insert({ tenant_id: choice.tenant.id, name: nome, position: posicao });
  if (error !== null) return falha(dbErrorMessage(error, 'Já existe um tipo com esse nome.'));
  return pronto(`${nome} entrou na lista.`);
}

export async function renomearTipo(_a: ConfigState, form: FormData): Promise<ConfigState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');

  const id = campo(form, 'id');
  const nome = campo(form, 'nome');
  if (!isUuid(id)) return falha('Tipo não encontrado.');
  if (nome === '') return falha('O nome não pode ficar em branco.');

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('crm_activity_types')
    .update({ name: nome })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return falha(dbErrorMessage(error, 'Já existe um tipo com esse nome.'));
  if (data.length === 0) return falha('Não foi possível salvar: sem permissão.');
  return pronto('Nome salvo.');
}

/**
 * Excluir um tipo não apaga atividade nenhuma: a chave é `on delete set null`,
 * e as atividades dele ficam "sem tipo". A confirmação diz isso.
 */
export async function excluirTipo(_a: ConfigState, form: FormData): Promise<ConfigState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return falha('Escolha uma empresa.');

  const id = campo(form, 'id');
  if (!isUuid(id)) return falha('Tipo não encontrado.');

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('crm_activity_types')
    .delete()
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');
  if (error !== null) return falha(dbErrorMessage(error));
  if (data.length === 0) return falha('Não foi possível excluir: sem permissão.');
  return pronto('Tipo excluído.');
}
