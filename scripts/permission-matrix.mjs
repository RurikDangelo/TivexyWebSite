/**
 * Gera a matriz de permissões a partir do banco de verdade.
 *
 * A matriz em docs/12-SECURITY/AUTHORIZATION.md é copiada da saída daqui.
 * Escrever a matriz à mão garante que ela vai divergir do catálogo na primeira
 * permissão nova — e uma matriz de permissões errada na documentação é pior
 * que nenhuma.
 *
 * A cópia continua sendo manual, mas **deixou de ser confiada**: um teste em
 * `supabase/tests/contracts.test.mjs` compara o documento com esta saída e
 * falha se divergirem. Por isso a geração mora numa função exportada, em vez
 * de imprimir direto — o teste importa a mesma função que o comando usa, e não
 * uma segunda implementação que poderia concordar com o documento errado.
 *
 *   npm run docs:matrix
 */
import { pathToFileURL } from 'node:url';
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

const mark = (granted) => (granted ? '✅' : '—');

/**
 * A matriz em Markdown, lida do catálogo de um banco já migrado.
 *
 * @param {{ query: (sql: string) => Promise<{ rows: object[] }> }} db
 * @returns {Promise<string>}
 */
export async function permissionMatrix(db) {
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

  const linhas = [];
  let current = null;

  for (const row of rows) {
    if (row.modulo !== current) {
      current = row.modulo;
      linhas.push('', `### ${MODULE_NAMES[current] ?? current}`, '');
      linhas.push('| Permissão | O que permite | Admin | Gestor | Colaborador |');
      linhas.push('| --- | --- | :-: | :-: | :-: |');
    }
    linhas.push(
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

  linhas.push('', `Totais: ${totals.map((t) => `${t.code}=${t.total}`).join(' · ')}`);
  return linhas.join('\n');
}

/** Só as linhas de permissão, normalizadas — o que o teste compara. */
export function permissionRows(markdown) {
  return markdown
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => /^\|\s*`[a-z]+\./.test(l));
}

/*
 * Rodar como comando imprime; importar não faz nada.
 *
 * `pathToFileURL` em vez de montar a URL à mão: no Windows o caminho vem como
 * `C:\...`, e trocar barra por barra não produz `file:///C:/...` — a comparação
 * dava falso e o comando não imprimia nada.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await createDatabase();
  console.log(await permissionMatrix(db));
  await db.close();
}
