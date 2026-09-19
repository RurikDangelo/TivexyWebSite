/**
 * Integridade entre tenants — tentativas de burlar, não de usar.
 *
 * Os testes de `core.test.mjs` provam que o RLS nega leitura e escrita óbvias.
 * Aqui a pergunta é outra: e o que o RLS **não** cobre?
 *
 * RLS decide quais LINHAS alguém enxerga. Ele não verifica se os valores dentro
 * da linha fazem sentido juntos. Um vínculo pode apontar para um papel de outro
 * tenant, uma equipe pode receber um membro de outra empresa — e a política de
 * escrita, que só olha o `tenant_id` da linha, aprova. Essa consistência é
 * trabalho de constraint, não de política.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addMember, asUser, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
const fx = {};

before(async () => {
  db = await createDatabase();

  fx.aurora = await createTenant(db, { slug: 'aurora', name: 'Aurora' });
  fx.base = await createTenant(db, { slug: 'base', name: 'Base' });

  fx.adminAurora = await createUser(db, { email: 'admin@aurora.com' });
  fx.adminBase = await createUser(db, { email: 'admin@base.com' });
  fx.colabAurora = await createUser(db, { email: 'joao@aurora.com' });

  await addMember(db, { tenantId: fx.aurora, userId: fx.adminAurora, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.base, userId: fx.adminBase, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.aurora, userId: fx.colabAurora, roleCode: 'collaborator' });

  // Papel próprio da Base, e uma equipe da Base.
  const { rows: papel } = await db.query(
    `insert into public.roles (tenant_id, code, name) values ($1, 'proprio_base', 'Próprio Base')
     returning id`,
    [fx.base],
  );
  fx.papelDaBase = papel[0].id;

  const { rows: equipe } = await db.query(
    `insert into public.teams (tenant_id, name) values ($1, 'Bancada') returning id`,
    [fx.base],
  );
  fx.equipeDaBase = equipe[0].id;

  const { rows: vinculo } = await db.query(
    `select id from public.tenant_users where tenant_id = $1 and user_id = $2`,
    [fx.aurora, fx.colabAurora],
  );
  fx.vinculoDaAurora = vinculo[0].id;
});

after(async () => {
  await db?.close();
});

/*
 * Estes rodam SEM RLS, como superusuário — que é como o backend roda quando usa
 * `service_role` para provisionar. Se o esquema não impedir, um defeito no
 * código de provisionamento vira dado cruzado entre clientes, e o RLS não salva:
 * a linha já estaria gravada com o tenant_id certo.
 */
