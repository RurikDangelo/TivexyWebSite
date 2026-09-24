/**
 * Testes do ciclo de vida do cliente.
 *
 * Duas funções `SECURITY DEFINER`, e portanto duas que rodam fora do RLS.
 * O que precisa ser provado, nesta ordem de importância:
 *
 *   1. **Quem não é plataforma não passa.** Administrador de tenant é a
 *      figura perigosa aqui: ele tem `core.tenant.write` e poderia achar que
 *      isso inclui trocar o próprio plano.
 *   2. Trocar de plano sincroniza `tenant_modules`, que é a fonte de verdade
 *      sobre acesso — trocar só `plan_id` deixaria o cliente pagando por um
 *      módulo que não abre.
 *   3. Rebaixar **desabilita e não apaga**.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

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

async function estadoDoTenant(id) {
  const { rows } = await db.query('select status from public.tenants where id = $1', [id]);
  return rows[0]?.status ?? null;
}

async function modulosHabilitados(tenantId) {
  const { rows } = await db.query(
    `select m.code
       from public.tenant_modules tm
       join public.modules m on m.id = tm.module_id
      where tm.tenant_id = $1 and tm.is_enabled
      order by m.code`,
    [tenantId],
  );
  return rows.map((l) => l.code);
}

async function linhasDeModulo(tenantId) {
  const { rows } = await db.query(
    'select count(*)::int as n from public.tenant_modules where tenant_id = $1',
    [tenantId],
  );
  return rows[0].n;
}

before(async () => {
  db = await createDatabase();

  fx.plataforma = await createUser(db, {
    email: 'plataforma@tivexy.teste',
    fullName: 'Plataforma',
    isSuperAdmin: true,
  });

  fx.tenant = await createTenant(db, { slug: 'ciclo', name: 'Ciclo', planCode: 'profissional' });
  fx.dono = await createUser(db, { email: 'dono@ciclo.teste', fullName: 'Dono' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.dono, roleCode: 'tenant_admin' });
});

after(async () => {
  await db?.close?.();
});

/* ── 1. Quem pode ──────────────────────────────────────────────────────── */

describe('só a plataforma opera o ciclo de vida', () => {
  it('administrador do tenant não suspende o próprio cliente', async () => {
    /*
     * A figura perigosa. Ele tem `core.tenant.write` — que o deixa editar
     * nome e configurações — e poderia achar que isso alcança o estado. Não
     * alcança, e o `update` direto nem chega lá: o privilégio de coluna já
     * tirou `status` de `authenticated`.
     */
    await assert.rejects(
      asUserCommitting(db, fx.dono, () =>
        db.query("select public.admin_set_tenant_status($1, 'suspended')", [fx.tenant]),
      ),
      /Só a plataforma/,
    );
    assert.equal(await estadoDoTenant(fx.tenant), 'active');
  });

  it('administrador do tenant não troca o próprio plano', async () => {
    await assert.rejects(
      asUserCommitting(db, fx.dono, () =>
        db.query("select * from public.admin_set_tenant_plan($1, 'avancado')", [fx.tenant]),
      ),
      /Só a plataforma/,
    );
  });

  it('quem não tem sessão nenhuma também não', async () => {
    await assert.rejects(
      db.query("select public.admin_set_tenant_status($1, 'suspended')", [fx.tenant]),
      /Só a plataforma|permission denied/,
    );
  });

  it('o privilégio de coluna sustenta o mesmo, sem depender da função', async () => {
    // A função é a porta; isto é a parede. Mesmo que alguém reescrevesse a
    // função errado, `status` continua fora do alcance de `authenticated`.
    await assert.rejects(
      asUser(db, fx.dono, () =>
        db.query("update public.tenants set status = 'suspended' where id = $1", [fx.tenant]),
      ),
      /permission denied|row-level security/i,
    );
  });
});

/* ── 2. As transições ──────────────────────────────────────────────────── */

