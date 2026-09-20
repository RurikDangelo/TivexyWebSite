/**
 * Testes do esquema do Tivexy Core.
 *
 * Rodam contra um Postgres de verdade (PGlite). O teste que mais importa é o
 * de isolamento entre tenants: é a diferença entre um SaaS e um vazamento de
 * dados entre clientes.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addMember, asAnon, asUser, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
/** Fixture: dois tenants sem nenhuma relação entre si, mais um super admin. */
const fx = {};

before(async () => {
  db = await createDatabase();

  fx.superAdmin = await createUser(db, {
    email: 'equipe@tivexy.com.br',
    fullName: 'Equipe Tivexy',
    isSuperAdmin: true,
  });

  fx.tenantA = await createTenant(db, { slug: 'cafe-aurora', name: 'Café Aurora' });
  fx.tenantB = await createTenant(db, { slug: 'oficina-base', name: 'Oficina Base' });

  fx.adminA = await createUser(db, { email: 'admin@aurora.com.br', fullName: 'Admin Aurora' });
  fx.collabA = await createUser(db, { email: 'joao@aurora.com.br', fullName: 'João' });
  fx.adminB = await createUser(db, { email: 'admin@base.com.br', fullName: 'Admin Base' });
  fx.convidadoB = await createUser(db, { email: 'novo@base.com.br', fullName: 'Ainda Não Entrou' });

  await addMember(db, { tenantId: fx.tenantA, userId: fx.adminA, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenantA, userId: fx.collabA, roleCode: 'collaborator' });
  await addMember(db, { tenantId: fx.tenantB, userId: fx.adminB, roleCode: 'tenant_admin' });
  // Convite enviado, primeiro acesso ainda não aconteceu.
  await addMember(db, {
    tenantId: fx.tenantB,
    userId: fx.convidadoB,
    roleCode: 'collaborator',
    status: 'invited',
  });

  const { rows } = await db.query(
    `insert into public.teams (tenant_id, name) values ($1, 'Balcão'), ($2, 'Bancada')
     returning id, tenant_id`,
    [fx.tenantA, fx.tenantB],
  );
  fx.teamA = rows.find((r) => r.tenant_id === fx.tenantA).id;
  fx.teamB = rows.find((r) => r.tenant_id === fx.tenantB).id;
});

after(async () => {
  await db?.close();
});

// ─────────────────────────────────────────────────────────────────────────

