'use server';

/**
 * As decisões de plataforma sobre uma empresa: editar, suspender, reativar,
 * trocar o plano.
 *
 * `requireAccess('/admin')` de novo em cada ação — Server Action é endpoint,
 * e o layout não roda em chamada de ação. E, abaixo dela, cada função do
 * banco confere `is_super_admin()` por conta própria: a função é a porta, e
 * a conferência é a fechadura (20260925140000). Cada uma grava a auditoria na
 * mesma transação.
 */

import { revalidatePath } from 'next/cache';

import { parseTenantInput } from '@/lib/admin/tenant-input';
import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { CLIENTE_INICIAL, type ClienteState } from './state';

function nomes(lista: unknown, mapa: Readonly<Record<string, string>>): string {
  const codigos = Array.isArray(lista)
    ? lista.filter((c): c is string => typeof c === 'string')
    : [];
  return codigos.map((c) => mapa[c] ?? c).join(', ');
}

async function inicio(anterior: ClienteState, form: FormData) {
  await requireAccess('/admin');
  const falha = { ...CLIENTE_INICIAL, rodada: anterior.rodada };
  const id = campo(form, 'id');
  return { falha, id: isUuid(id) ? id : null };
}

function pronto(anterior: ClienteState, id: string, ok: string): ClienteState {
  revalidatePath(`/admin/clientes/${id}`);
  revalidatePath('/admin');
  return { ...CLIENTE_INICIAL, ok, rodada: anterior.rodada + 1 };
}

export async function salvarCliente(anterior: ClienteState, form: FormData): Promise<ClienteState> {
  const { falha, id } = await inicio(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };
  const conferido = parseTenantInput(form);
  if (!conferido.ok) return { ...falha, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_update_tenant', {
    p_tenant_id: id,
    p_name: v.nome,
    p_legal_name: v.razaoSocial,
    p_document: v.documento,
  });
  if (error !== null) return { ...falha, erro: dbErrorMessage(error) };
  return pronto(anterior, id, 'Salvo. A auditoria guardou o antes e o depois.');
}

export async function suspenderCliente(
  anterior: ClienteState,
  form: FormData,
): Promise<ClienteState> {
  const { falha, id } = await inicio(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };
  const motivo = campo(form, 'motivo');
  if (motivo === '') return { ...falha, erro: 'Diga o motivo — é o que a empresa vai ler.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_set_tenant_status', {
    p_tenant_id: id,
    p_status: 'suspended',
    p_reason: motivo,
  });
  if (error !== null) return { ...falha, erro: dbErrorMessage(error) };
  return pronto(
    anterior,
    id,
    'Suspensa. Quem é da empresa não entra mais — nem pela tela, nem pela API. Os dados ficam.',
  );
}

export async function reativarCliente(
  anterior: ClienteState,
  form: FormData,
): Promise<ClienteState> {
  const { falha, id } = await inicio(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_set_tenant_status', {
    p_tenant_id: id,
    p_status: 'active',
    p_reason: null,
  });
  if (error !== null) return { ...falha, erro: dbErrorMessage(error) };
  return pronto(anterior, id, 'Reativada. O acesso volta na próxima página que cada pessoa abrir.');
}

export async function trocarPlano(anterior: ClienteState, form: FormData): Promise<ClienteState> {
  const { falha, id } = await inicio(anterior, form);
  if (id === null) return { ...falha, erro: 'Empresa não encontrada.' };
  const plano = campo(form, 'plano');
  if (plano === '') return { ...falha, erro: 'Escolha o plano.' };

  const supabase = await supabaseServer();
  const [{ data, error }, modulos] = await Promise.all([
    supabase.rpc('admin_change_plan', {
      p_tenant_id: id,
      p_plan_code: plano,
      p_disable_outside: form.get('desligar') === 'on',
    }),
    supabase.from('modules').select('code, name'),
  ]);
  if (error !== null) return { ...falha, erro: dbErrorMessage(error) };

  const mapa = Object.fromEntries(
    (modulos.data ?? []).map((m) => [String(m.code), String(m.name)]),
  );
  const r = (data ?? {}) as { ligados?: unknown; desligados?: unknown };
  const ligados = nomes(r.ligados, mapa);
  const desligados = nomes(r.desligados, mapa);
  const partes = [
    ligados === '' ? null : `ligou ${ligados}`,
    desligados === '' ? null : `desligou ${desligados}`,
  ].filter((p): p is string => p !== null);
  return pronto(
    anterior,
    id,
    partes.length === 0
      ? 'Plano trocado. Nenhum módulo mudou.'
      : `Plano trocado: ${partes.join('; ')}.`,
  );
}
