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
 * **Nada aqui é modelo.** `planProvisioning` decide, `executeProvisioning`
 * escreve — os dois são o código de produção, importados como estão. Este
 * arquivo só liga um ao outro e confere o resultado. Enquanto o executor vivia
 * aqui dentro, o que rodava no teste era uma segunda implementação que a
 * produção teria que escrever de novo, e as duas podiam divergir sem aviso.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compensateProvisioning,
  executeProvisioning,
  resumeProvisioning,
} from '../../apps/web/src/server/provisioning/execute.ts';
import { checkBlueprint } from '../../packages/core/src/blueprint.ts';
import { planProvisioning } from '../../packages/core/src/provisioning-plan.ts';
import { PROVISIONING_STEPS } from '../../packages/core/src/provisioning.ts';
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
 * A identidade, sobre o harness.
 *
 * Em produção isto é a Auth Admin API do Supabase. Aqui insere em `auth.users`
 * e deixa o gatilho `mirror_auth_user` criar o perfil — o mesmo caminho.
 *
 * `created` importa para a compensação: quem já existia administra outro
 * cliente, e apagá-la tiraria o acesso dela a algo que nada tem a ver com a
 * falha.
 */
function identidadeDoHarness(db) {
  return {
    async ensureUser({ email, fullName }) {
      const { rows } = await db.query(
        'select id from public.users where lower(email) = lower($1)',
        [email],
      );
      if (rows.length > 0) return { id: rows[0].id, created: false };
      return { id: await createUser(db, { email, fullName }), created: true };
    },

    async deleteUser(id) {
      // Apagar em `auth.users` leva `public.users` por cascata, que é como o
      // Supabase se comporta ao remover uma conta.
      await db.query('delete from auth.users where id = $1', [id]);
    },
  };
}