describe('esquema', () => {
  it('habilita RLS em todas as tabelas de public', async () => {
    const { rows } = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1
    `);
    assert.deepEqual(
      rows.map((r) => r.relname),
      [],
      'tabela sem RLS habilitado fica totalmente aberta',
    );
  });

  it('cria uma política para cada tabela', async () => {
    const { rows } = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
      order by 1
    `);
    assert.deepEqual(
      rows.map((r) => r.relname),
      [],
      'RLS sem política nenhuma nega tudo',
    );
  });

  it('fixa o search_path nas funções SECURITY DEFINER', async () => {
    const { rows } = await db.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not coalesce(array_to_string(p.proconfig, ',') like '%search_path%', false)
      order by 1
    `);
    assert.deepEqual(
      rows.map((r) => r.proname),
      [],
      'SECURITY DEFINER sem search_path fixo permite escalada de privilégio',
    );
  });
});

describe('catálogo', () => {
  it('registra módulos, permissões, papéis e planos', async () => {
    const { rows } = await db.query(`
      select
        (select count(*) from public.modules)     as modulos,
        (select count(*) from public.permissions) as permissoes,
        (select count(*) from public.roles where tenant_id is null) as papeis,
        (select count(*) from public.plans)       as planos
    `);
    const [c] = rows;
    assert.equal(Number(c.modulos), 9);
    assert.equal(Number(c.permissoes), 51);
    assert.equal(Number(c.papeis), 3);
    assert.equal(Number(c.planos), 3);
  });

  it('dá mais permissão ao administrador que ao gestor, e ao gestor que ao colaborador', async () => {
    const { rows } = await db.query(`
      select r.code, count(rp.permission_id)::int as total
      from public.roles r
      left join public.role_permissions rp on rp.role_id = r.id
      where r.tenant_id is null
      group by r.code
    `);
    const total = Object.fromEntries(rows.map((r) => [r.code, r.total]));
    assert.ok(total.tenant_admin > total.manager, 'admin deve ter mais que gestor');
    assert.ok(total.manager > total.collaborator, 'gestor deve ter mais que colaborador');
  });

  it('não deixa o gestor alterar papéis — seria escalada para administrador', async () => {
    const { rows } = await db.query(`
      select 1
      from public.roles r
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where r.code = 'manager' and r.tenant_id is null and p.code = 'core.roles.write'
    `);
    assert.equal(rows.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// O teste obrigatório: Tenant B não alcança Tenant A.
// ─────────────────────────────────────────────────────────────────────────

describe('isolamento entre tenants', () => {
  it('só enxerga o próprio tenant', async () => {
    const visto = await asUser(db, fx.adminB, async () => {
      const { rows } = await db.query('select id, slug from public.tenants');
      return rows;
    });
    assert.equal(visto.length, 1);
    assert.equal(visto[0].id, fx.tenantB);
    assert.equal(visto[0].slug, 'oficina-base');
  });

  it('nega LEITURA de recurso do outro tenant', async () => {
    const achou = await asUser(db, fx.adminB, async () => {
      const t = await db.query('select id from public.tenants where id = $1', [fx.tenantA]);
      const e = await db.query('select id from public.teams where tenant_id = $1', [fx.tenantA]);
      const v = await db.query('select id from public.tenant_users where tenant_id = $1', [
        fx.tenantA,
      ]);
      return { tenants: t.rows.length, teams: e.rows.length, vinculos: v.rows.length };
    });
    assert.deepEqual(achou, { tenants: 0, teams: 0, vinculos: 0 });
  });

  it('nega ESCRITA no outro tenant', async () => {
    await asUser(db, fx.adminB, async () => {
      await assert.rejects(
        () =>
          db.query('insert into public.teams (tenant_id, name) values ($1, $2)', [
            fx.tenantA,
            'Equipe intrusa',
          ]),
        /row-level security/i,
        'inserir no tenant alheio tem que ser recusado',
      );
    });
  });

  it('nega ATUALIZAÇÃO no outro tenant', async () => {
    const afetadas = await asUser(db, fx.adminB, async () => {
      const r = await db.query('update public.tenants set name = $1 where id = $2', [
        'Invadido',
        fx.tenantA,
      ]);
      return r.affectedRows ?? 0;
    });
    assert.equal(afetadas, 0);

    const { rows } = await db.query('select name from public.tenants where id = $1', [fx.tenantA]);
    assert.equal(rows[0].name, 'Café Aurora', 'o nome original tem que continuar intacto');
  });

  it('nega EXCLUSÃO no outro tenant', async () => {
    const afetadas = await asUser(db, fx.adminB, async () => {
      const r = await db.query('delete from public.teams where tenant_id = $1', [fx.tenantA]);
      return r.affectedRows ?? 0;
    });
    assert.equal(afetadas, 0);

    const { rows } = await db.query('select id from public.teams where tenant_id = $1', [
      fx.tenantA,
    ]);
    assert.equal(rows.length, 1, 'a equipe do outro tenant tem que continuar lá');
  });

  it('não vaza usuários de outro tenant', async () => {
    const emails = await asUser(db, fx.adminB, async () => {
      const { rows } = await db.query('select email from public.users order by email');
      return rows.map((r) => r.email);
    });
    assert.ok(emails.includes('admin@base.com.br'), 'deve ver a si mesmo');
    assert.ok(emails.includes('novo@base.com.br'), 'deve ver quem convidou');
    assert.ok(!emails.includes('admin@aurora.com.br'), 'não pode ver usuário de outro tenant');
    assert.ok(!emails.includes('joao@aurora.com.br'), 'não pode ver usuário de outro tenant');
  });

  it('não deixa forjar auditoria em nome de outro tenant', async () => {
    await asUser(db, fx.adminB, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type)
             values ($1, $2, 'tenant.update', 'tenant')`,
            [fx.tenantA, fx.adminB],
          ),
        /row-level security/i,
      );
    });
  });
});

