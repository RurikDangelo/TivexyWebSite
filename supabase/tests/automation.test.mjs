/**
 * Testes do esquema de automações.
 *
 * A decisão de casar evento com regra é testada no Core, em milissegundos.
 * Aqui fica o que só o banco garante:
 *
 *   1. Isolamento entre tenants, como toda tabela de negócio.
 *   2. **Regra sem ação não pode ser salva** — regra que não faz nada é a
 *      ilusão de automação, o pior defeito possível neste módulo.
 *   3. **O histórico não se edita nem se apaga**, e sobrevive à regra.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { addMember, asUser, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
const fx = {};

async function criar(tabela, valores) {
  const colunas = Object.keys(valores);
  const params = colunas.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query(
    `insert into public.${tabela} (${colunas.join(', ')}) values (${params.join(', ')}) returning id`,
    Object.values(valores),
  );
  return rows[0].id;
}

/** Uma ação válida, em jsonb. `::text::jsonb` pela armadilha dos drivers. */
const AGENDAR = JSON.stringify([
  { kind: 'crm.activity.create', params: { subject: 'Ligar', dueInDays: '1' } },
]);

async function criarRegra(tenantId, sobrepor = {}) {
  const valores = {
    tenant_id: tenantId,
    name: 'Regra',
    event: 'crm.lead.created',
    actions: AGENDAR,
    ...sobrepor,
  };
  const colunas = Object.keys(valores);
  const params = colunas.map((_, i) =>
    colunas[i] === 'actions' || colunas[i] === 'conditions'
      ? `$${i + 1}::text::jsonb`
      : `$${i + 1}`,
  );
  const { rows } = await db.query(
    `insert into public.automation_rules (${colunas.join(', ')}) values (${params.join(', ')}) returning id`,
    Object.values(valores),
  );
  return rows[0].id;
}

before(async () => {
  db = await createDatabase();

  fx.tenantA = await createTenant(db, { slug: 'aurora-auto', name: 'Aurora' });
  fx.tenantB = await createTenant(db, { slug: 'base-auto', name: 'Base' });

  fx.adminA = await createUser(db, { email: 'admin@aurora.auto', fullName: 'Admin A' });
  fx.adminB = await createUser(db, { email: 'admin@base.auto', fullName: 'Admin B' });
  await addMember(db, { tenantId: fx.tenantA, userId: fx.adminA, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenantB, userId: fx.adminB, roleCode: 'tenant_admin' });

  for (const [lado, tenant] of [
    ['A', fx.tenantA],
    ['B', fx.tenantB],
  ]) {
    fx[`regra${lado}`] = await criarRegra(tenant, { name: `Regra ${lado}` });
    fx[`disparo${lado}`] = await criar('automation_runs', {
      tenant_id: tenant,
      rule_id: fx[`regra${lado}`],
      rule_name: `Regra ${lado}`,
      event: 'crm.lead.created',
      succeeded: true,
    });
  }
});

after(async () => {
  await db?.close?.();
});

/* ── 1. Isolamento ─────────────────────────────────────────────────────── */

describe('isolamento entre tenants', () => {
  for (const tabela of ['automation_rules', 'automation_runs']) {
    it(`${tabela} só devolve linhas do próprio tenant`, async () => {
      const { rows } = await asUser(db, fx.adminA, () =>
        db.query(`select tenant_id from public.${tabela}`),
      );
      assert.ok(rows.length > 0, 'o cenário precisa ter linha para separar');
      for (const linha of rows) {
        assert.equal(linha.tenant_id, fx.tenantA, `${tabela} vazou linha de outro tenant`);
      }
    });
  }

  it('a regra não aponta para outro tenant no histórico', async () => {
    await assert.rejects(
      criar('automation_runs', {
        tenant_id: fx.tenantA,
        rule_id: fx.regraB,
        rule_name: 'Emprestada',
        event: 'crm.lead.created',
        succeeded: true,
      }),
      /rule_do_tenant/,
    );
  });
});

/* ── 2. O que o esquema recusa ─────────────────────────────────────────── */