/**
 * Planeja com o Core e executa com o executor de produção.
 *
 * Nenhuma linha de lógica de provisionamento mora neste arquivo. O que decide
 * é `planProvisioning`; o que escreve é `executeProvisioning`, o mesmo módulo
 * que vai rodar no servidor. O teste existe para provar **esses dois**, não uma
 * terceira versão parecida com eles.
 */
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

  const r = await executeProvisioning(db, identidadeDoHarness(db), {
    operations: plano.operations,
    blueprint: { code: blueprint.code, version: blueprint.version },
    idempotencyKey,
    requestedBy: superAdmin,
  });

  if (!r.ok) throw new Error(`${r.failedStep}: ${r.error}`);
  return { tenantId: r.tenantId, runId: r.runId, pendingSeeds: r.pendingSeeds, reused: r.reused };
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
  it('o vocabulário do nicho é gravado no tenant', async () => {
    /*
     * O Blueprint sempre pôde traduzir rótulos, e nada gravava: o tenant
     * nascia com módulos, papéis e sementes do nicho, e sem o vocabulário.
     * A falta não dava erro — a interface só mostrava o nome genérico.
     */
    const bp = nichos['clinica-odontologica'];
    const { tenantId } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'clinica-vocabulario',
      name: 'Clínica Vocabulário',
      admin: admin(4),
      idempotencyKey: 'req-vocabulario',
    });

    const { rows } = await db.query('select terms from public.tenants where id = $1', [tenantId]);

    assert.deepEqual(
      rows[0].terms,
      bp.terms,
      'o que foi gravado precisa ser o que o nicho declara',
    );
    assert.ok(Object.keys(rows[0].terms).length > 0, 'a clínica declara vocabulário');
  });

  it('as sementes de CRM viram linha de verdade', async () => {
    // Este teste dizia o contrário até o CRM existir: as sementes ficavam
    // pendentes porque não havia tabela. A mudança de resposta é o marco.
    const bp = nichos['clinica-odontologica'];
    const { runId, tenantId } = await provisionarPorBlueprint(db, {
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
    assert.equal(rows[0].status, 'succeeded', 'a etapa executou');

    const funis = await db.query(
      'select name, is_default from public.crm_pipelines where tenant_id = $1',
      [tenantId],
    );
    assert.equal(funis.rows.length, 1);
    assert.equal(funis.rows[0].name, 'Tratamentos');
    assert.equal(funis.rows[0].is_default, true);

    // As etapas citam o funil pelo nome; resolver isso é do executor.
    const etapas = await db.query(
      `select s.name, s.position from public.crm_pipeline_stages s
       join public.crm_pipelines p on p.id = s.pipeline_id
       where s.tenant_id = $1 and p.name = 'Tratamentos'
       order by s.position`,
      [tenantId],
    );
    assert.deepEqual(
      etapas.rows.map((r) => r.name),
      ['Avaliação', 'Orçamento enviado', 'Aprovado', 'Em tratamento', 'Concluído', 'Não aprovado'],
    );

    // O funil precisa de por onde sair: sem ganho, nenhum negócio fecha;
    // sem perda, não há onde registrar quem não comprou.
    const saidas = await db.query(
      `select kind::text, count(*)::int as n from public.crm_pipeline_stages
       where tenant_id = $1 group by kind order by kind`,
      [tenantId],
    );
    const porTipo = Object.fromEntries(saidas.rows.map((r) => [r.kind, r.n]));
    assert.equal(porTipo.won, 1, 'o funil precisa de etapa de ganho');
    assert.equal(porTipo.lost, 1, 'o funil precisa de etapa de perda');

    const tipos = await db.query(
      'select name from public.crm_activity_types where tenant_id = $1 order by name',
      [tenantId],
    );
    assert.deepEqual(
      tipos.rows.map((r) => r.name),
      ['Consulta', 'Retorno', 'Urgência'],
    );
  });

  it('as sementes de ERP viram linha de verdade', async () => {
    /*
     * Até 25/09/2026 este teste afirmava o contrário — "as sementes de ERP
     * continuam pendentes, com o motivo" —, porque o ERP não tinha tabela. As
     * tabelas nasceram, as entidades entraram em `TABELA_DA_SEMENTE`, e o
     * teste antigo falhou como devia: a resposta mudou, e o teste certo é
     * este. O que ele protegia continua protegido no seguinte.
     */
    const bp = nichos['mercado'];
    const { runId, tenantId, pendingSeeds } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'mercado-sementes',
      name: 'Mercado Sementes',
      admin: admin(2),
      idempotencyKey: 'req-sementes-erp',
    });

    const { rows } = await db.query(
      `select status::text as status from public.provisioning_steps
       where run_id = $1 and step = 'seed_defaults'`,
      [runId],
    );
    assert.equal(rows[0].status, 'succeeded');
    assert.deepEqual(pendingSeeds, []);

    const categorias = await db.query(
      'select name from public.erp_product_categories where tenant_id = $1 order by position',
      [tenantId],
    );
    assert.deepEqual(
      categorias.rows.map((r) => r.name),
      ['Hortifruti', 'Mercearia', 'Frios e laticínios', 'Bebidas', 'Limpeza', 'Higiene'],
    );

    // O prazo sai do código da forma quando o nicho não declara: crédito cai
    // em 30 dias, Pix na hora. É configuração, e a tela de vendas deixa mudar.
    const formas = await db.query(
      `select name, code, settlement_days from public.erp_payment_methods
       where tenant_id = $1 order by name`,
      [tenantId],
    );
    assert.deepEqual(
      formas.rows.map((r) => [r.code, r.settlement_days]),
      [
        ['credit', 30],
        ['debit', 1],
        ['cash', 0],
        ['pix', 0],
        ['voucher', 30],
      ],
    );
  });

  it('entidade que ainda não tem tabela continua pendente, com o motivo', async () => {
    // Um nicho que declare fornecedores — `erp.suppliers` é permissão, e ainda
    // não é tabela. Registrar como pendente é a única alternativa honesta a
    // fingir que semeou.
    const bp = {
      ...nichos['mercado'],
      code: 'mercado-com-fornecedor',
      seeds: [
        ...nichos['mercado'].seeds,
        { entity: 'erp.suppliers', values: { name: 'Distribuidora Central' } },
      ],
    };
    const { runId, pendingSeeds } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'mercado-fornecedor',
      name: 'Mercado Fornecedor',
      admin: admin(5),
      idempotencyKey: 'req-sementes-pendentes',
    });

    assert.deepEqual(
      pendingSeeds.map((s) => s.entity),
      ['erp.suppliers'],
      'só a que não tem tabela fica pendente — e nenhuma se perde',
    );

    const { rows } = await db.query(
      `select status::text as status, result from public.provisioning_steps
       where run_id = $1 and step = 'seed_defaults'`,
      [runId],
    );
    assert.equal(rows[0].status, 'succeeded', 'o que tinha tabela foi aplicado');
    assert.equal(rows[0].result.pending.length, 1);
    assert.match(rows[0].result.reason, /tabela/, 'o motivo precisa estar registrado');
  });

  it('desfazer remove as linhas que a semente criou', async () => {
    const bp = nichos['clinica-odontologica'];
    const { tenantId } = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'clinica-desfaz',
      name: 'Clínica Desfaz',
      admin: admin(3),
      idempotencyKey: 'req-sementes-desfaz',
    });

    const antes = await db.query(
      'select count(*)::int as n from public.crm_pipeline_stages where tenant_id = $1',
      [tenantId],
    );
    assert.ok(antes.rows[0].n > 0, 'o cenário depende de haver semente aplicada');

    // Falhar de propósito depois de semear, para haver o que compensar.
    await db.query(
      `update public.provisioning_runs set status = 'failed', finished_at = now()
       where idempotency_key = 'req-sementes-desfaz'`,
    );
    const r = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-sementes-desfaz',
    });
    assert.equal(r.ok, true, r.ok ? '' : r.error);

    for (const tabela of ['crm_pipelines', 'crm_pipeline_stages', 'crm_activity_types']) {
      const { rows } = await db.query(
        `select count(*)::int as n from public.${tabela} where tenant_id = $1`,
        [tenantId],
      );
      assert.equal(rows[0].n, 0, `${tabela} sobreviveu ao desfazer`);
    }
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