describe('escopo de acesso', () => {
  it('convite pendente não dá acesso a dado', async () => {
    const visto = await asUser(db, fx.convidadoB, async () => {
      const { rows } = await db.query('select id from public.tenants');
      return rows.length;
    });
    assert.equal(visto, 0, 'vínculo "invited" só vira acesso após o primeiro login');
  });

  it('super admin enxerga a plataforma inteira', async () => {
    const total = await asUser(db, fx.superAdmin, async () => {
      const { rows } = await db.query('select count(*)::int as c from public.tenants');
      return rows[0].c;
    });
    assert.equal(total, 2);
  });

  it('visitante não autenticado não lê nada', async () => {
    const visto = await asAnon(db, async () => {
      const t = await db.query('select id from public.tenants');
      const u = await db.query('select id from public.users');
      return t.rows.length + u.rows.length;
    });
    assert.equal(visto, 0);
  });

  it('colaborador não altera o cadastro da empresa', async () => {
    const afetadas = await asUser(db, fx.collabA, async () => {
      const r = await db.query('update public.tenants set name = $1 where id = $2', [
        'Renomeado pelo colaborador',
        fx.tenantA,
      ]);
      return r.affectedRows ?? 0;
    });
    assert.equal(afetadas, 0, 'falta core.tenant.write ao colaborador');
  });

  it('administrador do tenant altera o próprio cadastro', async () => {
    const afetadas = await asUser(db, fx.adminA, async () => {
      const r = await db.query('update public.tenants set name = $1 where id = $2', [
        'Café Aurora Ltda',
        fx.tenantA,
      ]);
      return r.affectedRows ?? 0;
    });
    assert.equal(afetadas, 1);
  });

  it('has_permission responde conforme o papel', async () => {
    const admin = await asUser(db, fx.adminA, async () => {
      const { rows } = await db.query('select public.has_permission($1, $2) as ok', [
        fx.tenantA,
        'core.roles.write',
      ]);
      return rows[0].ok;
    });
    const colab = await asUser(db, fx.collabA, async () => {
      const { rows } = await db.query('select public.has_permission($1, $2) as ok', [
        fx.tenantA,
        'core.roles.write',
      ]);
      return rows[0].ok;
    });
    assert.equal(admin, true);
    assert.equal(colab, false);
  });
});

describe('auditoria', () => {
  it('aceita registro do próprio tenant', async () => {
    await asUser(db, fx.adminB, async () => {
      await db.query(
        `insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id)
         values ($1, $2, 'tenant.update', 'tenant', $3)`,
        [fx.tenantB, fx.adminB, fx.tenantB],
      );
      const { rows } = await db.query('select count(*)::int as c from public.audit_logs');
      assert.equal(rows[0].c, 1);
    });
  });

  it('não deixa editar nem apagar registro — sem política, RLS nega', async () => {
    await db.query(
      `insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type)
       values ($1, $2, 'tenant.create', 'tenant')`,
      [fx.tenantB, fx.superAdmin],
    );

    const resultado = await asUser(db, fx.superAdmin, async () => {
      const u = await db.query("update public.audit_logs set action = 'forjado'");
      const d = await db.query('delete from public.audit_logs');
      return { editadas: u.affectedRows ?? 0, apagadas: d.affectedRows ?? 0 };
    });
    assert.deepEqual(resultado, { editadas: 0, apagadas: 0 }, 'log editável não é auditoria');

    await db.query('delete from public.audit_logs');
  });
});

describe('provisionamento', () => {
  it('a chave de idempotência impede execução duplicada', async () => {
    await db.query(
      `insert into public.provisioning_runs (tenant_id, idempotency_key, status, started_at, finished_at)
       values ($1, 'req-001', 'succeeded', now(), now())`,
      [fx.tenantA],
    );

    await assert.rejects(
      () =>
        db.query(
          `insert into public.provisioning_runs (tenant_id, idempotency_key)
           values ($1, 'req-001')`,
          [fx.tenantB],
        ),
      /duplicate key|unique/i,
      'repetir a requisição não pode criar uma segunda execução',
    );
  });

  it('permite só uma execução viva por tenant', async () => {
    await db.query(
      `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
       values ($1, 'req-002', 'running')`,
      [fx.tenantB],
    );

    await assert.rejects(
      () =>
        db.query(
          `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
           values ($1, 'req-003', 'pending')`,
          [fx.tenantB],
        ),
      /duplicate key|unique/i,
      'duas execuções simultâneas no mesmo tenant se atropelariam',
    );
  });

  it('exige data de fim em execução terminada', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.provisioning_runs (tenant_id, idempotency_key, status)
           values ($1, 'req-004', 'succeeded')`,
          [fx.tenantA],
        ),
      /provisioning_runs_finished_consistency/,
    );
  });

  it('não duplica etapa ao retomar uma execução', async () => {
    const { rows } = await db.query(
      `select id from public.provisioning_runs where idempotency_key = 'req-002'`,
    );
    const runId = rows[0].id;
    await db.query(
      `insert into public.provisioning_steps (run_id, step, position, status)
       values ($1, 'create_tenant', 1, 'succeeded')`,
      [runId],
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into public.provisioning_steps (run_id, step, position, status)
           values ($1, 'create_tenant', 2, 'pending')`,
          [runId],
        ),
      /duplicate key|unique/i,
    );
  });

  it('o tenant acompanha o próprio provisionamento, mas não escreve nele', async () => {
    const resultado = await asUser(db, fx.adminB, async () => {
      const leitura = await db.query('select id from public.provisioning_runs');
      const escrita = await db.query(
        `update public.provisioning_runs set status = 'succeeded' where tenant_id = $1`,
        [fx.tenantB],
      );
      return { leu: leitura.rows.length, escreveu: escrita.affectedRows ?? 0 };
    });
    assert.ok(resultado.leu > 0, 'o painel precisa mostrar o estado');
    assert.equal(resultado.escreveu, 0, 'provisionar é operação de plataforma');
  });
});

