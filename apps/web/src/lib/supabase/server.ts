import 'server-only';

/**
 * O cliente do Supabase para código de servidor — Server Component, Route
 * Handler e Server Action.
 *
 * Usa a chave **publicável**, de propósito. Estar no servidor não é motivo para
 * ignorar o RLS: as consultas feitas por aqui carregam a sessão da pessoa e são
 * filtradas pelas mesmas políticas que filtrariam o navegador. Quem precisa
 * ignorar o RLS chama `supabaseAdmin()`, que é outro módulo e tem outro nome
 * justamente para que a escolha seja visível em quem chama.
 *
 * O `try/catch` do `setAll` não é preguiça. Server Component não pode escrever
 * cabeçalho — a resposta já começou a ser transmitida quando ele roda. Quando a
 * biblioteca decide renovar o token durante uma renderização, escrever falha, e
 * está certo que falhe: quem renova o cookie é o middleware, antes de a página
 * existir. Sem o catch, toda página que lê a sessão quebraria na hora em que o
 * token vencesse — um erro intermitente, em produção, que só aparece uma hora
 * depois do login.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { requireSupabaseConfig } from '../env.ts';

export async function supabaseServer() {
  const cookieStore = await cookies();
  const { url, publishableKey } = requireSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(paraGravar) {
        try {
          for (const { name, value, options } of paraGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* Renderização já em curso. O middleware renova; ver o cabeçalho. */
        }
      },
    },
  });
}
