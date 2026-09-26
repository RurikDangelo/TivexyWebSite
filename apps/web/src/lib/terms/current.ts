import 'server-only';

/**
 * O vocabulário desta empresa, lido do banco.
 *
 * É a promessa central do Blueprint chegando na tela: a mesma listagem lê
 * "Leads" numa consultoria e "Interessados" numa clínica, sem que exista uma
 * segunda tela nem uma segunda tabela.
 *
 * Lido do tenant, não do documento de nicho. O documento é a **origem** do
 * vocabulário; a verdade sobre o que esta empresa usa hoje é a coluna
 * `tenants.terms`, porque o nicho pode ter mudado no repositório depois do
 * provisionamento e ninguém quer que os rótulos de um cliente mudem sozinhos
 * num deploy.
 *
 * `cache()` por requisição pelo mesmo motivo da sessão: menu, título da aba e
 * corpo da página perguntam o mesmo rótulo, e sem ele seriam três consultas.
 */

import { cache } from 'react';

import { currentSession } from '../auth/session.ts';
import { supabaseServer } from '../supabase/server.ts';
import { SEM_TERMOS, type Terms } from './vocabulary.ts';

export const currentTerms = cache(async (): Promise<Terms> => {
  const { choice } = await currentSession();
  if (choice.kind !== 'resolved') return SEM_TERMOS;

  try {
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('tenants')
      .select('terms')
      .eq('id', choice.tenant.id)
      .maybeSingle();

    const bruto = (data as { terms?: unknown } | null)?.terms;
    return bruto !== null && typeof bruto === 'object' ? (bruto as Terms) : SEM_TERMOS;
  } catch {
    /*
     * Sem vocabulário a tela ainda funciona: cai no rótulo genérico. Falhar
     * aqui derrubaria uma listagem inteira por causa de um nome.
     */
    return SEM_TERMOS;
  }
});
