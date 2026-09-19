/**
 * `current_viewer()` — o contexto de acesso do usuário da requisição.
 *
 * Dois grupos de teste, e o segundo é o que importa mais:
 *
 *   1. O formato bate com o `Viewer` de @tivexy/core, e `decideAccess()`
 *      consegue consumir o que o banco devolve sem adaptação.
 *   2. A função não vaza. Ela é SECURITY DEFINER, então roda por fora do RLS —
 *      a segurança vem do filtro por `auth.uid()`, e isso precisa de prova.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { decideAccess, parseViewer } from '../../packages/core/src/index.ts';
import { addMember, asUser, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
const fx = {};

before(async () => {
  db = await createDatabase();

  fx.superAdmin = await createUser(db, { email: 'equipe@tivexy.com.br', isSuperAdmin: true });
  fx.estranho = await createUser(db, { email: 'estranho@fora.com.br' });

  fx.aurora = await createTenant(db, { slug: 'aurora', name: 'Café Aurora' });
  fx.base = await createTenant(db, { slug: 'base', name: 'Oficina Base' });

  fx.adminAurora = await createUser(db, { email: 'admin@aurora.com.br' });
  fx.colabAurora = await createUser(db, { email: 'joao@aurora.com.br' });
  fx.convidado = await createUser(db, { email: 'novo@aurora.com.br' });

  await addMember(db, { tenantId: fx.aurora, userId: fx.adminAurora, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.aurora, userId: fx.colabAurora, roleCode: 'collaborator' });
  await addMember(db, {
    tenantId: fx.aurora,
    userId: fx.convidado,
    roleCode: 'collaborator',
    status: 'invited',
  });

  // O plano profissional habilita 6 módulos no Aurora.
  await db.query(
    `insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
     select $1, pm.module_id, true, now()
     from public.plan_modules pm
     join public.tenants t on t.plan_id = pm.plan_id
     where t.id = $1`,
    [fx.aurora],
  );
});

after(async () => {
  await db?.close();
});

async function viewerDe(userId, tenantId = null) {
  return asUser(db, userId, async () => {
    const { rows } = await db.query('select public.current_viewer($1) as v', [tenantId]);
    return rows[0].v;
  });
}

describe('current_viewer — formato', () => {
  it('devolve todos os campos do Viewer', async () => {
    const v = await viewerDe(fx.adminAurora, fx.aurora);
    assert.deepEqual(
      Object.keys(v).sort(),
      [
        'enabledModules',
        'isSuperAdmin',
        'membershipStatus',
        'permissions',
        'tenant',
        'userId',
      ].sort(),
    );
    assert.equal(v.userId, fx.adminAurora);
    assert.equal(v.isSuperAdmin, false);
    assert.deepEqual(v.tenant, { id: fx.aurora, status: 'active' });
    assert.equal(v.membershipStatus, 'active');
  });

  it('o administrador recebe as 51 permissões e os 6 módulos do plano', async () => {
    const v = await viewerDe(fx.adminAurora, fx.aurora);
    assert.equal(v.permissions.length, 51);
    assert.equal(v.enabledModules.length, 6);
  });

  it('o colaborador recebe menos permissões que o administrador', async () => {
    const admin = await viewerDe(fx.adminAurora, fx.aurora);
    const colab = await viewerDe(fx.colabAurora, fx.aurora);
    assert.ok(colab.permissions.length < admin.permissions.length);
    assert.ok(colab.permissions.includes('crm.leads.read'));
    assert.ok(!colab.permissions.includes('core.roles.write'));
  });

  it('sem sessão devolve nulo', async () => {
    const { rows } = await db.query('select public.current_viewer(null) as v');
    assert.equal(rows[0].v, null);
  });

  it('sem tenant informado devolve a pessoa, sem empresa', async () => {
    const v = await viewerDe(fx.adminAurora, null);
    assert.equal(v.userId, fx.adminAurora);
    assert.equal(v.tenant, null);
    assert.equal(v.membershipStatus, null);
    assert.deepEqual(v.permissions, []);
  });
});

describe('current_viewer — não vaza', () => {
  it('estranho não descobre sequer que o tenant existe', async () => {
    const v = await viewerDe(fx.estranho, fx.aurora);
    assert.equal(v.userId, fx.estranho);
    assert.equal(v.tenant, null, 'devolver o tenant já confirmaria que ele existe');
    assert.equal(v.membershipStatus, null);
    assert.deepEqual(v.permissions, []);
    assert.deepEqual(v.enabledModules, []);
  });

  it('membro de um tenant não vê nada do outro', async () => {
    const v = await viewerDe(fx.adminAurora, fx.base);
    assert.equal(v.tenant, null);
    assert.deepEqual(v.permissions, []);
    assert.deepEqual(v.enabledModules, []);
  });

  it('convite pendente vê a empresa, mas não ganha permissão nem módulo', async () => {
    // A tela de convite precisa nomear a empresa; o acesso a dado, não.
    const v = await viewerDe(fx.convidado, fx.aurora);
    assert.deepEqual(v.tenant, { id: fx.aurora, status: 'active' });
    assert.equal(v.membershipStatus, 'invited');
    assert.deepEqual(v.permissions, [], 'convite pendente não carrega permissão');
    assert.deepEqual(v.enabledModules, [], 'nem descobre o que a empresa contratou');
  });

  it('super admin enxerga qualquer tenant', async () => {
    const v = await viewerDe(fx.superAdmin, fx.base);
    assert.equal(v.isSuperAdmin, true);
    assert.deepEqual(v.tenant, { id: fx.base, status: 'active' });
  });
});

describe('current_viewer alimenta decideAccess sem adaptação', () => {
  it('administrador entra onde precisa de permissão', async () => {
    const v = parseViewer(await viewerDe(fx.adminAurora, fx.aurora));
    assert.equal(decideAccess({ kind: 'member' }, v).allowed, true);
    assert.equal(
      decideAccess({ kind: 'permission', permission: 'core.roles.write' }, v).allowed,
      true,
    );
    assert.equal(decideAccess({ kind: 'superAdmin' }, v).allowed, false);
  });

  it('colaborador é barrado no que não tem', async () => {
    const v = parseViewer(await viewerDe(fx.colabAurora, fx.aurora));
    assert.equal(
      decideAccess({ kind: 'permission', permission: 'crm.leads.read' }, v).allowed,
      true,
    );
    const negado = decideAccess({ kind: 'permission', permission: 'core.roles.write' }, v);
    assert.equal(negado.allowed, false);
    assert.equal(negado.reason, 'missing-permission');
  });

  it('convidado cai em membership-inactive e é mandado para o convite', async () => {
    const v = parseViewer(await viewerDe(fx.convidado, fx.aurora));
    const decisao = decideAccess({ kind: 'member' }, v);
    assert.equal(decisao.allowed, false);
    assert.equal(decisao.reason, 'membership-inactive');
    // E a rota de destino aceita quem foi mandado para lá.
    assert.equal(decideAccess({ kind: 'authenticated' }, v).allowed, true);
  });

  it('estranho cai em no-tenant', async () => {
    const v = parseViewer(await viewerDe(fx.estranho, fx.aurora));
    const decisao = decideAccess({ kind: 'member' }, v);
    assert.equal(decisao.allowed, false);
    assert.equal(decisao.reason, 'no-tenant');
  });

  it('super admin passa em tudo', async () => {
    const v = parseViewer(await viewerDe(fx.superAdmin, fx.base));
    assert.equal(decideAccess({ kind: 'superAdmin' }, v).allowed, true);
    assert.equal(decideAccess({ kind: 'member' }, v).allowed, true);
    assert.equal(
      decideAccess({ kind: 'permission', permission: 'fiscal.documents.write' }, v).allowed,
      true,
    );
  });
});

describe('my_tenants', () => {
  it('lista os tenants da pessoa, incluindo convite pendente', async () => {
    const linhas = await asUser(db, fx.convidado, async () => {
      const { rows } = await db.query('select * from public.my_tenants()');
      return rows;
    });
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].slug, 'aurora');
    assert.equal(linhas[0].membership, 'invited');
  });

  it('não lista tenant de que a pessoa não participa', async () => {
    const linhas = await asUser(db, fx.adminAurora, async () => {
      const { rows } = await db.query('select slug from public.my_tenants()');
      return rows.map((r) => r.slug);
    });
    assert.deepEqual(linhas, ['aurora']);
  });

  it('para quem não pertence a nada, devolve vazio', async () => {
    const linhas = await asUser(db, fx.estranho, async () => {
      const { rows } = await db.query('select * from public.my_tenants()');
      return rows;
    });
    assert.deepEqual(linhas, []);
  });
});
