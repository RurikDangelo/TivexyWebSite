/**
 * A empresa não fica sem administrador.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { addMember, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
const fx = {};

const papel = async (codigo) =>
  (await db.query(`select id from public.roles where code = $1 and tenant_id is null`, [codigo]))
    .rows[0].id;

/*
 * Um banco por teste: os testes daqui apagam vínculo, empresa e conta, e o
 * seguinte precisa do cenário inteiro. Cada instância é fechada antes da
 * próxima — PGlite aberto segura o processo, e o arquivo nunca terminaria.
 */
beforeEach(async () => {
  await db?.close();
  db = await createDatabase();
  fx.tenant = await createTenant(db, { slug: 'equipe-a', name: 'Equipe' });
  fx.ana = await createUser(db, { email: 'ana@equipe.test', fullName: 'Ana' });
  fx.beto = await createUser(db, { email: 'beto@equipe.test', fullName: 'Beto' });
  fx.vinculoAna = await addMember(db, {
    tenantId: fx.tenant,
    userId: fx.ana,
    roleCode: 'tenant_admin',
  });
  fx.vinculoBeto = await addMember(db, {
    tenantId: fx.tenant,
    userId: fx.beto,
    roleCode: 'collaborator',
  });
});

after(async () => {
  await db?.close();
});

describe('a última pessoa administradora', () => {
  it('não sai', async () => {
    await assert.rejects(
      db.query('delete from public.tenant_users where id = $1', [fx.vinculoAna]),
      /ficaria sem administrador/,
    );
  });

  it('não é rebaixada', async () => {
    await assert.rejects(
      db.query('update public.tenant_users set role_id = $1 where id = $2', [
        await papel('manager'),
        fx.vinculoAna,
      ]),
      /ficaria sem administrador/,
    );
  });

  it('não é suspensa', async () => {
    await assert.rejects(
      db.query(`update public.tenant_users set status = 'suspended' where id = $1`, [
        fx.vinculoAna,
      ]),
      /ficaria sem administrador/,
    );
  });

  it('com outra administradora ativa, pode tudo isso', async () => {
    await db.query('update public.tenant_users set role_id = $1 where id = $2', [
      await papel('tenant_admin'),
      fx.vinculoBeto,
    ]);
    await db.query(`update public.tenant_users set status = 'suspended' where id = $1`, [
      fx.vinculoAna,
    ]);
    await db.query('delete from public.tenant_users where id = $1', [fx.vinculoAna]);
  });

  it('administrador com convite pendente não conta — ele ainda não administra', async () => {
    const carla = await createUser(db, { email: 'carla@equipe.test', fullName: 'Carla' });
    await addMember(db, {
      tenantId: fx.tenant,
      userId: carla,
      roleCode: 'tenant_admin',
      status: 'invited',
    });
    await assert.rejects(
      db.query('delete from public.tenant_users where id = $1', [fx.vinculoAna]),
      /ficaria sem administrador/,
    );
  });

  it('mexer em quem não é administrador continua livre', async () => {
    await db.query(`update public.tenant_users set status = 'suspended' where id = $1`, [
      fx.vinculoBeto,
    ]);
    await db.query('delete from public.tenant_users where id = $1', [fx.vinculoBeto]);
  });
});

describe('cascata passa', () => {
  it('apagar a empresa apaga os vínculos, inclusive o do último administrador', async () => {
    await db.query('delete from public.tenants where id = $1', [fx.tenant]);
    const { rows } = await db.query('select 1 from public.tenant_users where tenant_id = $1', [
      fx.tenant,
    ]);
    assert.equal(rows.length, 0);
  });

  it('apagar a conta da pessoa apaga o vínculo dela', async () => {
    await db.query('delete from auth.users where id = $1', [fx.ana]);
    const { rows } = await db.query('select 1 from public.tenant_users where user_id = $1', [
      fx.ana,
    ]);
    assert.equal(rows.length, 0);
  });
});

describe('ninguém dá um papel com mais poder que o seu', () => {
  const comoUsuario = async (userId, sql, params) => {
    await db.exec('begin');
    try {
      await db.query(`set local request.jwt.claim.sub = '${userId}'`);
      await db.exec('set local role authenticated');
      return await db.query(sql, params);
    } finally {
      await db.exec('rollback');
    }
  };

  it('o gestor não se promove a administrador', async () => {
    const gestor = await createUser(db, { email: 'gestor@equipe.test', fullName: 'Gestor' });
    const vinculo = await addMember(db, {
      tenantId: fx.tenant,
      userId: gestor,
      roleCode: 'manager',
    });
    await assert.rejects(
      comoUsuario(gestor, 'update public.tenant_users set role_id = $1 where id = $2', [
        await papel('tenant_admin'),
        vinculo,
      ]),
      /permissões que você mesmo não tem/,
    );
  });

  it('nem promove outra pessoa', async () => {
    const gestor = await createUser(db, { email: 'gestor2@equipe.test', fullName: 'Gestor' });
    await addMember(db, { tenantId: fx.tenant, userId: gestor, roleCode: 'manager' });
    await assert.rejects(
      comoUsuario(gestor, 'update public.tenant_users set role_id = $1 where id = $2', [
        await papel('tenant_admin'),
        fx.vinculoBeto,
      ]),
      /permissões que você mesmo não tem/,
    );
  });

  it('nem convida alguém já como administrador', async () => {
    const gestor = await createUser(db, { email: 'gestor3@equipe.test', fullName: 'Gestor' });
    await addMember(db, { tenantId: fx.tenant, userId: gestor, roleCode: 'manager' });
    const nova = await createUser(db, { email: 'nova@equipe.test', fullName: 'Nova' });
    await assert.rejects(
      comoUsuario(
        gestor,
        `insert into public.tenant_users (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'invited')`,
        [fx.tenant, nova, await papel('tenant_admin')],
      ),
      /permissões que você mesmo não tem/,
    );
  });

  it('o gestor ainda convida e rebaixa dentro do que ele tem', async () => {
    const gestor = await createUser(db, { email: 'gestor4@equipe.test', fullName: 'Gestor' });
    await addMember(db, { tenantId: fx.tenant, userId: gestor, roleCode: 'manager' });
    const nova = await createUser(db, { email: 'nova2@equipe.test', fullName: 'Nova' });
    const r = await comoUsuario(
      gestor,
      `insert into public.tenant_users (tenant_id, user_id, role_id, status) values ($1, $2, $3, 'invited') returning id`,
      [fx.tenant, nova, await papel('collaborator')],
    );
    assert.equal(r.rows.length, 1);
  });

  it('o administrador dá qualquer papel', async () => {
    const r = await comoUsuario(
      fx.ana,
      'update public.tenant_users set role_id = $1 where id = $2 returning id',
      [await papel('tenant_admin'), fx.vinculoBeto],
    );
    assert.equal(r.rows.length, 1);
  });
});
