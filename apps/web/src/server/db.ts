import 'server-only';

/**
 * Conexão direta com o Postgres, para o que o cliente do Supabase não faz.
 *
 * O SDK do Supabase fala PostgREST: tabelas, views e funções. O executor do
 * provisionamento precisa de SQL — `insert … on conflict`, `update … returning`,
 * conversão explícita de enum. Expor isso por PostgREST exigiria uma função que
 * recebe SQL como texto, que é um endpoint de execução arbitrária com outro
 * nome.
 *
 * Então: conexão de verdade, com as credenciais de serviço. **Isto ignora o
 * RLS**, pelo mesmo motivo que `supabaseAdmin()` ignora — provisionar é criar
 * as linhas de que o RLS depende, e não há como fazê-lo sob as políticas que
 * elas mesmas vão alimentar.
 *
 * ## Modo transação, e o que ele proíbe
 *
 * `DATABASE_URL` aponta para a porta 6543, o pooler em modo transação. É o que
 * serve para função serverless: a conexão volta ao pool no fim de cada
 * transação, em vez de ficar presa a um processo que o provedor vai congelar.
 *
 * O preço é `prepare: false`. Statement preparado vive na conexão, e em modo
 * transação a próxima consulta pode sair por outra conexão — que não conhece o
 * statement. O erro é `prepared statement "s1" does not exist`, aparece sob
 * carga, e some quando se tenta reproduzir.
 *
 * ## Uma instância por processo
 *
 * O pool é guardado em módulo. Criar um por requisição abriria conexões que
 * ninguém fecha: em serverless, o processo é reaproveitado entre requisições, e
 * o vazamento só aparece quando o banco recusa novas conexões.
 */

import postgres from 'postgres';

import { normalizeConnectionUrl } from './connection-url.ts';

import type { SqlClient } from './provisioning/execute.ts';

export const DATABASE_URL_VAR = 'DATABASE_URL';

let pool: postgres.Sql | null = null;

function conexao(): postgres.Sql {
  if (pool !== null) return pool;

  const url = process.env[DATABASE_URL_VAR]?.trim();
  if (url === undefined || url.length === 0) {
    throw new Error(
      `${DATABASE_URL_VAR} não está definida. É a conexão do pooler em modo transação ` +
        '(porta 6543), em Project Settings → Database. Ver .env.example.',
    );
  }

  /*
   * A string do painel quase nunca funciona colada como está: sobra o `]` do
   * marcador `[YOUR-PASSWORD]`, e a senha traz caractere reservado em URL. As
   * duas falhas dão a **mesma** mensagem — "password authentication failed" —,
   * que parece senha errada e não é. Ver `connection-url.ts`.
   */
  pool = postgres(normalizeConnectionUrl(url, DATABASE_URL_VAR), {
    prepare: false,
    /*
     * Poucas conexões de propósito. Cada instância serverless abre as suas, e
     * o limite do projeto é compartilhado por todas — um pool generoso por
     * instância vira recusa de conexão quando o tráfego cresce.
     */
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    /* O nome aparece em `pg_stat_activity`: quem investigar sabe quem abriu. */
    connection: { application_name: 'tivexy-web' },
  });

  return pool;
}

/**
 * O `SqlClient` que o executor espera, sobre esta conexão.
 *
 * `unsafe` porque a interface é `(sql, params)` com `$1`, `$2` — e não template
 * literal. Os valores continuam **parametrizados**: o segundo argumento vai
 * separado da consulta, então não há concatenação e não há injeção. O nome da
 * função é infeliz; o que ela faz aqui, não.
 */
export function sqlClient(): SqlClient {
  const sql = conexao();
  return {
    async query(texto: string, params: readonly unknown[] = []) {
      const linhas = await sql.unsafe(texto, params as never[]);
      return { rows: linhas as unknown as Record<string, unknown>[] };
    },
  };
}

/** A conexão está configurada? Para diagnóstico, não para fluxo. */
export function hasDatabaseUrl(): boolean {
  const url = process.env[DATABASE_URL_VAR]?.trim();
  return url !== undefined && url.length > 0;
}
