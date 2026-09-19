/**
 * Provisionamento — prova de que o esquema sustenta o fluxo real.
 *
 * O provisionador abaixo é um MODELO, não a implementação de produção. Ele
 * existe para responder uma pergunta concreta: as constraints e os índices que
 * escrevemos bastam para tornar o fluxo idempotente, retomável e compensável,
 * ou a aplicação teria que se virar sozinha?
 *
 * A implementação real vai rodar no backend com `service_role` (que ignora RLS,
 * porque provisionar é operação de plataforma) e vai fazer coisas que o banco
 * não faz: enviar convite por e-mail, chamar serviços externos. A ordem das
 * etapas e as garantias, porém, são exatamente estas.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { createDatabase, createUser } from './harness.mjs';

/** A ordem é a do fluxo oficial. Ver docs/ARCHITECTURE.md §4. */
const STEPS = [
  'create_tenant',
  'apply_plan',
  'enable_modules',
  'create_admin',
  'seed_defaults',
  'send_invite',
];

let db;
let superAdmin;

// ─────────────────────────────────────────────────────────────────────────
// Modelo do provisionador
// ─────────────────────────────────────────────────────────────────────────

/**
 * Abre — ou recupera — a execução para uma chave de idempotência.
 *
 * É aqui que a idempotência acontece: com a mesma chave, devolve a execução
 * existente em vez de começar outra. Sem isso, um duplo clique ou um retry de
 * rede criaria dois tenants para o mesmo cliente.
 */
async function startRun(db, { idempotencyKey, payload, requestedBy }) {
  const existing = await db.query(
    'select id, tenant_id, status from public.provisioning_runs where idempotency_key = $1',
    [idempotencyKey],
  );
  if (existing.rows.length > 0) return { ...existing.rows[0], reused: true };

  // O tenant nasce em 'provisioning': existe, mas ainda não opera.
  const tenant = await db.query(
    `insert into public.tenants (slug, name, status, plan_id)
     values ($1, $2, 'provisioning', (select id from public.plans where code = $3))
     returning id`,
    [payload.slug, payload.name, payload.planCode],
  );
  const tenantId = tenant.rows[0].id;

  const run = await db.query(
    `insert into public.provisioning_runs (tenant_id, idempotency_key, payload, requested_by, status, started_at)
     values ($1, $2, $3, $4, 'running', now())
     returning id, tenant_id, status`,
    [tenantId, idempotencyKey, JSON.stringify(payload), requestedBy],
  );

  await db.query(
    `insert into public.provisioning_steps (run_id, step, position)
     select $1, s.step, s.position
     from unnest($2::text[]) with ordinality as s(step, position)`,
    [run.rows[0].id, STEPS],
  );

  return { ...run.rows[0], reused: false };
}

/**
 * Executa as etapas pendentes, na ordem. Etapa já concluída é pulada — é isso
 * que torna o retry seguro depois de uma falha no meio do caminho.
 *
 * @param {(step: string, ctx: object) => Promise<object>} perform
 */
async function executeRun(db, runId, perform) {
  const { rows: steps } = await db.query(
    `select id, step, status from public.provisioning_steps
     where run_id = $1 order by position`,
    [runId],
  );

  const { rows: runRows } = await db.query(
    'select tenant_id, payload from public.provisioning_runs where id = $1',
    [runId],
  );
  const ctx = { tenantId: runRows[0].tenant_id, payload: runRows[0].payload };

  // `finished_at` precisa voltar a ser nulo: a execução deixou de estar
  // terminada. A constraint provisioning_runs_finished_consistency recusa
  // uma execução 'running' com data de fim — e recusou esta lógica antes de
  // o nulo estar aqui.
  await db.query(
    `update public.provisioning_runs
     set status = 'running', attempts = attempts + 1,
         current_step = null, last_error = null, finished_at = null
     where id = $1`,
    [runId],
  );

  for (const step of steps) {
    if (step.status === 'succeeded') continue;

    await db.query(
      `update public.provisioning_steps
       set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now())
       where id = $1`,
      [step.id],
    );
    await db.query('update public.provisioning_runs set current_step = $2 where id = $1', [
      runId,
      step.step,
    ]);

    try {
      const result = await perform(step.step, ctx);
      await db.query(
        `update public.provisioning_steps
         set status = 'succeeded', finished_at = now(), result = $2, error = null
         where id = $1`,
        [step.id, JSON.stringify(result ?? {})],
      );
    } catch (error) {
      await db.query(
        `update public.provisioning_steps
         set status = 'failed', finished_at = now(), error = $2
         where id = $1`,
        [step.id, error.message],
      );
      await db.query(
        `update public.provisioning_runs
         set status = 'failed', last_error = $2, finished_at = now()
         where id = $1`,
        [runId, error.message],
      );
      return { ok: false, failedAt: step.step };
    }
  }

  await db.query(
    `update public.provisioning_runs
     set status = 'succeeded', current_step = null, finished_at = now()
     where id = $1`,
    [runId],
  );
  // Só agora o tenant passa a operar.
  await db.query(`update public.tenants set status = 'active' where id = $1`, [ctx.tenantId]);
  return { ok: true };
}