describe('o executor: garantias que só aparecem escrevendo', () => {
  it('a mesma chave devolve a execução existente e não escreve de novo', async () => {
    const bp = nichos['cafeteria'];
    const primeira = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'cafe-idem',
      name: 'Café',
      admin: admin(1),
      idempotencyKey: 'req-mesma-chave',
    });
    assert.equal(primeira.reused, false);

    const segunda = await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'cafe-idem-2',
      name: 'Outro nome',
      admin: admin(2),
      idempotencyKey: 'req-mesma-chave',
    });

    assert.equal(segunda.reused, true);
    assert.equal(segunda.tenantId, primeira.tenantId);

    const { rows } = await db.query('select count(*)::int as c from public.tenants');
    assert.equal(rows[0].c, 1, 'repetir a requisição não pode criar outro cliente');
  });

  it('registra uma linha por etapa do fluxo, sem faltar nenhuma', async () => {
    // É o que permite responder "onde parou?" sem ler log, e o que a retomada
    // consulta para saber o que pular.
    const { runId } = await provisionarPorBlueprint(db, {
      blueprint: nichos['cafeteria'],
      slug: 'cafe-etapas',
      name: 'Café',
      admin: admin(1),
      idempotencyKey: 'req-etapas',
    });

    const { rows } = await db.query(
      'select step from public.provisioning_steps where run_id = $1 order by position',
      [runId],
    );
    assert.deepEqual(
      rows.map((r) => r.step),
      [...PROVISIONING_STEPS],
    );
  });

  it('a etapa sem operação própria fica "skipped", não "pending" para sempre', async () => {
    // `apply_plan` entra junto com o tenant, numa escrita só. Deixá-la
    // `pending` diria "faltou fazer" sobre algo que já está feito.
    const { runId } = await provisionarPorBlueprint(db, {
      blueprint: nichos['cafeteria'],
      slug: 'cafe-plano',
      name: 'Café',
      admin: admin(1),
      idempotencyKey: 'req-plano',
    });

    const { rows } = await db.query(
      `select status::text as status from public.provisioning_steps
       where run_id = $1 and step = 'apply_plan'`,
      [runId],
    );
    assert.equal(rows[0].status, 'skipped');

    const pendentes = await db.query(
      `select count(*)::int as c from public.provisioning_steps
       where run_id = $1 and status = 'pending'`,
      [runId],
    );
    assert.equal(pendentes.rows[0].c, 0, 'execução concluída não deixa etapa pendente');
  });

  it('uma falha no meio para o fluxo e o cliente não vira ativo', async () => {
    // A identidade falhando é o caso realista: a Auth API fora do ar, e-mail
    // recusado. O tenant já existe a essa altura — e precisa ficar em
    // `provisioning`, que é honesto: existe e não opera.
    const bp = nichos['cafeteria'];
    const plano = planProvisioning({
      blueprint: bp,
      planModules: [...(await modulosDoPlano(db, bp.plan))],
      slug: 'cafe-falha',
      name: 'Café',
      admin: { email: 'dono@cafe.com.br', fullName: 'Dono' },
    });
    assert.equal(plano.ok, true);

    const identidadeQuebrada = {
      async ensureUser() {
        throw new Error('Auth indisponível');
      },
      async deleteUser() {},
    };

    const r = await executeProvisioning(db, identidadeQuebrada, {
      operations: plano.operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-falha-auth',
      requestedBy: superAdmin,
    });

    assert.equal(r.ok, false);
    assert.equal(r.failedStep, 'create_admin');
    assert.match(r.error, /Auth indisponível/);

    const { rows } = await db.query(
      `select
         (select t.status::text from public.tenants t where t.id = $1) as tenant,
         (select pr.status::text from public.provisioning_runs pr where pr.id = $2) as execucao,
         (select ps.status::text from public.provisioning_steps ps
           where ps.run_id = $2 and ps.step = 'create_admin') as etapa,
         (select ps.status::text from public.provisioning_steps ps
           where ps.run_id = $2 and ps.step = 'send_invite') as depois`,
      [r.tenantId, r.runId],
    );
    const [c] = rows;
    assert.equal(c.tenant, 'provisioning', 'cliente que falhou não pode operar');
    assert.equal(c.execucao, 'failed');
    assert.equal(c.etapa, 'failed');
    assert.equal(c.depois, 'pending', 'o que veio depois nem chegou a rodar');
  });

  it('o que já tinha sido escrito antes da falha continua lá', async () => {
    // Não é sujeira: é o que a retomada aproveita e o que a compensação
    // desfaz. Apagar no meio perderia a evidência de onde parou.
    const bp = nichos['cafeteria'];
    const plano = planProvisioning({
      blueprint: bp,
      planModules: [...(await modulosDoPlano(db, bp.plan))],
      slug: 'cafe-parcial',
      name: 'Café',
      admin: { email: 'dono@cafe.com.br', fullName: 'Dono' },
    });
    assert.equal(plano.ok, true);

    const r = await executeProvisioning(
      db,
      {
        async ensureUser() {
          throw new Error('parou aqui');
        },
        async deleteUser() {},
      },
      {
        operations: plano.operations,
        blueprint: { code: bp.code, version: bp.version },
        idempotencyKey: 'req-parcial',
        requestedBy: superAdmin,
      },
    );
    assert.equal(r.ok, false);

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.tenant_modules where tenant_id = $1) as modulos,
         (select count(*)::int from public.roles where tenant_id = $1) as papeis,
         (select count(*)::int from public.tenant_users where tenant_id = $1) as membros`,
      [r.tenantId],
    );
    const [c] = rows;
    assert.equal(c.modulos, bp.modules.length, 'os módulos já habilitados ficam');
    assert.equal(c.papeis, bp.roles.length, 'os papéis já criados ficam');
    assert.equal(c.membros, 0, 'o vínculo é o que não chegou a existir');
  });

  it('a mesma pessoa administrando dois clientes é uma pessoa só', async () => {
    // `ensureUser`, não `createUser`. Criar um segundo usuário com o mesmo
    // e-mail partiria a identidade dela em duas — e ela entraria vendo só uma
    // das empresas, sem entender por quê.
    const mesmo = { email: 'dono@grupo.com.br', name: 'Dono do Grupo' };

    await provisionarPorBlueprint(db, {
      blueprint: nichos['cafeteria'],
      slug: 'unidade-um',
      name: 'Unidade Um',
      admin: mesmo,
      idempotencyKey: 'req-u1',
    });
    await provisionarPorBlueprint(db, {
      blueprint: nichos['mercado'],
      slug: 'unidade-dois',
      name: 'Unidade Dois',
      admin: mesmo,
      idempotencyKey: 'req-u2',
    });

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.users where lower(email) = lower($1)) as pessoas,
         (select count(*)::int from public.tenant_users tu
            join public.users u on u.id = tu.user_id
           where lower(u.email) = lower($1)) as vinculos`,
      [mesmo.email],
    );
    assert.equal(rows[0].pessoas, 1, 'uma pessoa, não duas');
    assert.equal(rows[0].vinculos, 2, 'com dois vínculos');
  });
});

