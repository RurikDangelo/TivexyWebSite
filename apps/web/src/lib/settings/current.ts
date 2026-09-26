import 'server-only';

/**
 * As configurações efetivas desta empresa: o padrão do Core, com o que ela
 * mudou.
 *
 * `tenants.settings` guarda só a diferença — ver `resolveSettings()` no Core.
 * Quem pergunta aqui recebe o valor que vale, e não precisa saber se ele veio
 * do padrão, do Blueprint ou de alguém que mudou na tela.
 *
 * `cache()` por requisição: o fuso é pedido por toda tela que mostra data.
 */

import { resolveSettings } from '@tivexy/core';
import { cache } from 'react';

import { currentSession } from '../auth/session.ts';
import { supabaseServer } from '../supabase/server.ts';

export type EffectiveSettings = Readonly<Record<string, string | number | boolean>>;

export const currentSettings = cache(async (): Promise<EffectiveSettings> => {
  const { choice, viewer } = await currentSession();
  const modulos = [...viewer.enabledModules];
  if (choice.kind !== 'resolved') return resolveSettings({}, modulos);

  try {
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', choice.tenant.id)
      .maybeSingle();

    const bruto = (data as { settings?: unknown } | null)?.settings;
    const overrides =
      bruto !== null && typeof bruto === 'object' && !Array.isArray(bruto)
        ? (bruto as Record<string, unknown>)
        : {};
    return resolveSettings(overrides, modulos);
  } catch {
    /* Sem as configurações, o padrão do Core — que é um valor válido, não um buraco. */
    return resolveSettings({}, modulos);
  }
});

/** O fuso do tenant. Define o que é "hoje" em vencimento, agenda e relatório. */
export async function tenantTimeZone(): Promise<string> {
  const fuso = (await currentSettings())['core.timezone'];
  return typeof fuso === 'string' ? fuso : 'America/Sao_Paulo';
}