describe('o esquema impede combinação cruzada, mesmo sem RLS', () => {
  it('vínculo não aceita papel de outro tenant', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
           values ($1, $2, $3, 'active', now())`,
          [fx.aurora, fx.adminBase, fx.papelDaBase],
        ),
      /tenant_users_role_do_tenant|foreign key|violates/i,
      'um papel da Base atribuído dentro da Aurora daria permissões cruzadas',
    );
  });

  it('vínculo aceita papel de sistema', async () => {
    // O caso legítimo precisa continuar funcionando: papel de sistema tem
    // tenant_id nulo e vale para todos.
    const { rows } = await db.query(
      `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
       values ($1, $2, (select id from public.roles where code = 'manager' and tenant_id is null),
               'active', now())
       returning id`,
      [fx.base, fx.colabAurora],
    );
    assert.ok(rows[0].id);
    await db.query('delete from public.tenant_users where id = $1', [rows[0].id]);
  });

  it('vínculo aceita papel próprio do mesmo tenant', async () => {
    const { rows } = await db.query(
      `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
       values ($1, $2, $3, 'active', now())
       returning id`,
      [fx.base, fx.colabAurora, fx.papelDaBase],
    );
    assert.ok(rows[0].id);
    await db.query('delete from public.tenant_users where id = $1', [rows[0].id]);
  });

  it('equipe não aceita membro de outro tenant', async () => {
    await assert.rejects(
      () =>
        db.query(`insert into public.team_members (team_id, tenant_user_id) values ($1, $2)`, [
          fx.equipeDaBase,
          fx.vinculoDaAurora,
        ]),
      /team_members_mesmo_tenant|foreign key|violates/i,
      'alguém da Aurora dentro de uma equipe da Base',
    );
  });
});

/* Com RLS, do ponto de vista de quem administra outro tenant. */
describe('administrador de um tenant não alcança o outro', () => {
  it('não se adiciona ao tenant alheio', async () => {
    await asUser(db, fx.adminBase, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
             values ($1, $2,
               (select id from public.roles where code = 'tenant_admin' and tenant_id is null),
               'active', now())`,
            [fx.aurora, fx.adminBase],
          ),
        /row-level security/i,
      );
    });
  });

  it('não altera vínculo do tenant alheio', async () => {
    const afetadas = await asUser(db, fx.adminBase, async () => {
      const r = await db.query(
        `update public.tenant_users set status = 'suspended' where tenant_id = $1`,
        [fx.aurora],
      );
      return r.affectedRows ?? 0;
    });
    assert.equal(afetadas, 0);
  });

  it('não cria papel dentro do tenant alheio', async () => {
    await asUser(db, fx.adminBase, async () => {
      await assert.rejects(
        () =>
          db.query(`insert into public.roles (tenant_id, code, name) values ($1, 'intruso', 'X')`, [
            fx.aurora,
          ]),
        /row-level security/i,
      );
    });
  });

  it('não habilita módulo no tenant alheio — nem no próprio', async () => {
    // Habilitar módulo é decisão comercial da plataforma, não do tenant.
    //
    // Uma tentativa por transação: a primeira recusa aborta a transação, e a
    // segunda só devolveria "current transaction is aborted" — o que passaria
    // por sucesso sem o RLS ter sido consultado.
    for (const alvo of [fx.aurora, fx.base]) {
      await asUser(db, fx.adminBase, async () => {
        await assert.rejects(
          () =>
            db.query(
              `insert into public.tenant_modules (tenant_id, module_id, is_enabled)
               select $1, id, true from public.modules where code = 'fiscal'`,
              [alvo],
            ),
          /row-level security/i,
        );
      });
    }
  });

  it('não se promove a Super Admin', async () => {
    // A política users_update_self permite editar a PRÓPRIA LINHA — e o RLS
    // não expressa restrição de COLUNA. Sem privilégio de coluna, este update
    // era aceito, e Super Admin enxerga todos os tenants da plataforma.
    await asUser(db, fx.adminBase, async () => {
      await assert.rejects(
        () =>
          db.query(`update public.users set is_super_admin = true where id = $1`, [fx.adminBase]),
        /permission denied|privilege/i,
        'escalada de privilégio: qualquer pessoa viraria plataforma',
      );
    });

    const { rows } = await db.query('select is_super_admin from public.users where id = $1', [
      fx.adminBase,
    ]);
    assert.equal(rows[0].is_super_admin, false);
  });

  it('continua podendo editar o próprio nome', async () => {
    // A restrição de coluna não pode ter levado junto o caso legítimo.
    await asUser(db, fx.adminBase, async () => {
      const r = await db.query(`update public.users set full_name = $2 where id = $1`, [
        fx.adminBase,
        'Nome Novo',
      ]);
      assert.equal(r.affectedRows ?? 0, 1);
    });
  });

  it('não altera o e-mail, que é a identidade do login', async () => {
    await asUser(db, fx.adminBase, async () => {
      await assert.rejects(
        () => db.query(`update public.users set email = $2 where id = $1`, [fx.adminBase, 'x@y.z']),
        /permission denied|privilege/i,
      );
    });
  });

  it('não muda o status nem o plano do próprio tenant', async () => {
    // Mesma forma da escalada em `users`: a política aprova a LINHA (tem
    // core.tenant.write) e não olha a COLUNA. Se passasse, um tenant suspenso
    // se reativaria sozinho, e qualquer um trocaria de plano sem passar pelo
    // comercial.
    for (const [coluna, sql] of [
      ['status', `update public.tenants set status = 'active' where id = $1`],
      [
        'plan_id',
        `update public.tenants set plan_id = (select id from public.plans where code = 'avancado') where id = $1`,
      ],
      ['slug', `update public.tenants set slug = 'outro-slug' where id = $1`],
    ]) {
      await asUser(db, fx.adminAurora, async () => {
        await assert.rejects(
          () => db.query(sql, [fx.aurora]),
          /permission denied|privilege/i,
          `coluna ${coluna} deveria ser decisão da plataforma`,
        );
      });
    }
  });

  it('continua podendo editar nome e configurações do próprio tenant', async () => {
    await asUser(db, fx.adminAurora, async () => {
      const r = await db.query(`update public.tenants set name = $2 where id = $1`, [
        fx.aurora,
        'Aurora Ltda',
      ]);
      assert.equal(r.affectedRows ?? 0, 1);
    });
  });

  it('não cria papel próprio marcado como de sistema', async () => {
    // Papel de sistema vale para TODOS os tenants. Criar um seria promover a
    // própria configuração a regra da plataforma.
    await asUser(db, fx.adminAurora, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.roles (tenant_id, code, name, is_system)
             values ($1, 'falso_sistema', 'X', true)`,
            [fx.aurora],
          ),
        /row-level security|roles_system_has_no_tenant/i,
      );
    });
  });

  it('não altera papel de sistema, que vale para todos os tenants', async () => {
    await asUser(db, fx.adminBase, async () => {
      const r = await db.query(
        `update public.roles set name = 'Sequestrado' where tenant_id is null`,
      );
      assert.equal(r.affectedRows ?? 0, 0);
    });
  });

  it('não lê papel próprio de outro tenant', async () => {
    const achou = await asUser(db, fx.adminAurora, async () => {
      const { rows } = await db.query('select code from public.roles where tenant_id = $1', [
        fx.base,
      ]);
      return rows.length;
    });
    assert.equal(achou, 0);
  });

  it('não forja auditoria em nome de outra pessoa do próprio tenant', async () => {
    // O with_check compara actor_user_id com auth.uid(). Sem isso, qualquer
    // membro poderia atribuir uma ação a um colega — e auditoria que aceita
    // autor forjado não serve para apurar nada.
    await asUser(db, fx.adminAurora, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type)
             values ($1, $2, 'tenant.update', 'tenant')`,
            [fx.aurora, fx.colabAurora],
          ),
        /row-level security/i,
      );
    });
  });

  it('não concede permissão a papel de sistema', async () => {
    // Seria o ataque mais barato: dar core.roles.write ao papel colaborador
    // afetaria todos os tenants da plataforma de uma vez.
    await asUser(db, fx.adminBase, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.role_permissions (role_id, permission_id)
             values ((select id from public.roles where code = 'collaborator' and tenant_id is null),
                     (select id from public.permissions where code = 'core.roles.write'))`,
          ),
        /row-level security/i,
      );
    });
  });
});
