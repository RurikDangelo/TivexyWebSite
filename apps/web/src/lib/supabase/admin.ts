import 'server-only';

/**
 * O cliente que **ignora o RLS**.
 *
 * Existe para uma coisa só: provisionamento. Criar um cliente novo significa
 * escrever em `tenants`, `tenant_modules`, `roles` e `tenant_users` antes de
 * existir alguém com vínculo a esse tenant — e enquanto ninguém tem vínculo,
 * toda política de RLS nega, corretamente. Não há como o provisionamento
 * acontecer sob RLS: é a operação que cria as linhas de que o RLS depende.
 *
 * `import 'server-only'` faz o build **falhar** se este módulo for alcançado
 * por um componente de cliente. É a diferença entre uma regra escrita num
 * comentário e uma regra que o compilador aplica — e o que ela previne é a
 * chave secreta viajar no pacote do navegador.
 *
 * Três decisões no `auth`, e as três importam:
 *
 *   persistSession: false     não há sessão que persistir; é uma chave de
 *                             serviço, não uma pessoa
 *   autoRefreshToken: false   não há token para renovar, e o temporizador
 *                             ficaria vivo no servidor sem nada para fazer
 *   detectSessionInUrl: false o servidor não tem URL de callback
 *
 * Sem elas, a biblioteca tenta guardar sessão em `localStorage`, que não existe
 * aqui, e o erro que aparece não fala de nenhuma dessas três coisas.
 */

import { createClient } from '@supabase/supabase-js';

import { requireSecretKey, requireSupabaseConfig } from '../env.ts';

export function supabaseAdmin() {
  const { url } = requireSupabaseConfig();

  return createClient(url, requireSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
