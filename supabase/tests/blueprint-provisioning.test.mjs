/**
 * Provisionamento a partir de Blueprint — o marco do ADR-003.
 *
 * A pergunta que este arquivo responde: **dois nichos diferentes produzem
 * tenants diferentes, e diferentes só no que o blueprint declara?** Se a
 * resposta fosse não, o Blueprint não estaria configurando nada e seria um
 * plano com outro nome.
 *
 * Roda contra os blueprints **reais** do repositório, não contra documentos de
 * teste: um nicho que quebrasse o provisionamento precisa falhar aqui, não em
 * produção com um tenant pela metade.
 *
 * **A decisão não é modelo — é o Core.** `planProvisioning`, de `@tivexy/core`,
 * diz o que fazer; este arquivo só executa a lista. O que ainda é modelo é o
 * executor: a produção vai escrever com `service_role` e falar com serviços que
 * o teste não tem. Mas a regra — a ordem, a validação, a recusa por plano — é a
 * mesma que vai rodar em produção, e é isso que este teste exercita.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBlueprint } from '../../packages/core/src/blueprint.ts';
import { planProvisioning } from '../../packages/core/src/provisioning-plan.ts';
import { createDatabase, createUser } from './harness.mjs';

const DIR = fileURLToPath(new URL('../../packages/core/blueprints/', import.meta.url));

/** Os blueprints do repositório, já validados. */
const nichos = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const r = checkBlueprint(JSON.parse(readFileSync(join(DIR, f), 'utf8')));
      assert.equal(r.valid, true, `${f} inválido — veja packages/core/src/blueprints.test.ts`);
      return [r.blueprint.code, r.blueprint];
    }),
);

let db;
let superAdmin;

// ─────────────────────────────────────────────────────────────────────────
// Modelo do provisionador guiado por blueprint
// ─────────────────────────────────────────────────────────────────────────

/**
 * Os módulos que o plano contratado inclui.
 *
 * Existe para responder uma pergunta que o `checkBlueprint` não pode responder
 * sozinho: ele valida o documento contra o catálogo, mas não sabe qual plano
 * inclui quais módulos — isso é dado do banco.
 */
async function modulosDoPlano(db, planCode) {
  const { rows } = await db.query(
    `select m.code
     from public.plan_modules pm
     join public.plans p on p.id = pm.plan_id
     join public.modules m on m.id = pm.module_id
     where p.code = $1`,
    [planCode],
  );
  return new Set(rows.map((r) => r.code));
}

/**
 * Provisiona um tenant a partir de um blueprint.
 *
 * O que decide **o que** fazer é `planProvisioning`, de `@tivexy/core`. Esta
 * função só **executa** a lista que ele devolve — não tem regra própria, nem
 * ordem própria, nem validação própria.
 *
 * Essa separação é o ponto. Enquanto a lógica vivia aqui dentro, o que rodava
 * no teste era um modelo paralelo ao que a produção teria que escrever de novo,
 * e os dois podiam divergir sem ninguém notar. Agora o teste prova que **o
 * plano do Core** funciona contra Postgres de verdade.
 */
