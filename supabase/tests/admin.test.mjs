/**
 * Admin — suspender, reativar, trocar plano, editar — contra o Postgres.
 *
 * O que mais importa: **suspensão corta a API, não só a tela.** Até
 * 20260925140000 a permissão olhava o vínculo e não a empresa, e quem estava
 * numa empresa suspensa continuava lendo e escrevendo pela API REST.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { previewPlanChange } from '../../packages/core/src/index.ts';
import {
  addMember,
  asUser,
  asUserCommitting,
  createDatabase,
  createTenant,
  createUser,
} from './harness.mjs';

let db;
const fx = {};

async function modulos(tenantId) {
  const { rows } = await db.query(
    `select m.code from public.tenant_modules tm join public.modules m on m.id = tm.module_id
     where tm.tenant_id = $1 and tm.is_enabled order by m.sort_order`,
    [tenantId],
  );
  return rows.map((r) => r.code);
}

async function habilitar(tenantId, codigos) {
  await db.query(
    `insert into public.tenant_modules (tenant_id, module_id, is_enabled)
     select $1, m.id, true from public.modules m where m.code = any($2::text[])
     on conflict (tenant_id, module_id) do update set is_enabled = true`,
    [tenantId, codigos],
  );
}

async function auditoria(acao) {
  const { rows } = await db.query(
    'select actor_user_id, metadata from public.audit_logs where action = $1 order by created_at',
    [acao],
  );
  return rows;
}

const comoSuper = (fn) => asUserCommitting(db, fx.super, fn);
const suspender = (motivo, tenant = fx.t) =>
  comoSuper(() =>
    db.query(`select public.admin_set_tenant_status($1, 'suspended', $2)`, [tenant, motivo]),
  );
const reativar = (tenant = fx.t) =>
  comoSuper(() => db.query(`select public.admin_set_tenant_status($1, 'active', null)`, [tenant]));

before(async () => {
  db = await createDatabase();
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.audit_logs;
    delete from public.tenants;
    delete from public.plans where code = 'so_crm';
    delete from auth.users;
  `);
  fx.t = await createTenant(db, { slug: 'cafe-admin', name: 'Café Admin', planCode: 'essencial' });
  await habilitar(fx.t, ['core', 'crm']);
  fx.super = await createUser(db, { email: 'super@admin.test', isSuperAdmin: true });
  fx.admin = await createUser(db, { email: 'admin@admin.test', fullName: 'Ana' });
  await addMember(db, { tenantId: fx.t, userId: fx.admin, roleCode: 'tenant_admin' });
  await db.query(`insert into public.crm_leads (tenant_id, name) values ($1, 'Lia')`, [fx.t]);
});

describe('suspender', () => {
  it('corta a API: quem é da empresa não lê nem escreve dado de negócio', async () => {
    const antes = await asUser(db, fx.admin, () =>
      db.query('select id from public.crm_leads where tenant_id = $1', [fx.t]),
    );
    assert.equal(antes.rows.length, 1);

    await suspender('Pagamento de setembro em aberto');

    const depois = await asUser(db, fx.admin, () =>
      db.query('select id from public.crm_leads where tenant_id = $1', [fx.t]),
    );
    assert.equal(depois.rows.length, 0, 'suspensa, a empresa não lê o próprio CRM pela API');
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(`insert into public.crm_leads (tenant_id, name) values ($1, 'Rui')`, [fx.t]),
      ),
      /row-level security/,
    );
  });

  it('a empresa continua lendo a própria linha — o motivo é para ela', async () => {
    await suspender('  Pagamento de setembro em aberto  ');
    const { rows } = await asUser(db, fx.admin, () =>
      db.query('select status::text, status_reason from public.tenants where id = $1', [fx.t]),
    );
    assert.deepEqual(rows[0], {
      status: 'suspended',
      status_reason: 'Pagamento de setembro em aberto',
    });
  });

  it('pede motivo, e a auditoria guarda quem, de onde e por quê', async () => {
    await assert.rejects(suspender('   '), /motivo/);
    await suspender('Pagamento em aberto');
    const [registro] = await auditoria('tenant.suspended');
    assert.equal(registro.actor_user_id, fx.super);
    assert.deepEqual(registro.metadata, {
      de: 'active',
      para: 'suspended',
      motivo: 'Pagamento em aberto',
    });
  });

  it('só o Super Admin — nem o administrador da empresa, nem pela coluna', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(`select public.admin_set_tenant_status($1, 'suspended', 'x')`, [fx.t]),
      ),
      (erro) => erro.code === '42501',
    );
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(`update public.tenants set status = 'active' where id = $1`, [fx.t]),
      ),
      /permission denied/,
    );
  });

  it('empresa em provisionamento tem outro caminho; a mesma situação duas vezes é recusada', async () => {
    const outra = await createTenant(db, { slug: 'outra', name: 'Outra' });
    await db.query(`update public.tenants set status = 'provisioning' where id = $1`, [outra]);
    await assert.rejects(suspender('x', outra), /provisionamento/);
    await assert.rejects(reativar(), /já está ativa/);
  });
});

describe('reativar', () => {
  it('devolve o acesso, apaga o motivo e registra', async () => {
    await suspender('Pagamento em aberto');
    await reativar();

    const { rows } = await asUser(db, fx.admin, () =>
      db.query('select id from public.crm_leads where tenant_id = $1', [fx.t]),
    );
    assert.equal(rows.length, 1, 'o dado ficou; o acesso voltou');
    const { rows: t } = await db.query(
      'select status::text, status_reason, status_changed_at from public.tenants where id = $1',
      [fx.t],
    );
    assert.equal(t[0].status, 'active');
    assert.equal(t[0].status_reason, null);
    assert.ok(t[0].status_changed_at instanceof Date);
    assert.equal((await auditoria('tenant.reactivated')).length, 1);
  });
});

describe('trocar o plano', () => {
  const trocar = (plano, desligar = false) =>
    comoSuper(async () => {
      const { rows } = await db.query('select public.admin_change_plan($1, $2, $3) as r', [
        fx.t,
        plano,
        desligar,
      ]);
      return rows[0].r;
    });

  it('subir liga o que o plano novo inclui', async () => {
    const r = await trocar('profissional');
    assert.deepEqual(r, {
      ligados: ['erp', 'inventory', 'finance', 'automation'],
      desligados: [],
    });
    assert.deepEqual(await modulos(fx.t), [
      'core',
      'crm',
      'erp',
      'inventory',
      'finance',
      'automation',
    ]);
    const [registro] = await auditoria('tenant.plan_changed');
    assert.equal(registro.metadata.de, 'essencial');
    assert.equal(registro.metadata.para, 'profissional');
  });

  it('descer não desliga nada sem pedir — pode haver módulo vendido à parte', async () => {
    await trocar('profissional');
    const r = await trocar('essencial');
    assert.deepEqual(r, { ligados: [], desligados: [] });
    assert.equal((await modulos(fx.t)).length, 6);
  });

  it('descer pedindo desliga o que ficou fora — menos o Core — e o dado fica', async () => {
    await trocar('profissional');
    await db.query(
      `insert into public.erp_products (tenant_id, name, price_cents, unit) values ($1, 'Grão', 5000, 'kg')`,
      [fx.t],
    );
    const r = await trocar('essencial', true);
    assert.deepEqual(r.desligados, ['erp', 'inventory', 'finance', 'automation']);
    assert.deepEqual(await modulos(fx.t), ['core', 'crm']);
    const { rows } = await db.query('select count(*)::int as n from public.erp_products');
    assert.equal(rows[0].n, 1, 'desligar não apaga');
  });

  it('o Core nunca desliga — nem num plano que não o liste', async () => {
    await db.exec(
      `insert into public.plans (code, name) values ('so_crm', 'Só CRM');
       insert into public.plan_modules (plan_id, module_id)
       select p.id, m.id from public.plans p, public.modules m
       where p.code = 'so_crm' and m.code = 'crm';`,
    );
    const r = await trocar('so_crm', true);
    assert.deepEqual(r.desligados, []);
    assert.deepEqual(await modulos(fx.t), ['core', 'crm']);
  });

  it('só o Super Admin; plano desconhecido e o mesmo plano são recusados', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(`select public.admin_change_plan($1, 'avancado', false)`, [fx.t]),
      ),
      (erro) => erro.code === '42501',
    );
    await assert.rejects(trocar('ouro'), /plano desconhecido/);
    await assert.rejects(trocar('essencial'), /já está neste plano/);
  });
});

describe('editar a empresa', () => {
  it('grava e audita antes e depois, numa transação', async () => {
    await comoSuper(() =>
      db.query('select public.admin_update_tenant($1, $2, $3, $4)', [
        fx.t,
        ' Café Central ',
        'Café Central Ltda',
        '12345678000195',
      ]),
    );
    const { rows } = await db.query(
      'select name, legal_name, document from public.tenants where id = $1',
      [fx.t],
    );
    assert.deepEqual(rows[0], {
      name: 'Café Central',
      legal_name: 'Café Central Ltda',
      document: '12345678000195',
    });
    const [registro] = await auditoria('tenant.updated');
    assert.equal(registro.metadata.antes.nome, 'Café Admin');
    assert.equal(registro.metadata.depois.nome, 'Café Central');
  });

  it('só o Super Admin, e documento torto é recusado pelo banco', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query('select public.admin_update_tenant($1, $2, null, null)', [fx.t, 'X']),
      ),
      (erro) => erro.code === '42501',
    );
    await assert.rejects(
      comoSuper(() =>
        db.query('select public.admin_update_tenant($1, $2, null, $3)', [fx.t, 'X', '123']),
      ),
      /tenants_document_format/,
    );
  });
});

describe('a prévia da troca de plano é o que o banco faz', () => {
  it('previewPlanChange × admin_change_plan(), subindo e descendo, pedindo e sem pedir', async () => {
    /*
     * O Admin mostra "liga X, desliga Y" antes de confirmar. Se a prévia
     * divergir do banco, a pessoa confirma uma coisa e acontece outra.
     */
    const cenarios = [
      { de: ['core', 'crm'], para: 'profissional', desligar: false },
      { de: ['core', 'crm'], para: 'avancado', desligar: true },
      { de: ['core', 'crm', 'erp', 'fiscal'], para: 'essencial', desligar: true },
      { de: ['core', 'crm', 'erp', 'fiscal'], para: 'profissional', desligar: true },
      { de: ['core', 'crm', 'erp', 'fiscal'], para: 'profissional', desligar: false },
    ];
    const divergentes = [];
    for (const c of cenarios) {
      // Sem plano antes: cada cenário é uma troca de verdade, nunca "o mesmo plano".
      await db.query('update public.tenants set plan_id = null where id = $1', [fx.t]);
      await db.query('delete from public.tenant_modules where tenant_id = $1', [fx.t]);
      await habilitar(fx.t, c.de);
      const { rows: pm } = await db.query(
        `select m.code from public.plan_modules x
         join public.plans p on p.id = x.plan_id join public.modules m on m.id = x.module_id
         where p.code = $1`,
        [c.para],
      );
      const previa = previewPlanChange({
        planModules: pm.map((r) => r.code),
        enabled: c.de,
        disableOutside: c.desligar,
      });
      const banco = await asUser(db, fx.super, async () => {
        const { rows } = await db.query('select public.admin_change_plan($1, $2, $3) as r', [
          fx.t,
          c.para,
          c.desligar,
        ]);
        return rows[0].r;
      });
      const core = { ligados: previa.enable, desligados: previa.disable };
      if (JSON.stringify(banco) !== JSON.stringify(core)) {
        divergentes.push(
          `${c.de} → ${c.para} (${c.desligar}): banco ${JSON.stringify(banco)}, Core ${JSON.stringify(core)}`,
        );
      }
    }
    assert.deepEqual(divergentes, []);
  });
});