describe('o que o esquema recusa', () => {
  it('regra sem ação nenhuma', async () => {
    /*
     * Regra que não faz nada é a ilusão de automação: a pessoa a cria, para
     * de fazer à mão, e nada acontece. Deixar salvar seria o pior defeito
     * possível neste módulo.
     */
    await assert.rejects(criarRegra(fx.tenantA, { name: 'Vazia', actions: '[]' }), /has_action/);
  });

  it('condições que não são array', async () => {
    // A aplicação percorre `conditions` num laço. `{}` ali quebraria num
    // lugar que não tem como se defender sem desconfiar do banco.
    await assert.rejects(
      criarRegra(fx.tenantA, { name: 'Torta', conditions: '{}' }),
      /conditions_array/,
    );
  });

  it('gatilho fora do formato `modulo.recurso.acao`', async () => {
    await assert.rejects(
      criarRegra(fx.tenantA, { name: 'Solta', event: 'qualquer' }),
      /event_format/,
    );
  });

  it('duas regras com o mesmo nome no mesmo tenant', async () => {
    await assert.rejects(criarRegra(fx.tenantA, { name: 'Regra A' }), /name_unique|duplicate key/i);
  });

  it('o mesmo nome em tenants diferentes é permitido', async () => {
    // Cada cliente nomeia as regras dele; colidir entre clientes seria
    // vazamento de vocabulário.
    const id = await criarRegra(fx.tenantB, { name: 'Regra A' });
    assert.ok(id);
  });

  it('disparo que diz ter dado certo e traz erro', async () => {
    await assert.rejects(
      criar('automation_runs', {
        tenant_id: fx.tenantA,
        rule_name: 'Contraditória',
        event: 'crm.lead.created',
        succeeded: true,
        error: 'mas deu errado',
      }),
      /error_consistency/,
    );
  });

  it('disparo que diz ter falhado e não diz por quê', async () => {
    // Falha sem motivo registrado é o mesmo que falha em silêncio.
    await assert.rejects(
      criar('automation_runs', {
        tenant_id: fx.tenantA,
        rule_name: 'Muda',
        event: 'crm.lead.created',
        succeeded: false,
      }),
      /error_consistency/,
    );
  });
});

/* ── 3. O histórico ────────────────────────────────────────────────────── */

describe('o histórico de automação', () => {
  it('a aplicação não edita nem apaga', async () => {
    /*
     * Exercitado **como usuário**, e não com a conexão dona: a garantia que
     * importa é "a aplicação não consegue", e é `authenticated` que a
     * aplicação usa.
     *
     * A primeira versão usava gatilho e era testada com o dono. Passava, e
     * escondia um defeito: o gatilho bloqueava também as ações referenciais
     * do Postgres, e apagar um cliente falharia. Ver a migration.
     */
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('update public.automation_runs set succeeded = false where id = $1', [
          fx.disparoA,
        ]),
      ),
      /permission denied/i,
    );
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('delete from public.automation_runs where id = $1', [fx.disparoA]),
      ),
      /permission denied/i,
    );
  });

  it('sobrevive à regra ser apagada, e continua legível', async () => {
    /*
     * `set null` no `rule_id`, e o nome gravado à parte. Sem o nome, apagar a
     * regra deixaria o histórico com uma linha órfã que não responde "o que
     * criou isso na minha agenda?" — que é a pergunta inteira deste módulo.
     */
    const regra = await criarRegra(fx.tenantA, { name: 'Efêmera' });
    const disparo = await criar('automation_runs', {
      tenant_id: fx.tenantA,
      rule_id: regra,
      rule_name: 'Efêmera',
      event: 'crm.lead.created',
      succeeded: true,
    });

    await db.query('delete from public.automation_rules where id = $1', [regra]);

    const { rows } = await db.query(
      'select rule_id, rule_name, tenant_id from public.automation_runs where id = $1',
      [disparo],
    );
    assert.equal(rows.length, 1, 'o histórico sumiu com a regra');
    assert.equal(rows[0].rule_id, null);
    assert.equal(rows[0].rule_name, 'Efêmera', 'o histórico ficou ilegível');
    assert.equal(rows[0].tenant_id, fx.tenantA, 'o tenant foi anulado junto com a regra');
  });

  it('apagar o tenant leva regras e histórico junto', async () => {
    const tenant = await createTenant(db, { slug: 'efemero-auto', name: 'Efêmero' });
    const regra = await criarRegra(tenant, { name: 'Some' });
    await criar('automation_runs', {
      tenant_id: tenant,
      rule_id: regra,
      rule_name: 'Some',
      event: 'crm.lead.created',
      succeeded: true,
    });

    await db.query('delete from public.tenants where id = $1', [tenant]);

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.automation_rules where tenant_id = $1) as regras,
         (select count(*)::int from public.automation_runs where tenant_id = $1) as disparos`,
      [tenant],
    );
    assert.equal(rows[0].regras, 0);
    assert.equal(rows[0].disparos, 0);
  });
});