async function executarPlano(db, operacoes, { blueprint, idempotencyKey }) {
  let tenantId = null;
  let runId = null;
  const pendentes = [];

  for (const op of operacoes) {
    switch (op.kind) {
      case 'create_tenant': {
        const { rows } = await db.query(
          `insert into public.tenants (slug, name, status, plan_id, settings)
           values ($1, $2, 'provisioning', (select id from public.plans where code = $3), $4)
           returning id`,
          [op.slug, op.name, op.plan, JSON.stringify(op.settings)],
        );
        tenantId = rows[0].id;

        const run = await db.query(
          `insert into public.provisioning_runs (tenant_id, idempotency_key, payload, requested_by, status, started_at)
           values ($1, $2, $3, $4, 'running', now())
           returning id`,
          [
            tenantId,
            idempotencyKey,
            // De qual blueprint e versão este tenant nasceu. Sem isto, a
            // pergunta "com que configuração ele foi criado?" vira adivinhação
            // assim que o documento mudar.
            JSON.stringify({ blueprint: { code: blueprint.code, version: blueprint.version } }),
            superAdmin,
          ],
        );
        runId = run.rows[0].id;
        break;
      }

      case 'enable_module':
        await db.query(
          `insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
           select $1, m.id, true, now() from public.modules m where m.code = $2`,
          [tenantId, op.module],
        );
        break;

      case 'create_role': {
        const { rows } = await db.query(
          `insert into public.roles (tenant_id, code, name, is_system)
           values ($1, $2, $3, false) returning id`,
          [tenantId, op.code, op.name],
        );
        await db.query(
          `insert into public.role_permissions (role_id, permission_id)
           select $1, p.id from public.permissions p where p.code = any($2::text[])`,
          [rows[0].id, [...op.permissions]],
        );
        break;
      }

      case 'create_admin': {
        const userId = await createUser(db, { email: op.email, fullName: op.fullName });
        await db.query(
          `insert into public.tenant_users (tenant_id, user_id, role_id, status)
           values ($1, $2, (select id from public.roles where code = $3 and tenant_id is null), 'invited')`,
          [tenantId, userId, op.role],
        );
        break;
      }

      case 'seed':
        // Não aplicada: `crm.pipelines` e `erp.product_categories` não
        // existem, porque os módulos de negócio não foram construídos.
        // Fingir que semeou é exatamente o que este projeto proíbe.
        pendentes.push({ entity: op.entity, values: op.values });
        break;

      case 'invite':
        await db.query(
          `insert into public.audit_logs (tenant_id, action, resource_type, resource_id, metadata)
           values ($1, 'tenant.provisioned', 'tenant', $2, $3)`,
          [tenantId, tenantId, JSON.stringify({ email: op.email, blueprint: blueprint.code })],
        );
        break;

      default:
        throw new Error(`operação desconhecida no plano: ${op.kind}`);
    }
  }

  await db.query(
    `insert into public.provisioning_steps (run_id, step, position, status, result, finished_at)
     values ($1, 'seed_defaults', 1, 'skipped', $2, now())`,
    [
      runId,
      JSON.stringify({
        pending: pendentes,
        reason: 'módulos de negócio ainda não têm tabela — ver docs/PROJECT_STATE.md',
      }),
    ],
  );

  await db.query(
    `update public.provisioning_runs set status = 'succeeded', finished_at = now() where id = $1`,
    [runId],
  );
  await db.query(`update public.tenants set status = 'active' where id = $1`, [tenantId]);

  return { tenantId, runId };
}

/** Planeja com o Core e executa. A recusa acontece antes de qualquer escrita. */
async function provisionarPorBlueprint(db, { blueprint, slug, name, admin, idempotencyKey }) {
  const plano = planProvisioning({
    blueprint,
    planModules: [...(await modulosDoPlano(db, blueprint.plan))],
    slug,
    name,
    admin: { email: admin.email, fullName: admin.name },
  });

  if (!plano.ok) {
    throw new Error(plano.problems.map((p) => `${p.path}: ${p.message}`).join('; '));
  }

  return executarPlano(db, plano.operations, { blueprint, idempotencyKey });
}

/** O que um tenant de fato recebeu, para comparar entre nichos. */
async function retrato(db, tenantId) {
  const { rows } = await db.query(
    `select
       (select array_agg(m.code order by m.code)
          from public.tenant_modules tm join public.modules m on m.id = tm.module_id
         where tm.tenant_id = $1 and tm.is_enabled) as modulos,
       (select array_agg(r.code order by r.code)
          from public.roles r where r.tenant_id = $1) as papeis,
       (select p.code from public.plans p join public.tenants t on t.plan_id = p.id
         where t.id = $1) as plano,
       (select t.settings from public.tenants t where t.id = $1) as settings,
       (select t.status::text from public.tenants t where t.id = $1) as status`,
    [tenantId],
  );
  return rows[0];
}

