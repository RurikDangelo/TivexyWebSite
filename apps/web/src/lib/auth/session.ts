import 'server-only';

/**
 * A camada de sessão: de cookie para `Viewer`.
 *
 * É o fio que faltava. `decideAccess()` e `guard()` existem e têm teste desde
 * antes do banco estar aplicado, mas recebiam um `Viewer` que ninguém montava.
 * Aqui ele é montado — da sessão do Supabase, da lista de empresas da pessoa e
 * de `public.current_viewer()`, que é a mesma função que o RLS consulta.
 *
 * ## `getUser()`, nunca `getSession()`
 *
 * `getSession()` lê o cookie e acredita. O cookie vem do navegador, e o
 * navegador é do outro lado: acreditar nele é deixar a autorização na mão de
 * quem ela deveria conter. `getUser()` valida o token antes de responder.
 *
 * A diferença custa uma ida à rede por requisição e compra a única coisa que
 * importa nesta camada. Em desenvolvimento a biblioteca avisa sobre isso no
 * console; o aviso está certo, e a razão dele é esta.
 *
 * ## Três camadas, e esta é a do meio
 *
 *   middleware   renova o cookie e tira do caminho quem não tem sessão. É
 *                conveniência e higiene de cookie, **não** é a fronteira:
 *                middleware do Next já foi contornável por cabeçalho antes.
 *   esta camada  monta o `Viewer` e `requireAccess()` decide, no servidor,
 *                dentro do componente que vai renderizar
 *   RLS          nega a consulta, mesmo que as duas de cima falhem
 *
 * Nenhuma das três é suficiente sozinha, e é por isso que são três.
 *
 * ## `cache()` por requisição
 *
 * Layout e página chamam isto na mesma renderização. Sem `cache()`, seriam
 * quatro idas ao banco para responder a mesma pergunta. O cache é da requisição
 * — não vaza entre pessoas, porque cada requisição tem o seu.
 */

import { ANONYMOUS, type Viewer, parseViewer, tenantSlugFromHost } from '@tivexy/core';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { supabaseServer } from '../supabase/server.ts';
import {
  TENANT_COOKIE,
  type TenantChoice,
  type TenantOption,
  chooseTenant,
} from './active-tenant.ts';

export interface SessionContext {
  /** Quem está pedindo, no formato que `decideAccess()` consome. */
  viewer: Viewer;
  /** Em que empresa, e por quê. */
  choice: TenantChoice;
  /** Todas as empresas que esta pessoa alcança, para a tela de troca. */
  options: readonly TenantOption[];
  /** O e-mail da sessão, para o cabeçalho. `null` sem sessão. */
  email: string | null;
}

const SEM_SESSAO: SessionContext = {
  viewer: ANONYMOUS,
  choice: { kind: 'none' },
  options: [],
  email: null,
};

/**
 * O contexto desta requisição.
 *
 * Erro de rede vira `SEM_SESSAO`, não exceção. Supabase fora do ar precisa
 * resultar em "entre de novo", que é recuperável, e não numa página de erro
 * dentro de uma sessão que a pessoa acha que ainda tem. **Falhar para menos
 * acesso** é a mesma regra de `parseViewer()`.
 */
export const currentSession = cache(async (): Promise<SessionContext> => {
  let supabase: Awaited<ReturnType<typeof supabaseServer>>;
  try {
    supabase = await supabaseServer();
  } catch {
    /* Sem configuração não há sessão. `lib/env.ts` já nomeou o que falta. */
    return SEM_SESSAO;
  }

  const { data: autenticacao, error: erroAuth } = await supabase.auth.getUser();
  const user = autenticacao?.user ?? null;
  if (erroAuth !== null || user === null) return SEM_SESSAO;

  const { data: listaBruta } = await supabase.rpc('my_tenants');
  const options: TenantOption[] = Array.isArray(listaBruta)
    ? listaBruta.map((linha: Record<string, unknown>) => ({
        id: String(linha.id),
        slug: String(linha.slug),
        name: String(linha.name),
        status: linha.status as TenantOption['status'],
        membership: linha.membership as TenantOption['membership'],
      }))
    : [];

  const cabecalhos = await headers();
  const biscoitos = await cookies();
  const choice = chooseTenant(
    options,
    tenantSlugFromHost(cabecalhos.get('host')),
    biscoitos.get(TENANT_COOKIE)?.value ?? null,
  );

  /*
   * `current_viewer(null)` continua respondendo — devolve identidade e
   * `isSuperAdmin` sem empresa nenhuma. É exatamente o que o Super Admin
   * precisa, e o que o `no-tenant` do `decideAccess()` espera ver.
   */
  const tenantId = choice.kind === 'resolved' ? choice.tenant.id : null;
  const { data: contexto } = await supabase.rpc('current_viewer', { p_tenant_id: tenantId });

  return { viewer: parseViewer(contexto), choice, options, email: user.email ?? null };
});

/** Só o `Viewer`, para quem não precisa do resto. */
export async function currentViewer(): Promise<Viewer> {
  return (await currentSession()).viewer;
}
