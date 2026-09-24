import 'server-only';

/**
 * As configurações desta empresa — hoje, na prática, o fuso horário.
 *
 * Irmão de `lib/crm/terms.ts`, e pelo mesmo motivo: lido de `tenants`, não do
 * documento de nicho. O documento é a **origem** da configuração; a verdade
 * sobre o que esta empresa usa hoje é a coluna, porque o nicho pode ter mudado
 * no repositório depois do provisionamento e ninguém quer que o fuso de um
 * cliente mude sozinho num deploy.
 *
 * `cache()` por requisição porque a agenda pergunta o fuso muitas vezes — uma
 * vez por linha, para decidir se está atrasada — e sem ele seriam dezenas de
 * consultas iguais.
 */

import { DEFAULT_TIME_ZONE, isValidTimeZone } from '@tivexy/core';
import { cache } from 'react';

import { currentSession } from '../auth/session.ts';
import { supabaseServer } from '../supabase/server.ts';

/**
 * O fuso do tenant, ou o padrão.
 *
 * **Nunca o fuso do servidor.** Na Vercel ele é UTC, e em desenvolvimento é o
 * da máquina de quem está programando — nenhum dos dois tem relação com o
 * expediente do cliente. Uma agenda que decide "atrasado" pelo relógio do
 * servidor erra por três horas no Brasil, todos os dias.
 *
 * Valor inválido na coluna cai no padrão em vez de derrubar a tela. Um fuso
 * escrito errado é defeito de configuração, e o custo certo dele é o horário
 * aparecer no padrão — não a agenda inteira sumir.
 */
export const currentTimeZone = cache(async (): Promise<string> => {
  const { choice } = await currentSession();
  if (choice.kind !== 'resolved') return DEFAULT_TIME_ZONE;

  try {
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', choice.tenant.id)
      .maybeSingle();

    const settings = (data as { settings?: unknown } | null)?.settings;
    if (settings === null || typeof settings !== 'object') return DEFAULT_TIME_ZONE;

    const fuso = (settings as Record<string, unknown>)['core.timezone'];
    return typeof fuso === 'string' && isValidTimeZone(fuso) ? fuso : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
});