const admin = (n) => ({ email: `admin${n}@exemplo.com.br`, name: `Admin ${n}` });

// ─────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db?.close();
  db = await createDatabase();
  superAdmin = await createUser(db, { email: 'equipe@tivexy.com.br', isSuperAdmin: true });
});

after(async () => {
  await db?.close();
});

describe('cada nicho do repositório provisiona', () => {
  for (const [code, blueprint] of Object.entries(nichos)) {
    it(code, async () => {
      const { tenantId } = await provisionarPorBlueprint(db, {
        blueprint,
        slug: code,
        name: blueprint.name,
        admin: admin(1),
        idempotencyKey: `req-${code}`,
      });

      const r = await retrato(db, tenantId);
      assert.equal(r.status, 'active');
      assert.deepEqual(r.modulos, [...blueprint.modules].sort(), 'módulos do blueprint');
      assert.deepEqual(
        r.papeis ?? [],
        blueprint.roles.map((p) => p.code).sort(),
        'papéis do blueprint',
      );
      assert.equal(r.plano, blueprint.plan);
      assert.deepEqual(r.settings, blueprint.settings);
    });
  }
});

describe('o marco do ADR-003', () => {
  it('nichos diferentes produzem tenants diferentes', async () => {
    const cafeteria = nichos['cafeteria'];
    const clinica = nichos['clinica-odontologica'];
    assert.ok(cafeteria && clinica, 'este teste depende dos dois nichos existirem');

    const a = await provisionarPorBlueprint(db, {
      blueprint: cafeteria,
      slug: 'cafe-do-centro',
      name: 'Café do Centro',
      admin: admin(1),
      idempotencyKey: 'req-cafe',
    });
    const b = await provisionarPorBlueprint(db, {
      blueprint: clinica,
      slug: 'sorriso-claro',
      name: 'Sorriso Claro',
      admin: admin(2),
      idempotencyKey: 'req-clinica',
    });

    const ra = await retrato(db, a.tenantId);
    const rb = await retrato(db, b.tenantId);

    assert.notDeepEqual(ra.modulos, rb.modulos, 'os módulos precisam divergir');
    assert.notDeepEqual(ra.papeis, rb.papeis, 'os papéis precisam divergir');

    // E a diferença é exatamente a declarada — nada a mais, nada a menos.
    assert.deepEqual(ra.modulos, [...cafeteria.modules].sort());
    assert.deepEqual(rb.modulos, [...clinica.modules].sort());
  });

  it('a diferença vem só do blueprint, não do código', async () => {
    // Provisionar o mesmo nicho duas vezes precisa dar o mesmo resultado. Se
    // divergisse, haveria decisão fora do documento — e o nicho deixaria de
    // ser reproduzível.
    const bp = nichos['cafeteria'];
    const a = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'cafe-um',
      name: 'Café Um',
      admin: admin(1),
      idempotencyKey: 'req-um',
    });
    const b = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'cafe-dois',
      name: 'Café Dois',
      admin: admin(2),
      idempotencyKey: 'req-dois',
    });

    const ra = await retrato(db, a.tenantId);
    const rb = await retrato(db, b.tenantId);
    assert.deepEqual(ra.modulos, rb.modulos);
    assert.deepEqual(ra.papeis, rb.papeis);
    assert.deepEqual(ra.settings, rb.settings);
  });
});

