/**
 * Aceitar convite.
 *
 * A função é SECURITY DEFINER — passa por cima do RLS de `tenant_users`, que
 * negaria justamente quem precisa dela. Então o que estes testes mais cobram
 * não é que ela funciona: é que ela **só** faz o que deve. O convite de outra
 * pessoa, a empresa de um estranho, o acesso suspenso — cada um tem teste.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import {
  addMember,
  asAnon,
  asUser,
  asUserCommitting,
  createDatabase,
  createTenant,
  createUser,
} from './harness.mjs';

let db;
const fx = {};

const aceitar = (userId, tenantId) =>
  asUserCommitting(db, userId, async () => {
    const { rows } = await db.query('select public.accept_invitation($1) as r', [tenantId]);
    return rows[0].r;
  });

async function vinculo(userId, tenantId) {
  const { rows } = await db.query(
    'select status, joined_at from public.tenant_users where user_id = $1 and tenant_id = $2',
    [userId, tenantId],
  );
  return rows[0] ?? null;
}

async function aceitacoesRegistradas(tenantId) {
  const { rows } = await db.query(
    `select actor_user_id from public.audit_logs
     where tenant_id = $1 and action = 'membership.accepted'`,
    [tenantId],
  );
  return rows;
}

before(async () => {
  db = await createDatabase();
});

/*
 * Cada teste começa do zero: a aceitação persiste (`asUserCommitting`), e um
 * vínculo ativado num teste mudaria o que o seguinte encontra.
 */
beforeEach(async () => {
  await db.exec(`
    delete from public.audit_logs;
    delete from public.tenant_users;
    delete from public.tenants;
    delete from auth.users;
  `);

  fx.empresa = await createTenant(db, { slug: 'convite-sa', name: 'Convite S.A.' });
  fx.outra = await createTenant(db, { slug: 'outra-ltda', name: 'Outra Ltda.' });

  fx.convidada = await createUser(db, { email: 'ana@convite.test', fullName: 'Ana' });
  fx.estranho = await createUser(db, { email: 'beto@fora.test', fullName: 'Beto' });
  fx.admin = await createUser(db, { email: 'carla@convite.test', fullName: 'Carla' });

  await addMember(db, { tenantId: fx.empresa, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, {
    tenantId: fx.empresa,
    userId: fx.convidada,
    roleCode: 'collaborator',
    status: 'invited',
  });
});

describe('accept_invitation', () => {
  it('ativa o vínculo, carimba a entrada e registra quem aceitou', async () => {
    const r = await aceitar(fx.convidada, fx.empresa);

    assert.equal(r.accepted, true);
    assert.equal(r.slug, 'convite-sa');

    const v = await vinculo(fx.convidada, fx.empresa);
    assert.equal(v.status, 'active');
    assert.ok(v.joined_at instanceof Date);

    const registros = await aceitacoesRegistradas(fx.empresa);
    assert.deepEqual(
      registros.map((r) => r.actor_user_id),
      [fx.convidada],
    );
  });

  it('depois de aceitar, a pessoa passa no RLS da empresa', async () => {
    const antes = await asUser(db, fx.convidada, async () => {
      const { rows } = await db.query('select public.is_tenant_member($1) as m', [fx.empresa]);
      return rows[0].m;
    });
    assert.equal(antes, false, 'convite pendente não pode dar acesso');

    await aceitar(fx.convidada, fx.empresa);

    const depois = await asUser(db, fx.convidada, async () => {
      const { rows } = await db.query('select public.is_tenant_member($1) as m', [fx.empresa]);
      return rows[0].m;
    });
    assert.equal(depois, true);
  });

  it('aceitar de novo não é erro, e não registra a aceitação duas vezes', async () => {
    await aceitar(fx.convidada, fx.empresa);
    const segunda = await aceitar(fx.convidada, fx.empresa);

    assert.equal(segunda.accepted, false);
    assert.equal((await aceitacoesRegistradas(fx.empresa)).length, 1);
  });

  it('não aceita o convite de outra pessoa', async () => {
    /*
     * O cerne da função. Ela é DEFINER: se o filtro por `auth.uid()` sumisse,
     * qualquer um ativaria o convite de qualquer um — inclusive o seu próprio
     * vínculo numa empresa onde foi convidado por engano.
     */
    await assert.rejects(aceitar(fx.estranho, fx.empresa), /convite não encontrado/);
    assert.equal((await vinculo(fx.convidada, fx.empresa)).status, 'invited');
    assert.equal(await vinculo(fx.estranho, fx.empresa), null);
  });

  it('para um estranho, empresa que existe e empresa que não existe dão a mesma resposta', async () => {
    const existe = await aceitar(fx.estranho, fx.outra).catch((e) => e.message);
    const naoExiste = await aceitar(fx.estranho, '00000000-0000-4000-8000-000000000000').catch(
      (e) => e.message,
    );
    assert.equal(existe, 'convite não encontrado');
    assert.equal(existe, naoExiste);
  });

  it('acesso suspenso continua suspenso', async () => {
    await db.query(
      `update public.tenant_users set status = 'suspended', joined_at = now()
       where user_id = $1 and tenant_id = $2`,
      [fx.convidada, fx.empresa],
    );

    await assert.rejects(aceitar(fx.convidada, fx.empresa), /suspenso/);
    assert.equal((await vinculo(fx.convidada, fx.empresa)).status, 'suspended');
  });

  it('empresa cancelada não recebe ninguém', async () => {
    await db.query(`update public.tenants set status = 'cancelled' where id = $1`, [fx.empresa]);

    await assert.rejects(aceitar(fx.convidada, fx.empresa), /não está mais ativa/);
    assert.equal((await vinculo(fx.convidada, fx.empresa)).status, 'invited');
  });

  it('empresa ainda em preparo aceita — a pessoa espera em /preparando, já como membro', async () => {
    await db.query(`update public.tenants set status = 'provisioning' where id = $1`, [fx.empresa]);

    const r = await aceitar(fx.convidada, fx.empresa);
    assert.equal(r.accepted, true);
    assert.equal(r.status, 'provisioning');
  });

  it('visitante sem sessão não consegue nem chamar', async () => {
    await assert.rejects(
      asAnon(db, () => db.query('select public.accept_invitation($1)', [fx.empresa])),
      /permission denied/,
    );
  });

  it('sem a função, o RLS nega a escrita direta — é por isso que ela existe', async () => {
    const atualizadas = await asUser(db, fx.convidada, async () => {
      const { rows } = await db.query(
        `update public.tenant_users set status = 'active', joined_at = now()
         where user_id = $1 and tenant_id = $2
         returning id`,
        [fx.convidada, fx.empresa],
      );
      return rows.length;
    });
    assert.equal(atualizadas, 0);
  });
});