describe('o espelho de auth.users', () => {
  it('criar a identidade cria o perfil', async () => {
    // Sem o gatilho, quem se cadastrasse existiria para a autenticação e não
    // para a aplicação: entraria e o sistema diria que não a conhece.
    const { rows } = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('nova@pessoa.com.br', '{"full_name": "Nova Pessoa"}'::jsonb)
       returning id`,
    );
    const id = rows[0].id;

    const perfil = await db.query(
      'select email, full_name, is_super_admin from public.users where id = $1',
      [id],
    );
    assert.equal(perfil.rows.length, 1, 'o perfil precisa nascer junto');
    assert.equal(perfil.rows[0].email, 'nova@pessoa.com.br');
    assert.equal(perfil.rows[0].full_name, 'Nova Pessoa');
    assert.equal(perfil.rows[0].is_super_admin, false);
  });

  it('metadado de cadastro não promove ninguém a Super Admin', async () => {
    // O metadado vem do cliente. Se o gatilho o copiasse inteiro, bastaria
    // mandar `is_super_admin: true` no cadastro para virar plataforma.
    const { rows } = await db.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ('esperto@pessoa.com.br', '{"is_super_admin": true, "full_name": "Esperto"}'::jsonb)
       returning id`,
    );

    const perfil = await db.query('select is_super_admin from public.users where id = $1', [
      rows[0].id,
    ]);
    assert.equal(perfil.rows[0].is_super_admin, false);
  });

  it('identidade sem nome no metadado não quebra', async () => {
    const { rows } = await db.query(
      `insert into auth.users (email) values ('sem.nome@pessoa.com.br') returning id`,
    );
    const perfil = await db.query('select full_name from public.users where id = $1', [rows[0].id]);
    assert.equal(perfil.rows.length, 1);
    assert.equal(perfil.rows[0].full_name, null);
  });
});