describe('o blueprint não passa por cima do comercial', () => {
  it('recusa habilitar módulo fora do plano', async () => {
    // Cortesia existe e é legítima — mas é decisão comercial explícita e
    // auditada, não algo que um documento de nicho concede em silêncio para
    // todo cliente daquele nicho.
    const abusivo = {
      ...nichos['cafeteria'],
      plan: 'essencial',
      modules: ['core', 'crm', 'erp', 'inventory', 'finance', 'fiscal', 'ai'],
    };

    await assert.rejects(
      () =>
        provisionarPorBlueprint(db, {
          blueprint: abusivo,
          slug: 'abusivo',
          name: 'Abusivo',
          admin: admin(1),
          idempotencyKey: 'req-abusivo',
        }),
      /"ai" não está no plano "essencial"/,
    );
  });

  it('e nada fica pela metade quando recusa', async () => {
    const abusivo = { ...nichos['cafeteria'], plan: 'essencial', modules: ['core', 'ai'] };
    await provisionarPorBlueprint(db, {
      blueprint: abusivo,
      slug: 'nao-deve-existir',
      name: 'X',
      admin: admin(1),
      idempotencyKey: 'req-x',
    }).catch(() => {});

    const { rows } = await db.query('select count(*)::int as c from public.tenants');
    assert.equal(rows[0].c, 0, 'a recusa acontece antes de criar o tenant');
  });
});

describe('os papéis do nicho valem de verdade', () => {
  it('o papel criado carrega exatamente as permissões declaradas', async () => {
    const bp = nichos['clinica-odontologica'];
    const { tenantId } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'clinica-teste',
      name: 'Clínica Teste',
      admin: admin(1),
      idempotencyKey: 'req-papeis',
    });

    for (const papel of bp.roles) {
      const { rows } = await db.query(
        `select array_agg(p.code order by p.code) as codigos
         from public.roles r
         join public.role_permissions rp on rp.role_id = r.id
         join public.permissions p on p.id = rp.permission_id
         where r.tenant_id = $1 and r.code = $2`,
        [tenantId, papel.code],
      );
      assert.deepEqual(rows[0].codigos, [...papel.permissions].sort(), `papel ${papel.code}`);
    }
  });

  it('o papel do nicho pertence ao tenant, não à plataforma', async () => {
    // Papel com `tenant_id` nulo é papel de sistema, disponível para todo
    // mundo. Um papel de nicho vazando para a plataforma daria "Barista" a
    // uma clínica.
    const { tenantId } = await provisionarPorBlueprint(db, {
      blueprint: nichos['cafeteria'],
      slug: 'cafe-escopo',
      name: 'Café Escopo',
      admin: admin(1),
      idempotencyKey: 'req-escopo',
    });

    const { rows } = await db.query(
      `select count(*)::int as c from public.roles
       where tenant_id is null and code in ('barista', 'gerente_de_loja')`,
    );
    assert.equal(rows[0].c, 0, 'papel de nicho não pode virar papel de sistema');

    const meus = await db.query(
      'select count(*)::int as c from public.roles where tenant_id = $1',
      [tenantId],
    );
    assert.equal(meus.rows[0].c, 2);
  });
});

describe('o que não foi aplicado fica registrado, não escondido', () => {
  it('as sementes de negócio ficam pendentes, com o motivo', async () => {
    // Os módulos de negócio não têm tabela ainda. Registrar como pendente é a
    // única alternativa honesta a fingir que semeou.
    const bp = nichos['clinica-odontologica'];
    const { runId } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'clinica-sementes',
      name: 'Clínica Sementes',
      admin: admin(1),
      idempotencyKey: 'req-sementes',
    });

    const { rows } = await db.query(
      `select status::text as status, result from public.provisioning_steps
       where run_id = $1 and step = 'seed_defaults'`,
      [runId],
    );
    assert.equal(rows[0].status, 'skipped', 'não foi executada — e diz isso');
    assert.equal(rows[0].result.pending.length, bp.seeds.length, 'nenhuma semente se perde');
    assert.match(rows[0].result.reason, /tabela/, 'o motivo precisa estar registrado');
  });

  it('a execução guarda de qual blueprint e versão o tenant nasceu', async () => {
    const bp = nichos['cafeteria'];
    const { runId } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'cafe-versao',
      name: 'Café Versão',
      admin: admin(1),
      idempotencyKey: 'req-versao',
    });

    const { rows } = await db.query('select payload from public.provisioning_runs where id = $1', [
      runId,
    ]);
    assert.deepEqual(rows[0].payload.blueprint, { code: bp.code, version: bp.version });
  });
});
