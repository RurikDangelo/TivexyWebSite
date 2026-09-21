import 'server-only';

/**
 * O vocabulário desta empresa.
 *
 * É a promessa central do Blueprint chegando na tela: a mesma listagem lê
 * "Leads" numa consultoria e "Pacientes em potencial" numa clínica, sem que
 * exista uma segunda tela nem uma segunda tabela.
 *
 * Lido do tenant, não do documento de nicho. O documento é a **origem** do
 * vocabulário; a verdade sobre o que esta empresa usa hoje é a coluna
 * `tenants.terms`, porque o nicho pode ter mudado no repositório depois do
 * provisionamento e ninguém quer que os rótulos de um cliente mudem sozinhos
 * num deploy.
 *
 * `cache()` por requisição pelo mesmo motivo da sessão: cabeçalho, título e
 * corpo perguntam o mesmo rótulo, e sem ele seriam três consultas.
 */

import type { Term } from '@tivexy/core';
import { cache } from 'react';

import { currentSession } from '../auth/session.ts';
import { supabaseServer } from '../supabase/server.ts';

export type Terms = Readonly<Record<string, Term>>;

const SEM_TERMOS: Terms = {};

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

/**
 * O rótulo de uma chave, ou o padrão.
 *
 * Cair no padrão é o comportamento certo, e é o mesmo de `termFor()` no Core:
 * um nicho que não traduz tudo continua funcionando, e a interface mostra o
 * nome genérico em vez de um espaço em branco ou da própria chave.
 */
export function term(terms: Terms, key: string, fallback: Term): Term {
  const encontrado = terms[key];
  if (encontrado === undefined) return fallback;

  /* Veio do banco, então pode ter qualquer forma. Um rótulo vazio é pior que o padrão. */
  const singular = typeof encontrado.singular === 'string' ? encontrado.singular.trim() : '';
  const plural = typeof encontrado.plural === 'string' ? encontrado.plural.trim() : '';
  if (singular === '' || plural === '') return fallback;

  return { singular, plural };
}

/** Primeira letra maiúscula, para começo de frase e título. */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}