/**
 * Um cliente de banco que falha quando a consulta casa com um padrão.
 *
 * É como se provoca falha numa etapa específica sem alterar o executor. A
 * alternativa — um sinalizador dentro do código de produção só para teste —
 * seria pior: teste que exige uma porta no código testa a porta, não o código.
 */
function dbQueFalhaEm(db, padrao, mensagem = 'falha provocada') {
  return {
    async query(sql, params) {
      if (padrao.test(sql)) throw new Error(mensagem);
      return db.query(sql, params);
    },
  };
}

/** Planeja sem executar, para retomada e compensação reusarem o mesmo plano. */
async function planoDe(db, blueprint, { slug, name, admin }) {
  const plano = planProvisioning({
    blueprint,
    planModules: [...(await modulosDoPlano(db, blueprint.plan))],
    slug,
    name,
    admin: { email: admin.email, fullName: admin.name },
  });
  assert.equal(plano.ok, true, 'o plano precisa ser válido para este teste');
  return plano.operations;
}

describe('retomada', () => {
  /** Provisiona falhando na criação de papéis, que é no meio do fluxo. */
  async function falharEmPapeis(chave, slug = 'cafe-retomada') {
    const bp = nichos['cafeteria'];
    const operations = await planoDe(db, bp, { slug, name: 'Café', admin: admin(1) });

    const r = await executeProvisioning(
      dbQueFalhaEm(db, /insert into public\.roles/, 'banco fora do ar'),
      identidadeDoHarness(db),
      {
        operations,
        blueprint: { code: bp.code, version: bp.version },
        idempotencyKey: chave,
        requestedBy: superAdmin,
      },
    );
    assert.equal(r.ok, false);
    assert.equal(r.failedStep, 'create_roles');
    return { bp, operations, runId: r.runId, tenantId: r.tenantId };
  }

  it('continua de onde parou e conclui', async () => {
    const { bp, operations } = await falharEmPapeis('req-retoma');

    const r = await resumeProvisioning(db, identidadeDoHarness(db), {
      operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-retoma',
      requestedBy: superAdmin,
    });

    assert.equal(r.ok, true);
    const retratoFinal = await retrato(db, r.tenantId);
    assert.equal(retratoFinal.status, 'active');
    assert.deepEqual(retratoFinal.papeis, bp.roles.map((p) => p.code).sort());
  });

  it('não repete o que já tinha concluído', async () => {
    // Habilitar módulo de novo seria inócuo, mas criar papel de novo viola
    // unicidade e criar vínculo de novo viola `tenant_users_unique`. Repetir
    // não é ineficiência: é erro.
    const { bp, operations, tenantId } = await falharEmPapeis('req-sem-repetir');

    await resumeProvisioning(db, identidadeDoHarness(db), {
      operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-sem-repetir',
      requestedBy: superAdmin,
    });

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.tenant_modules where tenant_id = $1) as modulos,
         (select count(*)::int from public.roles where tenant_id = $1) as papeis,
         (select count(*)::int from public.tenant_users where tenant_id = $1) as membros,
         (select count(*)::int from public.tenants) as tenants`,
      [tenantId],
    );
    const [c] = rows;
    assert.equal(c.modulos, bp.modules.length, 'os módulos não foram habilitados duas vezes');
    assert.equal(c.papeis, bp.roles.length);
    assert.equal(c.membros, 1);
    assert.equal(c.tenants, 1, 'a retomada não pode criar um segundo tenant');
  });

  it('conta a tentativa e limpa a data de fim', async () => {
    // `finished_at` precisa voltar a nulo: `running` não é terminal, e a
    // constraint recusa uma execução viva com data de fim.
    const { bp, operations, runId } = await falharEmPapeis('req-tentativas');

    const durante = await db.query(
      'select attempts, finished_at from public.provisioning_runs where id = $1',
      [runId],
    );
    assert.equal(durante.rows[0].attempts, 1);
    assert.notEqual(durante.rows[0].finished_at, null, 'falha é terminal e tem data de fim');

    await resumeProvisioning(db, identidadeDoHarness(db), {
      operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-tentativas',
      requestedBy: superAdmin,
    });

    const depois = await db.query(
      'select attempts, status::text as status from public.provisioning_runs where id = $1',
      [runId],
    );
    assert.equal(depois.rows[0].attempts, 2, 'a contagem de tentativas precisa ser visível');
    assert.equal(depois.rows[0].status, 'succeeded');
  });

  it('recusa retomar o que não falhou', async () => {
    // Uma `running` está em andamento em outro lugar: continuar seria duas
    // escritas no mesmo tenant ao mesmo tempo.
    const bp = nichos['cafeteria'];
    await provisionarPorBlueprint(db, {
      blueprint: bp,
      slug: 'cafe-ok',
      name: 'Café',
      admin: admin(1),
      idempotencyKey: 'req-ja-deu-certo',
    });

    const operations = await planoDe(db, bp, {
      slug: 'cafe-ok',
      name: 'Café',
      admin: admin(1),
    });
    const r = await resumeProvisioning(db, identidadeDoHarness(db), {
      operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-ja-deu-certo',
      requestedBy: superAdmin,
    });

    assert.equal(r.ok, false);
    assert.match(r.error, /succeeded/);
  });

  it('recusa retomar uma chave que não existe', async () => {
    const bp = nichos['cafeteria'];
    const operations = await planoDe(db, bp, {
      slug: 'nao-existe',
      name: 'X',
      admin: admin(1),
    });
    const r = await resumeProvisioning(db, identidadeDoHarness(db), {
      operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-inexistente',
      requestedBy: superAdmin,
    });

    assert.equal(r.ok, false);
    assert.match(r.error, /não há execução/);
  });

  it('falhar de novo continua retomável', async () => {
    // Duas falhas seguidas não podem travar o cliente num estado sem saída.
    const { bp, operations } = await falharEmPapeis('req-duas-falhas');

    const segunda = await resumeProvisioning(
      dbQueFalhaEm(db, /insert into public\.roles/, 'ainda fora do ar'),
      identidadeDoHarness(db),
      {
        operations,
        blueprint: { code: bp.code, version: bp.version },
        idempotencyKey: 'req-duas-falhas',
        requestedBy: superAdmin,
      },
    );
    assert.equal(segunda.ok, false);

    const terceira = await resumeProvisioning(db, identidadeDoHarness(db), {
      operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: 'req-duas-falhas',
      requestedBy: superAdmin,
    });
    assert.equal(terceira.ok, true);

    const { rows } = await db.query('select attempts from public.provisioning_runs where id = $1', [
      terceira.runId,
    ]);
    assert.equal(rows[0].attempts, 3);
  });
});

describe('compensação', () => {
  /** Falha no convite: tudo antes já teve efeito, inclusive o vínculo. */
  async function falharNoConvite(chave, { slug = 'cafe-comp', quem = admin(1) } = {}) {
    const bp = nichos['cafeteria'];
    const operations = await planoDe(db, bp, { slug, name: 'Café', admin: quem });

    const r = await executeProvisioning(
      dbQueFalhaEm(db, /insert into public\.audit_logs/, 'e-mail recusado'),
      identidadeDoHarness(db),
      {
        operations,
        blueprint: { code: bp.code, version: bp.version },
        idempotencyKey: chave,
        requestedBy: superAdmin,
      },
    );
    assert.equal(r.ok, false);
    assert.equal(r.failedStep, 'send_invite');
    return { bp, runId: r.runId, tenantId: r.tenantId };
  }

  it('desfaz na ordem inversa da execução', async () => {
    const { tenantId } = await falharNoConvite('req-comp-ordem');

    const r = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-ordem',
    });

    assert.equal(r.ok, true);
    // `seed_defaults` entrou na lista em 25/09/2026: as sementes da cafeteria
    // são de ERP, e até ali ficavam pendentes — sem efeito, nada a desfazer.
    assert.deepEqual(r.undone, [
      'seed_defaults',
      'create_admin',
      'create_roles',
      'enable_modules',
      'create_tenant',
    ]);
    assert.equal(r.tenantId, tenantId);
  });

  it('desfaz o efeito de verdade, não só o registro', async () => {
    const { tenantId } = await falharNoConvite('req-comp-efeito');

    const contar = () =>
      db.query(
        `select
           (select count(*)::int from public.tenant_modules where tenant_id = $1) as modulos,
           (select count(*)::int from public.roles where tenant_id = $1) as papeis,
           (select count(*)::int from public.tenant_users where tenant_id = $1) as membros,
           (select count(*)::int from public.erp_product_categories where tenant_id = $1) as categorias,
           (select count(*)::int from public.erp_payment_methods where tenant_id = $1) as formas`,
        [tenantId],
      );
    const antes = await contar();
    assert.ok(antes.rows[0].modulos > 0, 'o cenário depende de haver efeito a desfazer');
    assert.ok(antes.rows[0].categorias > 0, 'e de haver semente de ERP aplicada');

    await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-efeito',
    });

    const [c] = (await contar()).rows;
    assert.equal(c.modulos, 0);
    assert.equal(c.papeis, 0);
    assert.equal(c.membros, 0);
    assert.equal(c.categorias, 0);
    assert.equal(c.formas, 0);
  });

  it('cancela o cliente em vez de apagá-lo, preservando a evidência', async () => {
    const { runId, tenantId } = await falharNoConvite('req-comp-evidencia');

    await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-evidencia',
    });

    const { rows } = await db.query(
      `select
         (select t.status::text from public.tenants t where t.id = $1) as tenant,
         (select pr.status::text from public.provisioning_runs pr where pr.id = $2) as execucao,
         (select count(*)::int from public.provisioning_steps where run_id = $2) as etapas`,
      [tenantId, runId],
    );
    const [c] = rows;
    // `provisioning_runs.tenant_id` é `on delete cascade`: apagar o tenant
    // levaria junto a execução e as etapas — a evidência do que deu errado.
    assert.equal(c.tenant, 'cancelled');
    assert.equal(c.execucao, 'compensated');
    assert.equal(c.etapas, PROVISIONING_STEPS.length, 'nenhuma etapa desaparece');
  });

  it('a etapa desfeita vira "compensated", não some', async () => {
    const { runId } = await falharNoConvite('req-comp-historico');

    await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-historico',
    });

    const { rows } = await db.query(
      `select status::text as status, count(*)::int as c
       from public.provisioning_steps where run_id = $1 group by status order by status`,
      [runId],
    );
    const porStatus = Object.fromEntries(rows.map((r) => [r.status, r.c]));
    assert.equal(porStatus.compensated, 5, 'as cinco que tiveram efeito, sementes incluídas');
    assert.equal(porStatus.failed, 1, 'a que falhou continua registrada como falha');
  });

  it('não apaga a auditoria — acrescenta o registro do desfazer', async () => {
    // `audit_logs` não tem política de DELETE, e isso é de propósito: log
    // editável não é auditoria.
    const { tenantId } = await falharNoConvite('req-comp-auditoria');

    const r = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-auditoria',
    });
    assert.equal(r.ok, true);

    const { rows } = await db.query(
      `select action, metadata from public.audit_logs
       where tenant_id = $1 and action = 'tenant.provisioning_compensated'`,
      [tenantId],
    );
    assert.equal(rows.length, 1, 'desfazer é operação de plataforma e é auditável');
    assert.equal(rows[0].metadata.undone.length, 5);
  });

  it('NÃO apaga a identidade de quem já administrava outro cliente', async () => {
    /*
     * O caso que mais importa deste arquivo inteiro.
     *
     * A mesma pessoa administra dois clientes. O segundo provisionamento
     * falha e é compensado. Se a compensação apagasse a identidade dela, ela
     * perderia o acesso ao **primeiro** cliente — que nada tinha a ver com a
     * falha, e cujo dono não entenderia o que aconteceu.
     */
    const pessoa = { email: 'dono@grupo.com.br', name: 'Dono do Grupo' };

    const primeiro = await provisionarPorBlueprint(db, {
      blueprint: nichos['mercado'],
      slug: 'unidade-boa',
      name: 'Unidade Boa',
      admin: pessoa,
      idempotencyKey: 'req-unidade-boa',
    });

    await falharNoConvite('req-unidade-ruim', { slug: 'unidade-ruim', quem: pessoa });
    const r = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-unidade-ruim',
    });
    assert.equal(r.ok, true);

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.users where lower(email) = lower($1)) as pessoa,
         (select count(*)::int from public.tenant_users where tenant_id = $2) as vinculo_bom`,
      [pessoa.email, primeiro.tenantId],
    );
    assert.equal(rows[0].pessoa, 1, 'a pessoa não pode ser apagada');
    assert.equal(rows[0].vinculo_bom, 1, 'nem perder o acesso ao cliente que deu certo');
  });

  it('apaga a identidade que esta execução criou', async () => {
    // O outro lado: deixar a conta órfã produz alguém que entra e não
    // encontra empresa nenhuma, sem que ninguém saiba por quê.
    const novo = { email: 'so.aqui@exemplo.com.br', name: 'Só Aqui' };
    await falharNoConvite('req-comp-identidade', { slug: 'so-aqui', quem: novo });

    const antes = await db.query('select count(*)::int as c from public.users where email = $1', [
      novo.email,
    ]);
    assert.equal(antes.rows[0].c, 1, 'o cenário depende de a identidade ter sido criada');

    await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-identidade',
    });

    const depois = await db.query('select count(*)::int as c from public.users where email = $1', [
      novo.email,
    ]);
    assert.equal(depois.rows[0].c, 0);
  });

  it('recusa compensar o que não falhou', async () => {
    await provisionarPorBlueprint(db, {
      blueprint: nichos['cafeteria'],
      slug: 'cafe-vivo',
      name: 'Café',
      admin: admin(1),
      idempotencyKey: 'req-vivo',
    });

    const r = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-vivo',
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /succeeded/);
  });

  it('depois de compensado, o cliente aceita uma execução nova', async () => {
    // `compensated` é terminal e sai do índice parcial. Quem teve o
    // provisionamento desfeito precisa poder tentar de novo.
    const { tenantId } = await falharNoConvite('req-comp-recomeco');
    await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-recomeco',
    });

    const { rows } = await db.query(
      `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
       values ($1, 'req-segunda-chance', 'pending')
       returning id`,
      [tenantId],
    );
    assert.ok(rows[0].id);
  });

  it('compensação interrompida volta para "failed", não trava em "compensating"', async () => {
    /*
     * O pior estado possível: parte desfeita, parte não, e a execução em
     * `compensating` — que ocupa o tenant pelo índice parcial e impede
     * qualquer tentativa nova. `failed` é o único estado a partir do qual dá
     * para tentar outra vez.
     */
    const { runId } = await falharNoConvite('req-comp-interrompida');

    const r = await compensateProvisioning(
      dbQueFalhaEm(db, /delete from public\.tenant_users/, 'conexão caiu'),
      identidadeDoHarness(db),
      { idempotencyKey: 'req-comp-interrompida' },
    );
    assert.equal(r.ok, false);

    const { rows } = await db.query(
      'select status::text as status, last_error from public.provisioning_runs where id = $1',
      [runId],
    );
    assert.equal(rows[0].status, 'failed');
    assert.match(rows[0].last_error, /compensação interrompida/);
  });

  it('e uma compensação interrompida pode ser retomada', async () => {
    const { runId } = await falharNoConvite('req-comp-retomar');

    await compensateProvisioning(
      dbQueFalhaEm(db, /delete from public\.tenant_users/, 'conexão caiu'),
      identidadeDoHarness(db),
      { idempotencyKey: 'req-comp-retomar' },
    );

    const segunda = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-retomar',
    });
    assert.equal(segunda.ok, true, segunda.ok ? '' : segunda.error);

    const { rows } = await db.query(
      `select pr.status::text as execucao, t.status::text as tenant
       from public.provisioning_runs pr join public.tenants t on t.id = pr.tenant_id
       where pr.id = $1`,
      [runId],
    );
    assert.equal(rows[0].execucao, 'compensated');
    assert.equal(rows[0].tenant, 'cancelled');
  });
  /*
   * Regressão de um defeito que só apareceu contra o Postgres de verdade.
   *
   * `provisioning_steps.result` é `jsonb`. O driver de produção, ao receber
   * uma string destinada a coluna jsonb, **serializava de novo** — e o que
   * ficava gravado era a string `"{\"effects\":[…]}"` em vez do objeto. O
   * PGlite destes testes analisa a string, então aqui tudo passava.
   *
   * O estrago não era um erro: a leitura não achava `effects`, a compensação
   * desfazia zero efeitos, marcava toda etapa como `compensated` e devolvia
   * sucesso. Módulos e papéis continuavam no banco, com a tela dizendo que
   * tinham saído.
   *
   * A escrita foi corrigida com `$n::text::jsonb`. Este teste cobre a outra
   * metade — o que acontece quando o registro, por qualquer motivo, não puder
   * ser lido. A resposta precisa ser recusar, não fingir.
   */
  it('recusa quando o registro de uma etapa concluída não é legível', async () => {
    const { runId } = await falharNoConvite('req-comp-ilegivel', { slug: 'cafe-ileg' });

    // Exatamente a forma que o driver produzia: JSON dentro de uma string.
    await db.query(
      `update public.provisioning_steps
       set result = to_jsonb('{"effects":[{"kind":"module","code":"erp"}]}'::text)
       where run_id = $1 and step = 'enable_modules'`,
      [runId],
    );

    const r = await compensateProvisioning(db, identidadeDoHarness(db), {
      idempotencyKey: 'req-comp-ilegivel',
    });

    assert.equal(r.ok, false, 'compensar sem saber o que desfazer não pode dar certo');
    assert.match(r.error, /enable_modules/);

    // E não marcou como desfeito o que não desfez.
    const { rows } = await db.query(
      `select status::text from public.provisioning_steps
        where run_id = $1 and step = 'enable_modules'`,
      [runId],
    );
    assert.notEqual(rows[0].status, 'compensated');
  });

  it('o que o executor grava em result é objeto, não string de JSON', async () => {
    const { runId } = await falharNoConvite('req-comp-forma', { slug: 'cafe-forma' });

    const { rows } = await db.query(
      `select step, jsonb_typeof(result) as tipo
         from public.provisioning_steps
        where run_id = $1 and status = 'succeeded'`,
      [runId],
    );

    assert.ok(rows.length > 0, 'o cenário depende de haver etapa concluída');
    for (const linha of rows) {
      assert.equal(linha.tipo, 'object', `${linha.step} gravou ${linha.tipo} em vez de object`);
    }
  });
});
