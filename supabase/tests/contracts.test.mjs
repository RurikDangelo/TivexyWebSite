/**
 * Contratos TypeScript × catálogo SQL.
 *
 * `@tivexy/core` declara em TypeScript os mesmos códigos que as migrations
 * declaram em SQL. Duplicação é dívida; este arquivo é o pagamento.
 *
 * A comparação é nos DOIS sentidos de propósito. Conferir só um lado deixa
 * passar o caso mais provável: alguém adiciona a permissão na migration e
 * esquece do TypeScript, e a aplicação nunca consegue verificá-la.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  MEMBERSHIP_STATUSES,
  MODULE_CODES,
  PERMISSION_CODES,
  PLAN_CODES,
  PROVISIONING_STATUSES,
  PROVISIONING_STEP_STATUSES,
  SYSTEM_ROLE_CODES,
  TENANT_STATUSES,
  isActive,
  isTerminal,
  moduleOf,
} from '../../packages/core/src/index.ts';
import { createDatabase } from './harness.mjs';

let db;

before(async () => {
  db = await createDatabase();
});

after(async () => {
  await db?.close();
});

/** Compara dois conjuntos e diz exatamente o que sobra de cada lado. */
function assertSameSet(doTypeScript, doBanco, rotulo) {
  const ts = new Set(doTypeScript);
  const sql = new Set(doBanco);
  const soNoTs = [...ts].filter((v) => !sql.has(v)).sort();
  const soNoSql = [...sql].filter((v) => !ts.has(v)).sort();

  assert.deepEqual(
    { soNoTs, soNoSql },
    { soNoTs: [], soNoSql: [] },
    `${rotulo}: TypeScript e SQL divergiram`,
  );
}

async function codes(sql) {
  const { rows } = await db.query(sql);
  return rows.map((r) => r.code);
}

async function enumLabels(typeName) {
  const { rows } = await db.query(
    `select e.enumlabel as code
     from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = $1
     order by e.enumsortorder`,
    [typeName],
  );
  return rows.map((r) => r.code);
}

describe('catálogo: TypeScript espelha o SQL', () => {
  it('módulos', async () => {
    assertSameSet(MODULE_CODES, await codes('select code from public.modules'), 'módulos');
  });

  it('permissões', async () => {
    assertSameSet(
      PERMISSION_CODES,
      await codes('select code from public.permissions'),
      'permissões',
    );
  });

  it('papéis de sistema', async () => {
    assertSameSet(
      SYSTEM_ROLE_CODES,
      await codes('select code from public.roles where tenant_id is null'),
      'papéis de sistema',
    );
  });

  it('planos', async () => {
    assertSameSet(PLAN_CODES, await codes('select code from public.plans'), 'planos');
  });
});

describe('enums: TypeScript espelha o SQL', () => {
  it('tenant_status', async () => {
    assert.deepEqual([...TENANT_STATUSES], await enumLabels('tenant_status'));
  });

  it('membership_status', async () => {
    assert.deepEqual([...MEMBERSHIP_STATUSES], await enumLabels('membership_status'));
  });

  it('provisioning_status', async () => {
    assert.deepEqual([...PROVISIONING_STATUSES], await enumLabels('provisioning_status'));
  });

  it('provisioning_step_status', async () => {
    assert.deepEqual([...PROVISIONING_STEP_STATUSES], await enumLabels('provisioning_step_status'));
  });
});

describe('coerência interna', () => {
  it('toda permissão pertence a um módulo declarado', () => {
    const modulos = new Set(MODULE_CODES);
    const orfas = PERMISSION_CODES.filter((p) => !modulos.has(moduleOf(p)));
    assert.deepEqual(orfas, []);
  });

  it('o módulo lido do código bate com o módulo gravado no banco', async () => {
    const { rows } = await db.query(`
      select p.code, m.code as modulo
      from public.permissions p
      join public.modules m on m.id = p.module_id
    `);
    const divergentes = rows
      .filter((r) => moduleOf(r.code) !== r.modulo)
      .map((r) => `${r.code} -> ${r.modulo}`);
    assert.deepEqual(divergentes, []);
  });

  it('não há código repetido', () => {
    for (const [rotulo, lista] of [
      ['módulos', MODULE_CODES],
      ['permissões', PERMISSION_CODES],
      ['papéis', SYSTEM_ROLE_CODES],
      ['planos', PLAN_CODES],
    ]) {
      assert.equal(new Set(lista).size, lista.length, `${rotulo}: há código duplicado`);
    }
  });
});

describe('provisionamento — o que o TypeScript acha que está vivo', () => {
  /**
   * `isActive()` responde "esta execução ainda ocupa o tenant?". O banco
   * responde a mesma pergunta pelo índice parcial
   * `provisioning_runs_one_active_per_tenant`.
   *
   * Se os dois discordarem, a aplicação diz "pode começar outra execução" e o
   * banco recusa com violação de unicidade — erro que chega ao usuário como
   * falha genérica, no pior momento possível. É duplicação de regra, e
   * duplicação de regra se confere.
   */
  it('isActive concorda com o índice parcial do banco', async () => {
    const { rows } = await db.query(`
      select pg_get_expr(i.indpred, i.indrelid) as predicado
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      where c.relname = 'provisioning_runs_one_active_per_tenant'
    `);
    assert.equal(rows.length, 1, 'o índice parcial precisa existir');

    const noBanco = [...rows[0].predicado.matchAll(/'([a-z]+)'::/g)].map((m) => m[1]).sort();
    const noTypeScript = PROVISIONING_STATUSES.filter(isActive).sort();

    assertSameSet(noTypeScript, noBanco, 'estados que ocupam o tenant');
  });

  /**
   * A constraint exige `finished_at` exatamente nos estados terminais. Se o
   * TypeScript achar que `compensating` é terminal, a aplicação grava a data
   * de fim e o banco recusa — foi assim que a retomada quebrou.
   */
  it('isTerminal concorda com a constraint de data de fim', async () => {
    const { rows } = await db.query(`
      select pg_get_constraintdef(oid) as definicao
      from pg_constraint
      where conname = 'provisioning_runs_finished_consistency'
    `);
    assert.equal(rows.length, 1, 'a constraint precisa existir');

    const noBanco = [...rows[0].definicao.matchAll(/'([a-z]+)'::/g)].map((m) => m[1]).sort();
    const noTypeScript = PROVISIONING_STATUSES.filter(isTerminal).sort();

    assertSameSet(noTypeScript, noBanco, 'estados terminais');
  });
});
