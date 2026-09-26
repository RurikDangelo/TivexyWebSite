/**
 * Configurações se escrevem com `core.settings.write` — e só por aqui.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

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

async function criar(tabela, valores) {
  const colunas = Object.keys(valores);
  const { rows } = await db.query(
    `insert into public.${tabela} (${colunas.join(', ')}) values (${colunas.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(valores),
  );
  return rows[0].id;
}

before(async () => {
  db = await createDatabase();
  fx.tenant = await createTenant(db, { slug: 'config-a', name: 'Config' });
  fx.outro = await createTenant(db, { slug: 'config-b', name: 'Outro' });
  fx.admin = await createUser(db, { email: 'admin@config.test', fullName: 'Admin' });
  fx.gestor = await createUser(db, { email: 'gestor@config.test', fullName: 'Gestor' });
  fx.estranho = await createUser(db, { email: 'estranho@config.test', fullName: 'Estranho' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.gestor, roleCode: 'manager' });
  await addMember(db, { tenantId: fx.outro, userId: fx.estranho, roleCode: 'tenant_admin' });

  /* Só configurações: escreve settings e não o cadastro da empresa. */
  const papel = await criar('roles', {
    tenant_id: fx.tenant,
    code: 'so_config',
    name: 'Só configurações',
    is_system: false,
  });
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, id from public.permissions where code in ('core.settings.read', 'core.settings.write')`,
    [papel],
  );
  fx.configurador = await createUser(db, { email: 'cfg@config.test', fullName: 'Configurador' });
  await db.query(
    `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [fx.tenant, fx.configurador, papel],
  );
});

const gravar = (userId, tenant, settings) =>
  asUserCommitting(db, userId, () =>
    db.query('select public.update_tenant_settings($1, $2::text::jsonb)', [
      tenant,
      JSON.stringify(settings),
    ]),
  );

const lidas = async (tenant) =>
  (await db.query('select settings from public.tenants where id = $1', [tenant])).rows[0].settings;

describe('update_tenant_settings', () => {
  it('quem tem core.settings.write grava — mesmo sem core.tenant.write', async () => {
    await gravar(fx.configurador, fx.tenant, { 'core.timezone': 'America/Manaus' });
    assert.deepEqual(await lidas(fx.tenant), { 'core.timezone': 'America/Manaus' });
  });

  it('o gestor não tem core.settings.write, e não grava', async () => {
    await assert.rejects(gravar(fx.gestor, fx.tenant, {}), /permissão/);
    assert.deepEqual(await lidas(fx.tenant), { 'core.timezone': 'America/Manaus' });
  });

  it('administrador de outra empresa não grava nesta', async () => {
    await assert.rejects(gravar(fx.estranho, fx.tenant, {}), /permissão/);
  });

  it('a mudança fica na auditoria, com o antes e o depois', async () => {
    await gravar(fx.admin, fx.tenant, { 'inventory.deduct_on_sale': false });
    const { rows } = await db.query(
      `select actor_user_id, metadata from public.audit_logs
       where tenant_id = $1 and action = 'tenant.settings_updated'
       order by created_at desc limit 1`,
      [fx.tenant],
    );
    assert.equal(rows[0].actor_user_id, fx.admin);
    assert.deepEqual(rows[0].metadata.antes, { 'core.timezone': 'America/Manaus' });
    assert.deepEqual(rows[0].metadata.depois, { 'inventory.deduct_on_sale': false });
  });

  it('formato que não é objeto é recusado', async () => {
    await assert.rejects(gravar(fx.admin, fx.tenant, ['x']), /objeto/);
  });
});

describe('o caminho direto fechou', () => {
  it('nem o administrador escreve settings por update — só pela função', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(`update public.tenants set settings = '{}'::jsonb where id = $1`, [fx.tenant]),
      ),
      /permission denied/,
    );
  });

  it('o cadastro da empresa continua editável por quem tem core.tenant.write', async () => {
    const r = await asUser(db, fx.admin, () =>
      db.query(`update public.tenants set legal_name = 'Config Ltda.' where id = $1 returning id`, [
        fx.tenant,
      ]),
    );
    assert.equal(r.rows.length, 1);
  });
});
