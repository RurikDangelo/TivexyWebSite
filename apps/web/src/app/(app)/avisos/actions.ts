'use server';

/**
 * Marcar aviso como lido — a única escrita que a pessoa faz num aviso.
 *
 * O banco só deixa mudar `read_at`, e só do próprio aviso. Os filtros de
 * pessoa e empresa aqui são o de sempre: o RLS é o piso, não o filtro.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAccess } from '@/lib/auth/require';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

const ROTA = '/avisos';

/** Só caminho interno — a mesma regra da constraint `notifications_link_internal`. */
function linkInterno(valor: unknown): string | null {
  return typeof valor === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(valor) ? valor : null;
}

async function marcar(ids: string[] | 'todos'): Promise<void> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved' || viewer.userId === null) return;

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', choice.tenant.id)
    .eq('user_id', viewer.userId)
    .is('read_at', null);
  if (ids !== 'todos') consulta = consulta.in('id', ids);
  await consulta;
  // O sino está no layout: revalidar só a página deixaria o número velho no topo.
  revalidatePath('/', 'layout');
}

export async function marcarComoLido(form: FormData): Promise<void> {
  const id = campo(form, 'id');
  if (!isUuid(id)) return;
  await marcar([id]);
}

export async function marcarTodosComoLidos(): Promise<void> {
  await marcar('todos');
}

/**
 * Abrir um aviso: marca como lido e leva aonde ele aponta.
 *
 * Por formulário, e não por link: abrir é uma escrita, e o navegador
 * pré-carrega link — o aviso ficaria lido sem ninguém ter olhado.
 */
export async function abrirAviso(form: FormData): Promise<void> {
  const id = campo(form, 'id');
  if (!isUuid(id)) return;
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved' || viewer.userId === null) return;

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('notifications')
    .select('link')
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .eq('user_id', viewer.userId)
    .maybeSingle();
  await marcar([id]);
  const destino = linkInterno(data?.link);
  if (destino !== null) redirect(destino);
}