/** Efeito real de cada etapa no banco. */
function makePerformer(db, { failOn = null } = {}) {
  const executed = [];
  return {
    executed,
    async perform(step, ctx) {
      if (step === failOn) throw new Error(`falha simulada em ${step}`);
      executed.push(step);

      switch (step) {
        case 'create_tenant':
          return { tenantId: ctx.tenantId };

        case 'apply_plan':
          return { planCode: ctx.payload.planCode };

        case 'enable_modules': {
          const { rows } = await db.query(
            `insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
             select $1, pm.module_id, true, now()
             from public.plan_modules pm
             join public.tenants t on t.plan_id = pm.plan_id
             where t.id = $1
             on conflict (tenant_id, module_id) do nothing
             returning module_id`,
            [ctx.tenantId],
          );
          return { enabled: rows.length };
        }

        case 'create_admin': {
          const userId = await createUser(db, {
            email: ctx.payload.adminEmail,
            fullName: ctx.payload.adminName,
          });
          const { rows } = await db.query(
            `insert into public.tenant_users (tenant_id, user_id, role_id, status)
             values ($1, $2, (select id from public.roles where code = 'tenant_admin' and tenant_id is null), 'invited')
             returning id`,
            [ctx.tenantId, userId],
          );
          // O que a compensação precisaria desfazer.
          return { userId, membershipId: rows[0].id };
        }

        case 'seed_defaults': {
          await db.query('insert into public.teams (tenant_id, name) values ($1, $2)', [
            ctx.tenantId,
            'Geral',
          ]);
          return { teams: 1 };
        }

        case 'send_invite':
          // Em produção: e-mail de convite. Aqui só o registro de auditoria.
          await db.query(
            `insert into public.audit_logs (tenant_id, action, resource_type, resource_id, metadata)
             values ($1, 'tenant.provisioned', 'tenant', $2, $3)`,
            [ctx.tenantId, ctx.tenantId, JSON.stringify({ email: ctx.payload.adminEmail })],
          );
          return { invited: true };

        default:
          throw new Error(`etapa desconhecida: ${step}`);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Modelo da compensação
// ─────────────────────────────────────────────────────────────────────────

/**
 * Desfaz, na ordem inversa, o que as etapas concluídas já tiveram de efeito.
 *
 * Compensar é o que se faz quando uma execução falhou e **não** vai ser
 * retomada. Retomar avança; compensar recua. A diferença importa: um tenant
 * parado em `provisioning` para sempre é pior que um tenant cancelado, porque
 * ninguém sabe se ainda vai acontecer alguma coisa.
 *
 * Duas decisões que o esquema impõe e que não são óbvias:
 *
 *   1. `compensating` **não** é estado terminal. Vindo de `failed`, que é,
 *      `finished_at` precisa voltar a nulo — senão a constraint
 *      `provisioning_runs_finished_consistency` recusa. É exatamente o mesmo
 *      erro que a primeira versão da retomada cometeu.
 *
 *   2. O tenant é **cancelado**, não apagado. `provisioning_runs.tenant_id` é
 *      `on delete cascade`: apagar o tenant levaria junto a execução e as
 *      etapas — ou seja, a evidência da falha. O registro do que deu errado é
 *      a parte que mais interessa depois.
 *
 * @param {(step: string, result: object, ctx: object) => Promise<void>} undo
 */
async function compensateRun(db, runId, undo) {
  const { rows: runRows } = await db.query(
    'select tenant_id from public.provisioning_runs where id = $1',
    [runId],
  );
  const ctx = { tenantId: runRows[0].tenant_id };

  await db.query(
    `update public.provisioning_runs
     set status = 'compensating', current_step = null, finished_at = null
     where id = $1`,
    [runId],
  );

  // Ordem inversa: o que teve efeito por último é o primeiro a ser desfeito.
  const { rows: steps } = await db.query(
    `select id, step, result from public.provisioning_steps
     where run_id = $1 and status = 'succeeded'
     order by position desc`,
    [runId],
  );

  const undone = [];
  for (const step of steps) {
    await db.query('update public.provisioning_runs set current_step = $2 where id = $1', [
      runId,
      step.step,
    ]);
    await undo(step.step, step.result, ctx);
    undone.push(step.step);

    // A etapa não é apagada: o histórico da falha é auditoria, não lixo.
    await db.query(`update public.provisioning_steps set status = 'compensated' where id = $1`, [
      step.id,
    ]);
  }

  await db.query(
    `update public.provisioning_runs
     set status = 'compensated', current_step = null, finished_at = now()
     where id = $1`,
    [runId],
  );
  await db.query(`update public.tenants set status = 'cancelled' where id = $1`, [ctx.tenantId]);

  await db.query(
    `insert into public.audit_logs (tenant_id, action, resource_type, resource_id, metadata)
     values ($1, 'tenant.provisioning_compensated', 'tenant', $2, $3)`,
    [ctx.tenantId, ctx.tenantId, JSON.stringify({ undone })],
  );

  return { undone };
}

/** O efeito inverso de cada etapa. */
function makeCompensator(db) {
  return {
    async undo(step, result, ctx) {
      switch (step) {
        case 'send_invite':
          // Auditoria é somente inserção. Compensar **acrescenta** o registro
          // do desfazer; não apaga o registro do que foi feito.
          return;

        case 'seed_defaults':
          await db.query('delete from public.teams where tenant_id = $1', [ctx.tenantId]);
          return;

        case 'create_admin':
          // Só remove porque esta execução criou. Usuário que já existia em
          // outro tenant não é efeito desta execução e não se desfaz.
          await db.query('delete from public.tenant_users where id = $1', [result.membershipId]);
          await db.query('delete from public.users where id = $1', [result.userId]);
          return;

        case 'enable_modules':
          await db.query('delete from public.tenant_modules where tenant_id = $1', [ctx.tenantId]);
          return;

        case 'apply_plan':
        case 'create_tenant':
          // Sem efeito próprio a desfazer: o tenant é cancelado ao final.
          return;

        default:
          throw new Error(`etapa desconhecida na compensação: ${step}`);
      }
    },
  };
}

const payloadFor = (n) => ({
  slug: `cliente-${n}`,
  name: `Cliente ${n}`,
  planCode: 'profissional',
  adminEmail: `admin@cliente${n}.com.br`,
  adminName: `Admin ${n}`,
});

// ─────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db?.close();
  db = await createDatabase();
  superAdmin = await createUser(db, { email: 'equipe@tivexy.com.br', isSuperAdmin: true });
});

after(async () => {
  await db?.close();
});

describe('provisionamento — caminho feliz', () => {
  it('leva o tenant de "provisioning" a operacional', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-feliz',
      payload: payloadFor(1),
      requestedBy: superAdmin,
    });
    const { perform, executed } = makePerformer(db);
    const resultado = await executeRun(db, run.id, perform);

    assert.equal(resultado.ok, true);
    assert.deepEqual(executed, STEPS, 'todas as etapas, na ordem');

    const { rows } = await db.query(
      `select t.status as tenant, r.status as run, r.current_step, r.finished_at is not null as terminou
       from public.tenants t join public.provisioning_runs r on r.tenant_id = t.id
       where r.id = $1`,
      [run.id],
    );
    assert.equal(rows[0].tenant, 'active');
    assert.equal(rows[0].run, 'succeeded');
    assert.equal(rows[0].current_step, null);
    assert.equal(rows[0].terminou, true);
  });

  it('deixa o tenant pronto para o primeiro acesso', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-pronto',
      payload: payloadFor(2),
      requestedBy: superAdmin,
    });
    await executeRun(db, run.id, makePerformer(db).perform);

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.tenant_modules where tenant_id = $1 and is_enabled) as modulos,
         (select count(*)::int from public.tenant_users where tenant_id = $1) as membros,
         (select count(*)::int from public.teams where tenant_id = $1) as equipes,
         (select count(*)::int from public.audit_logs where tenant_id = $1) as auditoria`,
      [run.tenant_id],
    );
    const [c] = rows;
    assert.equal(c.modulos, 6, 'o plano profissional habilita 6 módulos');
    assert.equal(c.membros, 1, 'o administrador do tenant');
    assert.equal(c.equipes, 1);
    assert.equal(c.auditoria, 1, 'provisionamento é operação auditável');
  });

  it('cria o administrador como convidado, não como ativo', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-convite',
      payload: payloadFor(3),
      requestedBy: superAdmin,
    });
    await executeRun(db, run.id, makePerformer(db).perform);

    const { rows } = await db.query(
      'select status, joined_at from public.tenant_users where tenant_id = $1',
      [run.tenant_id],
    );
    assert.equal(rows[0].status, 'invited');
    assert.equal(rows[0].joined_at, null, 'só o primeiro acesso marca a entrada');
  });
});

describe('provisionamento — idempotência', () => {
  it('a mesma chave devolve a mesma execução e não cria um segundo tenant', async () => {
    const payload = payloadFor(4);
    const primeira = await startRun(db, {
      idempotencyKey: 'req-repetida',
      payload,
      requestedBy: superAdmin,
    });
    await executeRun(db, primeira.id, makePerformer(db).perform);

    const segunda = await startRun(db, {
      idempotencyKey: 'req-repetida',
      payload,
      requestedBy: superAdmin,
    });

    assert.equal(segunda.reused, true);
    assert.equal(segunda.id, primeira.id);
    assert.equal(segunda.status, 'succeeded');

    const { rows } = await db.query('select count(*)::int as c from public.tenants');
    assert.equal(rows[0].c, 1, 'repetir a requisição não pode criar outro tenant');
  });
});

describe('provisionamento — falha e retomada', () => {
  it('para na etapa que falhou e registra o erro', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-falha',
      payload: payloadFor(5),
      requestedBy: superAdmin,
    });
    const resultado = await executeRun(
      db,
      run.id,
      makePerformer(db, { failOn: 'create_admin' }).perform,
    );

    assert.equal(resultado.ok, false);
    assert.equal(resultado.failedAt, 'create_admin');

    const { rows } = await db.query(
      `select r.status, r.last_error, r.current_step, t.status as tenant
       from public.provisioning_runs r join public.tenants t on t.id = r.tenant_id
       where r.id = $1`,
      [run.id],
    );
    assert.equal(rows[0].status, 'failed');
    assert.match(rows[0].last_error, /create_admin/);
    assert.equal(rows[0].current_step, 'create_admin');
    assert.equal(rows[0].tenant, 'provisioning', 'tenant que falhou não vira ativo');
  });

  it('retoma de onde parou, sem repetir o que já concluiu', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-retomada',
      payload: payloadFor(6),
      requestedBy: superAdmin,
    });
    await executeRun(db, run.id, makePerformer(db, { failOn: 'create_admin' }).perform);

    const segundaTentativa = makePerformer(db);
    const resultado = await executeRun(db, run.id, segundaTentativa.perform);

    assert.equal(resultado.ok, true);
    assert.deepEqual(
      segundaTentativa.executed,
      ['create_admin', 'seed_defaults', 'send_invite'],
      'as três primeiras etapas já tinham concluído e não podem rodar de novo',
    );

    const { rows } = await db.query(
      `select
         (select count(*)::int from public.teams where tenant_id = $1) as equipes,
         (select count(*)::int from public.tenant_users where tenant_id = $1) as membros,
         (select attempts from public.provisioning_runs where id = $2) as tentativas,
         (select status from public.tenants where id = $1) as tenant`,
      [run.tenant_id, run.id],
    );
    const [c] = rows;
    assert.equal(c.equipes, 1, 'retomar não pode duplicar efeito de etapa concluída');
    assert.equal(c.membros, 1);
    assert.equal(c.tentativas, 2, 'a contagem de tentativas precisa ser visível');
    assert.equal(c.tenant, 'active');
  });

  it('impede uma segunda execução enquanto a primeira está viva', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-concorrente',
      payload: payloadFor(7),
      requestedBy: superAdmin,
    });

    await assert.rejects(
      () =>
        db.query(
          `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
           values ($1, 'req-concorrente-2', 'pending')`,
          [run.tenant_id],
        ),
      /duplicate key|unique/i,
      'duas execuções simultâneas no mesmo tenant se atropelariam',
    );
  });

  it('guarda em cada etapa o que a compensação precisaria desfazer', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-compensacao',
      payload: payloadFor(8),
      requestedBy: superAdmin,
    });
    await executeRun(db, run.id, makePerformer(db).perform);

    const { rows } = await db.query(
      `select result from public.provisioning_steps where run_id = $1 and step = 'create_admin'`,
      [run.id],
    );
    const resultado = rows[0].result;
    assert.ok(resultado.userId, 'a compensação precisa saber qual usuário remover');
    assert.ok(resultado.membershipId, 'e qual vínculo desfazer');
  });
});

describe('provisionamento — compensação', () => {
  /** Falha no fim: cinco etapas com efeito para desfazer. */
  async function runQueFalhouNoFim(chave, n) {
    const run = await startRun(db, {
      idempotencyKey: chave,
      payload: payloadFor(n),
      requestedBy: superAdmin,
    });
    const resultado = await executeRun(
      db,
      run.id,
      makePerformer(db, { failOn: 'send_invite' }).perform,
    );
    assert.equal(resultado.ok, false, 'o cenário depende de a execução ter falhado');
    return run;
  }

  it('desfaz na ordem inversa da execução', async () => {
    const run = await runQueFalhouNoFim('req-comp-ordem', 10);
    const { undone } = await compensateRun(db, run.id, makeCompensator(db).undo);

    assert.deepEqual(undone, [
      'seed_defaults',
      'create_admin',
      'enable_modules',
      'apply_plan',
      'create_tenant',
    ]);
  });

  it('termina em compensated, com data de fim', async () => {
    const run = await runQueFalhouNoFim('req-comp-estado', 11);
    await compensateRun(db, run.id, makeCompensator(db).undo);

    const { rows } = await db.query(
      `select status, current_step, finished_at is not null as terminou
       from public.provisioning_runs where id = $1`,
      [run.id],
    );
    assert.equal(rows[0].status, 'compensated');
    assert.equal(rows[0].current_step, null);
    assert.equal(rows[0].terminou, true);
  });

  it('recusa entrar em compensação mantendo a data de fim', async () => {
    const run = await runQueFalhouNoFim('req-comp-constraint', 12);

    // A execução está 'failed', que é terminal e tem `finished_at`.
    // `compensating` não é terminal: deixar a data para trás é estado
    // inconsistente, e o banco recusa. Mesmo erro que a retomada cometeu.
    await assert.rejects(
      () =>
        db.query(`update public.provisioning_runs set status = 'compensating' where id = $1`, [
          run.id,
        ]),
      /provisioning_runs_finished_consistency/,
      'compensação em andamento não pode carregar data de fim',
    );
  });

  it('marca a etapa como compensada em vez de apagá-la', async () => {
    const run = await runQueFalhouNoFim('req-comp-historico', 13);
    await compensateRun(db, run.id, makeCompensator(db).undo);

    const { rows } = await db.query(
      `select status::text as status, count(*)::int as c from public.provisioning_steps
       where run_id = $1 group by status order by status`,
      [run.id],
    );
    const porStatus = Object.fromEntries(rows.map((r) => [r.status, r.c]));

    assert.equal(porStatus.compensated, 5, 'as cinco que tiveram efeito');
    assert.equal(porStatus.failed, 1, 'a que falhou continua registrada como falha');
    assert.equal(
      rows.reduce((t, r) => t + r.c, 0),
      6,
      'nenhuma etapa desaparece: o histórico da falha é auditoria',
    );
  });

  it('não compensa etapa que nunca chegou a rodar', async () => {
    const run = await startRun(db, {
      idempotencyKey: 'req-comp-parcial',
      payload: payloadFor(14),
      requestedBy: superAdmin,
    });
    await executeRun(db, run.id, makePerformer(db, { failOn: 'create_admin' }).perform);

    const { undone } = await compensateRun(db, run.id, makeCompensator(db).undo);
    assert.deepEqual(undone, ['enable_modules', 'apply_plan', 'create_tenant']);

    const { rows } = await db.query(
      `select step, status::text as status from public.provisioning_steps
       where run_id = $1 order by position`,
      [run.id],
    );
    const porEtapa = Object.fromEntries(rows.map((r) => [r.step, r.status]));

    assert.equal(porEtapa.create_admin, 'failed');
    assert.equal(porEtapa.seed_defaults, 'pending', 'nunca rodou: não há o que desfazer');
    assert.equal(porEtapa.send_invite, 'pending');
  });

  it('desfaz o efeito de verdade, não só o registro', async () => {
    const run = await runQueFalhouNoFim('req-comp-efeito', 15);

    const antes = await db.query(
      `select
         (select count(*)::int from public.tenant_modules where tenant_id = $1) as modulos,
         (select count(*)::int from public.tenant_users where tenant_id = $1) as membros,
         (select count(*)::int from public.teams where tenant_id = $1) as equipes`,
      [run.tenant_id],
    );
    assert.equal(antes.rows[0].modulos, 6, 'o cenário depende de haver efeito a desfazer');
    assert.equal(antes.rows[0].membros, 1);
    assert.equal(antes.rows[0].equipes, 1);

    await compensateRun(db, run.id, makeCompensator(db).undo);

    const depois = await db.query(
      `select
         (select count(*)::int from public.tenant_modules where tenant_id = $1) as modulos,
         (select count(*)::int from public.tenant_users where tenant_id = $1) as membros,
         (select count(*)::int from public.teams where tenant_id = $1) as equipes,
         (select count(*)::int from public.users where email = $2) as usuario`,
      [run.tenant_id, payloadFor(15).adminEmail],
    );
    const [c] = depois.rows;
    assert.equal(c.modulos, 0);
    assert.equal(c.membros, 0);
    assert.equal(c.equipes, 0);
    assert.equal(c.usuario, 0, 'o administrador criado pela execução também sai');
  });

  it('cancela o tenant em vez de apagá-lo, preservando a evidência', async () => {
    const run = await runQueFalhouNoFim('req-comp-evidencia', 16);
    await compensateRun(db, run.id, makeCompensator(db).undo);

    const { rows } = await db.query(
      `select
         (select status::text from public.tenants where id = $1) as tenant,
         (select count(*)::int from public.provisioning_runs where tenant_id = $1) as execucoes,
         (select count(*)::int from public.provisioning_steps where run_id = $2) as etapas`,
      [run.tenant_id, run.id],
    );
    const [c] = rows;

    // `provisioning_runs.tenant_id` é `on delete cascade`: apagar o tenant
    // levaria junto a execução e as etapas — a evidência da falha.
    assert.equal(c.tenant, 'cancelled', 'tenant parado em provisioning para sempre é pior');
    assert.equal(c.execucoes, 1);
    assert.equal(c.etapas, 6);
  });

  it('registra a compensação na auditoria', async () => {
    const run = await runQueFalhouNoFim('req-comp-auditoria', 17);
    await compensateRun(db, run.id, makeCompensator(db).undo);

    const { rows } = await db.query(
      `select action, metadata from public.audit_logs
       where tenant_id = $1 and action = 'tenant.provisioning_compensated'`,
      [run.tenant_id],
    );
    assert.equal(rows.length, 1, 'desfazer é operação de plataforma e é auditável');
    assert.equal(rows[0].metadata.undone.length, 5, 'o que foi desfeito fica registrado');
  });

  it('enquanto compensa, nenhuma outra execução entra no mesmo tenant', async () => {
    const run = await runQueFalhouNoFim('req-comp-concorrente', 18);
    const compensador = makeCompensator(db);

    let erroConcorrente = 'não tentou';
    await compensateRun(db, run.id, async (step, result, ctx) => {
      if (step === 'create_admin') {
        erroConcorrente = await db
          .query(
            `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
             values ($1, 'req-durante-compensacao', 'pending')`,
            [ctx.tenantId],
          )
          .then(
            () => null,
            (e) => e.message,
          );
      }
      await compensador.undo(step, result, ctx);
    });

    // O índice parcial `provisioning_runs_one_active_per_tenant` inclui
    // `compensating`: uma execução nova durante o desfazer disputaria as
    // mesmas linhas com o que está sendo removido.
    assert.match(String(erroConcorrente), /duplicate key|unique/i);
  });

  it('depois de compensada, o tenant aceita uma execução nova', async () => {
    const run = await runQueFalhouNoFim('req-comp-recomeco', 19);
    await compensateRun(db, run.id, makeCompensator(db).undo);

    // `compensated` é terminal e sai do índice parcial. Cliente cujo
    // provisionamento falhou precisa poder tentar de novo.
    const { rows } = await db.query(
      `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
       values ($1, 'req-segunda-chance', 'pending')
       returning id`,
      [run.tenant_id],
    );
    assert.ok(rows[0].id);
  });
});
