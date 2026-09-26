/**
 * Harness de teste do esquema do Tivexy Core.
 *
 * Roda as migrations contra um Postgres de verdade (PGlite: Postgres compilado
 * para WASM), sem Docker e sem servidor. O objetivo é poder afirmar que o
 * esquema e as políticas de RLS funcionam — não que "parecem certos".
 *
 * O que o harness precisa simular do Supabase:
 *   auth.users        tabela gerenciada pelo Supabase, referenciada por public.users
 *   auth.uid()        id do usuário da requisição
 *   authenticated     papel que as políticas usam em `to authenticated`
 *   anon              visitante não autenticado
 *
 * Tudo o mais é Postgres puro e se comporta igual em produção.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

/** Reproduz o que o Supabase já oferece pronto. */
const SUPABASE_STUB = `
  create schema if not exists auth;

  create table auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text not null unique,
    -- Onde o Supabase guarda o que veio do cadastro ou do OAuth. O gatilho que
    -- espelha para public.users lê daqui, então o harness precisa ter.
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  -- No Supabase o id vem do JWT. Aqui vem de uma configuração de sessão,
  -- que os testes trocam para se passar por um usuário ou por outro.
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public, auth to anon, authenticated, service_role;

  -- O Supabase concede por PRIVILÉGIO PADRÃO: toda tabela nasce com estes
  -- direitos, e o RLS é que restringe as linhas.
  --
  -- Conceder antes das migrations (e não depois) não é detalhe: é o que
  -- permite a uma migration REVOGAR um privilégio e a revogação valer. Com o
  -- grant depois, qualquer restrição de coluna seria desfeita — e o teste de
  -- escalada de privilégio passaria por engano.
  alter default privileges in schema public
    grant select, insert, update, delete on tables to authenticated, service_role;
  alter default privileges in schema public grant select on tables to anon;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;

  grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

export async function migrationFiles() {
  const files = await readdir(migrationsDir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

/**
 * O banco já migrado, guardado como retrato para ser restaurado depois.
 *
 * Existe porque o custo estava crescendo de um jeito que o próprio projeto
 * avisa contra: "teste caro é teste que ninguém roda". Os arquivos que recriam
 * o banco a cada teste levavam ~1,5 s por teste — 55 testes viravam 63 s, e
 * cada teste novo somava mais um segundo e meio.
 *
 * Rodar as migrations é o caro; restaurar um retrato custa ~0,4 s. Como o
 * retrato é tirado **depois** das migrations, ele já traz o catálogo — não há
 * lista de tabelas a limpar, e portanto não há como esquecer uma e deixar dado
 * vazar de um teste para o outro.
 *
 * Fica por processo. O runner do Node roda cada arquivo no seu, então cada um
 * paga a migração uma vez e restaura o resto.
 */
let retrato = null;

async function migrarDoZero() {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);

  for (const file of await migrationFiles()) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration falhou: ${file}\n${error.message}`, { cause: error });
    }
  }

  return db;
}

/**
 * Sobe um banco limpo com todas as migrations aplicadas na ordem.
 *
 * Cada chamada devolve uma instância **própria e isolada** — dois bancos
 * criados aqui não se enxergam. É o que permite um teste criar um tenant com
 * `slug = 'cafe-do-centro'` sem colidir com o teste ao lado.
 *
 * @returns {Promise<import('@electric-sql/pglite').PGlite>}
 */
export async function createDatabase() {
  if (retrato === null) {
    const primeiro = await migrarDoZero();
    retrato = await primeiro.dumpDataDir();
    return primeiro;
  }

  return PGlite.create({ loadDataDir: retrato });
}

/**
 * Força a próxima criação a rodar as migrations de novo.
 *
 * Para quem mexe em migration durante a sessão de teste. Não é usado pela
 * suíte: cada arquivo roda no seu processo e já começa sem retrato.
 */
export function forgetSnapshot() {
  retrato = null;
}

/**
 * Executa `fn` como um usuário autenticado, sujeito ao RLS.
 *
 * Usa `set local` dentro de uma transação para que o papel e a identidade
 * voltem ao normal mesmo se a consulta lançar erro — sem isso, um teste que
 * falha contamina os seguintes.
 */
export async function asUser(db, userId, fn) {
  await db.exec('begin');
  try {
    await db.query(`set local request.jwt.claim.sub = '${userId}'`);
    await db.exec('set local role authenticated');
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

/**
 * Como `asUser`, mas **confirma** a transação.
 *
 * `asUser` desfaz no fim, e esse é o padrão certo: a maioria dos testes
 * pergunta o que alguém enxerga, ou prova que uma escrita é recusada — e em
 * nenhum dos dois o estado deve sobrar para o teste seguinte.
 *
 * Escrita que **precisa** persistir é outro caso. Converter um lead cria
 * conta, pessoa e oportunidade, e o que se quer verificar é justamente que
 * elas ficaram lá e ligadas entre si. Com rollback, a função devolve os ids
 * e a leitura seguinte não acha nada — o teste falha sem que o código
 * tenha problema, que é o pior tipo de teste vermelho.
 *
 * O preço é que o dado sobra para os testes seguintes do mesmo arquivo.
 * Quem usa isto cria o próprio cenário em `beforeEach`.
 */
export async function asUserCommitting(db, userId, fn) {
  await db.exec('begin');
  try {
    await db.query(`set local request.jwt.claim.sub = '${userId}'`);
    await db.exec('set local role authenticated');
    const resultado = await fn();
    /* O papel volta sozinho: `set local` só vale até o fim da transação. */
    await db.exec('commit');
    return resultado;
  } catch (erro) {
    await db.exec('rollback');
    throw erro;
  }
}

/** Executa `fn` como visitante não autenticado. */
export async function asAnon(db, fn) {
  await db.exec('begin');
  try {
    await db.query(`set local request.jwt.claim.sub = ''`);
    await db.exec('set local role anon');
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

/**
 * Cria um usuário em auth.users e no perfil público.
 * @returns {Promise<string>} o id
 */
export async function createUser(db, { email, fullName = null, isSuperAdmin = false }) {
  // Só a identidade. O perfil em `public.users` nasce pelo gatilho
  // `mirror_auth_user`, como em produção — inserir os dois à mão aqui
  // esconderia um gatilho quebrado atrás de um teste que passa.
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text))
     returning id`,
    [email, fullName],
  );
  const id = rows[0].id;

  // Plataforma é decisão da plataforma: o gatilho não escreve isto, de
  // propósito. Metadado de cadastro não pode promover ninguém.
  if (isSuperAdmin) {
    await db.query('update public.users set is_super_admin = true where id = $1', [id]);
  }

  return id;
}

/** Cria um tenant ativo já no plano indicado. */
export async function createTenant(db, { slug, name, planCode = 'profissional' }) {
  const { rows } = await db.query(
    `insert into public.tenants (slug, name, status, plan_id)
     values ($1, $2, 'active', (select id from public.plans where code = $3))
     returning id`,
    [slug, name, planCode],
  );
  return rows[0].id;
}

/** Vincula um usuário a um tenant com um papel de sistema. */
export async function addMember(db, { tenantId, userId, roleCode, status = 'active' }) {
  const { rows } = await db.query(
    `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
     values (
       $1, $2,
       (select id from public.roles where code = $3 and tenant_id is null),
       $4::public.membership_status,
       case when $4 = 'invited' then null else now() end
     )
     returning id`,
    [tenantId, userId, roleCode, status],
  );
  return rows[0].id;
}
