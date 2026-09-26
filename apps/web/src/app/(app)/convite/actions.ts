'use server';

/**
 * Aceitar o convite para uma empresa.
 *
 * Quem faz o trabalho é `accept_invitation()`, no banco. Ela é SECURITY
 * DEFINER porque o RLS de `tenant_users` nega a escrita a quem ainda não é
 * membro ativo — exatamente quem está nesta página —, e por isso a regra
 * inteira mora lá: só o vínculo de `auth.uid()` é tocado. Esta action não
 * passa usuário nenhum, e não teria como passar.
 *
 * A empresa vem do formulário e é conferida contra `my_tenants()` antes da
 * chamada. A conferência é para a mensagem, não para a garantia: a função
 * recusaria qualquer empresa sem convite desta pessoa.
 */

import { redirect } from 'next/navigation';

import { invitationsOf, acceptErrorMessage } from '@/lib/auth/invitations';
import { requireAccess } from '@/lib/auth/require';
import { lembrarEmpresa } from '@/lib/auth/tenant-cookie';
import { supabaseServer } from '@/lib/supabase/server';

import type { AceiteState } from './state';

export async function aceitarConvite(_anterior: AceiteState, form: FormData): Promise<AceiteState> {
  const { options } = await requireAccess('/convite');

  const bruto = form.get('tenant');
  const tenantId = typeof bruto === 'string' ? bruto.trim() : '';
  const convite = invitationsOf(options, null).pendentes.find((o) => o.id === tenantId);
  if (convite === undefined) {
    return { erro: 'Este convite não está mais pendente. Recarregue a página.' };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('accept_invitation', { p_tenant_id: tenantId });
  if (error !== null) return { erro: acceptErrorMessage(error.message) };

  const slug = (data as { slug?: unknown } | null)?.slug;
  await lembrarEmpresa(typeof slug === 'string' ? slug : convite.slug);

  /*
   * Para o painel, e deixar a guarda decidir o resto: empresa ainda em
   * preparo manda para `/preparando`, que é o lugar certo de esperar — já
   * como membro.
   */
  redirect('/painel');
}
