/**
 * Confere no banco **real** o que os testes só provaram contra o PGlite.
 *
 * Existe porque nem tudo que passa no harness passa em produção: o harness
 * simula `auth` e `storage` do Supabase, e uma simulação é uma hipótese sobre o
 * original. Balde de arquivo, política sobre `storage.objects` e privilégio de
 * coluna são exatamente o tipo de coisa em que a hipótese pode estar errada sem
 * que nada quebre até alguém tentar usar.
 *
 * Só lê. Nenhuma consulta aqui escreve, e a saída nunca inclui a URL de
 * conexão — o mesmo cuidado de `db.mjs`, pelo mesmo motivo.
 *
 *   node scripts/db-check.mjs
 */
import postgres from 'postgres';

import { connectionUrl } from './db-url.mjs';

const VERIFICACOES = [
  {
    nome: 'colunas de marca em tenants',
    consulta: (sql) => sql`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'tenants'
        and column_name in ('brand_primary', 'brand_logo_path')
      order by column_name
    `,
    espera: (linhas) => linhas.length === 2,
    descreve: (linhas) => linhas.map((l) => `${l.column_name}: ${l.data_type}`).join(', '),
  },
  {
    nome: 'restrições de formato da marca',
    consulta: (sql) => sql`
      select conname
      from pg_constraint
      where conrelid = 'public.tenants'::regclass
        and conname in ('tenants_brand_primary_format', 'tenants_brand_logo_path_scoped')
      order by conname
    `,
    espera: (linhas) => linhas.length === 2,
    descreve: (linhas) => linhas.map((l) => l.conname).join(', '),
  },
  {
    nome: 'o balde tenant-branding',
    consulta: (sql) => sql`
      select public, file_size_limit, allowed_mime_types
      from storage.buckets where id = 'tenant-branding'
    `,
    espera: (linhas) =>
      linhas.length === 1 &&
      linhas[0].public === true &&
      !linhas[0].allowed_mime_types.includes('image/svg+xml'),
    descreve: (linhas) =>
      linhas.length === 0
        ? 'não existe'
        : `público=${linhas[0].public}, limite=${linhas[0].file_size_limit}B, mimes=${linhas[0].allowed_mime_types.join('|')}`,
  },
  {
    nome: 'políticas do balde em storage.objects',
    consulta: (sql) => sql`
      select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'tenant_branding%'
      order by policyname
    `,
    espera: (linhas) => linhas.length === 4,
    descreve: (linhas) => `${linhas.length} de 4: ${linhas.map((l) => l.policyname).join(', ')}`,
  },
  {
    nome: 'as duas funções novas do admin',
    consulta: (sql) => sql`
      select p.proname, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('admin_set_tenant_brand', 'admin_set_tenant_module')
      order by p.proname
    `,
    espera: (linhas) => linhas.length === 2 && linhas.every((l) => l.prosecdef === true),
    descreve: (linhas) =>
      linhas.map((l) => `${l.proname}${l.prosecdef ? ' (definer)' : ' (INVOKER!)'}`).join(', '),
  },
  {
    /*
     * A barreira que não depende da checagem dentro da função. Se um dia
     * alguém remover o `is_super_admin()` do corpo, esta ainda segura — desde
     * que ninguém tenha concedido o privilégio de volta.
     */
    nome: 'authenticated não escreve marca por UPDATE direto',
    consulta: (sql) => sql`
      select column_name
      from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'tenants'
        and grantee = 'authenticated' and privilege_type = 'UPDATE'
      order by column_name
    `,
    espera: (linhas) => {
      const colunas = linhas.map((l) => l.column_name);
      return !colunas.includes('brand_primary') && !colunas.includes('brand_logo_path');
    },
    descreve: (linhas) =>
      linhas.length === 0
        ? 'nenhuma coluna gravável'
        : `grava: ${linhas.map((l) => l.column_name).join(', ')}`,
  },
];

const url = connectionUrl('DIRECT_URL');
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

let falhou = false;
try {
  for (const v of VERIFICACOES) {
    let linhas;
    try {
      linhas = await v.consulta(sql);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      console.log(`✖ ${v.nome} — a consulta falhou: ${motivo.slice(0, 120)}`);
      falhou = true;
      continue;
    }
    const ok = v.espera(linhas);
    if (!ok) falhou = true;
    console.log(`${ok ? '✔' : '✖'} ${v.nome} — ${v.descreve(linhas)}`);
  }
} finally {
  await sql.end();
}

console.log(falhou ? '\nHá diferença entre o esperado e o banco real.' : '\nO banco real confere.');
process.exit(falhou ? 1 : 0);
