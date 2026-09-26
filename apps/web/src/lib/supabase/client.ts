'use client';

/**
 * O cliente do Supabase no navegador.
 *
 * Só a chave publicável chega aqui — e ela é pública por desenho: vai no pacote
 * JavaScript, que qualquer pessoa lê. O que impede um visitante de ler o banco
 * inteiro com ela é o RLS, não o segredo da chave. `lib/env.ts` recusa uma
 * chave secreta nesta variável, porque a troca é fácil de fazer e impossível de
 * perceber olhando a tela.
 *
 * Uma instância por aba, guardada em módulo. Criar um cliente por componente
 * multiplicaria os ouvintes de `onAuthStateChange` e faria a mesma renovação de
 * token disparar várias vezes.
 */

import { createBrowserClient } from '@supabase/ssr';

import { requireSupabaseConfig } from '../env.ts';

type Cliente = ReturnType<typeof createBrowserClient>;

let instancia: Cliente | null = null;

export function supabaseBrowser(): Cliente {
  if (instancia !== null) return instancia;
  const { url, publishableKey } = requireSupabaseConfig();
  instancia = createBrowserClient(url, publishableKey);
  return instancia;
}