describe('as transições de estado', () => {
  it('ativo suspende e volta', async () => {
    const t = await createTenant(db, { slug: 'vaivem', name: 'Vai e Vem' });

    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select public.admin_set_tenant_status($1, 'suspended', 'inadimplência')", [t]),
    );
    assert.equal(await estadoDoTenant(t), 'suspended');

    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select public.admin_set_tenant_status($1, 'active')", [t]),
    );
    assert.equal(await estadoDoTenant(t), 'active');
  });

  it('pedir o estado que já vale não é erro — é clique repetido', async () => {
    const t = await createTenant(db, { slug: 'repetido', name: 'Repetido' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select public.admin_set_tenant_status($1, 'active')", [t]),
    );
    assert.equal(await estadoDoTenant(t), 'active');
  });

  it('cliente em provisionamento não se suspende — se desfaz', async () => {
    /*
     * Um cliente pela metade não tem papéis nem módulos garantidos.
     * Suspendê-lo congelaria o meio do caminho; quem sabe desfazer na ordem
     * inversa é `compensateProvisioning`, que já existe.
     */
    const t = await createTenant(db, { slug: 'meio-ciclo', name: 'Meio' });
    await db.query("update public.tenants set status = 'provisioning' where id = $1", [t]);

    await assert.rejects(
      asUserCommitting(db, fx.plataforma, () =>
        db.query("select public.admin_set_tenant_status($1, 'suspended')", [t]),
      ),
      /Não dá para ir de provisioning/,
    );
  });

  it('cancelado é terminal: não ressuscita por troca de estado', async () => {
    const t = await createTenant(db, { slug: 'cancelado', name: 'Cancelado' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select public.admin_set_tenant_status($1, 'cancelled')", [t]),
    );

    await assert.rejects(
      asUserCommitting(db, fx.plataforma, () =>
        db.query("select public.admin_set_tenant_status($1, 'active')", [t]),
      ),
      /Não dá para ir de cancelled/,
    );
  });

  it('a mudança fica na auditoria, com de e para', async () => {
    const t = await createTenant(db, { slug: 'auditado', name: 'Auditado' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select public.admin_set_tenant_status($1, 'suspended', 'uso indevido')", [t]),
    );

    const { rows } = await db.query(
      `select metadata from public.audit_logs
        where tenant_id = $1 and action = 'core.tenant.status_changed'`,
      [t],
    );
    assert.equal(rows.length, 1);
    assert.equal(typeof rows[0].metadata, 'object', 'metadata virou texto — falta ::text::jsonb');
    assert.equal(rows[0].metadata.de, 'active');
    assert.equal(rows[0].metadata.para, 'suspended');
    assert.equal(rows[0].metadata.motivo, 'uso indevido');
  });
});

/* ── 3. Plano e módulos ────────────────────────────────────────────────── */

describe('trocar de plano sincroniza os módulos', () => {
  it('subir de plano habilita o que entrou', async () => {
    /*
     * O ponto do teste: `tenant_modules` é a fonte de verdade sobre acesso,
     * não `plans`. Trocar só `plan_id` deixaria o cliente pagando por um
     * módulo que não abre — e o sintoma seria a navegação mostrar o item
     * desabilitado, sem erro nenhum.
     */
    const t = await createTenant(db, { slug: 'sobe', name: 'Sobe', planCode: 'essencial' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'essencial')", [t]),
    );
    const antes = await modulosHabilitados(t);

    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'avancado')", [t]),
    );
    const depois = await modulosHabilitados(t);

    assert.ok(depois.length > antes.length, `esperava ganhar módulo: ${antes} → ${depois}`);
    for (const modulo of antes) {
      assert.ok(depois.includes(modulo), `${modulo} sumiu ao subir de plano`);
    }
  });

  it('rebaixar desabilita — e não apaga', async () => {
    const t = await createTenant(db, { slug: 'desce', name: 'Desce', planCode: 'avancado' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'avancado')", [t]),
    );
    const linhasAntes = await linhasDeModulo(t);
    const habilitadosAntes = await modulosHabilitados(t);

    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'essencial')", [t]),
    );

    const habilitadosDepois = await modulosHabilitados(t);
    assert.ok(habilitadosDepois.length < habilitadosAntes.length, 'rebaixar não desabilitou nada');
    assert.equal(
      await linhasDeModulo(t),
      linhasAntes,
      'rebaixar apagou linha de módulo — o dado é do cliente',
    );
  });

  it('voltar ao plano maior reacende o que estava apagado', async () => {
    // O motivo de desabilitar em vez de apagar: quem volta encontra tudo
    // como deixou, sem reprovisionar.
    const t = await createTenant(db, { slug: 'volta', name: 'Volta', planCode: 'avancado' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'avancado')", [t]),
    );
    const completo = await modulosHabilitados(t);

    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'essencial')", [t]),
    );
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'avancado')", [t]),
    );

    assert.deepEqual(await modulosHabilitados(t), completo);
  });

  it('plano que não existe é recusado, e nada muda', async () => {
    const t = await createTenant(db, { slug: 'inexistente', name: 'Inexistente' });
    const antes = await modulosHabilitados(t);

    await assert.rejects(
      asUserCommitting(db, fx.plataforma, () =>
        db.query("select * from public.admin_set_tenant_plan($1, 'plano_de_ouro')", [t]),
      ),
      /não existe/,
    );
    assert.deepEqual(await modulosHabilitados(t), antes);
  });

  it('a troca fica na auditoria, com a conta do que mudou', async () => {
    const t = await createTenant(db, { slug: 'conta', name: 'Conta', planCode: 'essencial' });
    await asUserCommitting(db, fx.plataforma, () =>
      db.query("select * from public.admin_set_tenant_plan($1, 'avancado')", [t]),
    );

    const { rows } = await db.query(
      `select metadata from public.audit_logs
        where tenant_id = $1 and action = 'core.tenant.plan_changed'`,
      [t],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metadata.para, 'avancado');
    assert.equal(typeof rows[0].metadata.modulos_habilitados, 'number');
  });
});
