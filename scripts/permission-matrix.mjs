/**
 * Gera a matriz de permissões a partir do banco de verdade.
 *
 * A matriz em docs/12-SECURITY/AUTHORIZATION.md é copiada da saída deste
 * script. Escrever a matriz à mão garante que ela vai divergir do catálogo na
 * primeira permissão nova — e uma matriz de permissões errada na documentação é
 * pior que nenhuma.
 *
 *   npm run docs:matrix
 */
import { createDatabase } from '../supabase/tests/harness.mjs';

const MODULE_NAMES = {
  core: 'Core',
  crm: 'CRM',
  erp: 'ERP',
  inventory: 'Estoque',
  finance: 'Financeiro',
  fiscal: 'Fiscal',
  automation: 'Automações',
  ai: 'IA',
  integrations: 'Integrações',
};

const db = await createDatabase();

const { rows } = await db.query(`
  select
    m.code as modulo,
    p.code,
    p.name,
    bool_or(r.code = 'tenant_admin')  as admin,
    bool_or(r.code = 'manager')       as gestor,
    bool_or(r.code = 'collaborator')  as colaborador
  from public.permissions p
  left join public.modules m on m.id = p.module_id
  left join public.role_permissions rp on rp.permission_id = p.id
  left join public.roles r on r.id = rp.role_id and r.tenant_id is null
  group by m.code, m.sort_order, p.code, p.name
  order by m.sort_order, p.code
`);

const mark = (granted) => (granted ? '✅' : '—');
let current = null;

for (const row of rows) {
  if (row.modulo !== current) {
    current = row.modulo;
    console.log(`\n### ${MODULE_NAMES[current] ?? current}\n`);
    console.log('| Permissão | O que permite | Admin | Gestor | Colaborador |');
    console.log('| --- | --- | :-: | :-: | :-: |');
  }
  console.log(
    `| \`${row.code}\` | ${row.name} | ${mark(row.admin)} | ${mark(row.gestor)} | ${mark(row.colaborador)} |`,
  );
}

const { rows: totals } = await db.query(`
  select r.code, count(rp.permission_id)::int as total
  from public.roles r
  left join public.role_permissions rp on rp.role_id = r.id
  where r.tenant_id is null
  group by r.code
  order by total desc
`);

console.log('\nTotais:', totals.map((t) => `${t.code}=${t.total}`).join(' · '));

await db.close();
