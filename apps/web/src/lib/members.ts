import 'server-only';

/**
 * As pessoas ativas desta empresa, para "responsável" em cadastro e cartão.
 *
 * Lidas com a sessão, passando pelo RLS: `users_read` libera quem divide
 * empresa com quem pergunta, e mais ninguém. O embutido nomeia a chave
 * estrangeira porque `tenant_users` aponta para `users` duas vezes — quem é e
 * quem convidou —, e o PostgREST recusa adivinhar qual das duas se quer.
 */

import { cache } from 'react';

import { supabaseServer } from './supabase/server.ts';

export interface Member {
  userId: string;
  nome: string;
}

export const tenantMembers = cache(async (tenantId: string): Promise<Member[]> => {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('tenant_users')
    .select('user_id, users!tenant_users_user_id_fkey(full_name, email)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  return (data ?? [])
    .map((linha) => {
      const pessoa = (Array.isArray(linha.users) ? linha.users[0] : linha.users) as {
        full_name?: unknown;
        email?: unknown;
      } | null;
      const nome =
        (typeof pessoa?.full_name === 'string' && pessoa.full_name.trim()) ||
        (typeof pessoa?.email === 'string' && pessoa.email) ||
        'Sem nome';
      return { userId: String(linha.user_id), nome };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
});

/** O nome de quem responde, ou `null` quando a pessoa saiu da empresa. */
export function nomeDe(membros: readonly Member[], userId: unknown): string | null {
  if (typeof userId !== 'string') return null;
  return membros.find((m) => m.userId === userId)?.nome ?? null;
}