describe('restrições de integridade', () => {
  it('recusa slug inválido para subdomínio', async () => {
    for (const slug of ['Café', 'a', '-abc', 'abc-', 'com espaço']) {
      await assert.rejects(
        () => db.query(`insert into public.tenants (slug, name) values ($1, 'X')`, [slug]),
        /tenants_slug/,
        `slug "${slug}" deveria ser recusado`,
      );
    }
  });

  it('recusa documento com formatação', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.tenants (slug, name, document) values ('teste-doc', 'X', $1)`,
          ['12.345.678/0001-90'],
        ),
      /tenants_document_digits/,
    );
  });

  it('exige data de entrada em quem já entrou', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.tenant_users (tenant_id, user_id, role_id, status)
           values ($1, $2, (select id from public.roles where code = 'collaborator' and tenant_id is null), 'active')`,
          [fx.tenantA, fx.superAdmin],
        ),
      /tenant_users_joined_consistency/,
    );
  });

  it('não deixa uma pessoa entrar duas vezes no mesmo tenant', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
           values ($1, $2, (select id from public.roles where code = 'manager' and tenant_id is null), 'active', now())`,
          [fx.tenantA, fx.adminA],
        ),
      /tenant_users_unique|duplicate key/i,
    );
  });

  it('não deixa papel de sistema pertencer a um tenant', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.roles (tenant_id, code, name, is_system)
           values ($1, 'falso_sistema', 'X', true)`,
          [fx.tenantA],
        ),
      /roles_system_has_no_tenant/,
    );
  });

  it('recusa código de permissão fora do formato modulo.recurso.acao', async () => {
    await assert.rejects(
      () => db.query(`insert into public.permissions (code, name) values ('Invalido', 'X')`),
      /permissions_code_format/,
    );
  });
});

/*
 * O harness passou a restaurar um retrato do banco já migrado em vez de rodar
 * as migrations a cada chamada — 62 s de suíte viraram 20 s. Estes testes
 * guardam o que essa otimização poderia quebrar em silêncio.
 *
 * Silêncio é a palavra: um retrato mal restaurado não dá erro, ele deixa dado
 * de um teste aparecer no outro. O sintoma seria um teste que passa sozinho e
 * falha em conjunto — o pior tipo de instabilidade para se diagnosticar.
 */
describe('o harness entrega bancos isolados', () => {
  it('dois bancos não se enxergam', async () => {
    const a = await createDatabase();
    const b = await createDatabase();
    try {
      await a.query(`insert into public.tenants (slug, name) values ('so-no-a', 'Só no A')`);

      const noB = await b.query(`select count(*)::int as c from public.tenants`);
      assert.equal(noB.rows[0].c, 0, 'o tenant criado em A apareceu em B');

      const noA = await a.query(`select count(*)::int as c from public.tenants`);
      assert.equal(noA.rows[0].c, 1);
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('todo banco novo já vem com o catálogo', async () => {
    // O retrato é tirado DEPOIS das migrations, então o catálogo vem junto.
    // Se viesse antes, cada teste começaria sem módulo nem permissão e o
    // provisionamento falharia por um motivo que não é o testado.
    const novo = await createDatabase();
    try {
      const { rows } = await novo.query(`
        select
          (select count(*)::int from public.modules) as modulos,
          (select count(*)::int from public.permissions) as permissoes,
          (select count(*)::int from public.plans) as planos,
          (select count(*)::int from public.roles where tenant_id is null) as papeis
      `);
      const [c] = rows;
      assert.equal(c.modulos, 9);
      assert.equal(c.permissoes, 51);
      assert.equal(c.planos, 3);
      assert.equal(c.papeis, 3);
    } finally {
      await novo.close();
    }
  });

  it('e vem sem dado de teste nenhum', async () => {
    // O retrato é tirado antes de qualquer teste escrever. Se fosse depois,
    // todo banco "limpo" nasceria com a sujeira do primeiro teste que rodou.
    const novo = await createDatabase();
    try {
      const { rows } = await novo.query(`
        select
          (select count(*)::int from public.tenants) as tenants,
          (select count(*)::int from public.users) as usuarios,
          (select count(*)::int from auth.users) as identidades,
          (select count(*)::int from public.provisioning_runs) as execucoes,
          (select count(*)::int from public.audit_logs) as auditoria
      `);
      for (const [nome, quantos] of Object.entries(rows[0])) {
        assert.equal(quantos, 0, `banco novo veio com ${quantos} em ${nome}`);
      }
    } finally {
      await novo.close();
    }
  });
});
