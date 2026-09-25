/**
 * Automações — o motor interno, contra o Postgres de verdade.
 *
 * O que mais importa aqui: a automação dispara por qualquer caminho (o evento
 * nasce no banco), **nunca derruba o negócio** quando falha, não dispara a si
 * mesma, e não serve de porta lateral para escrever onde a pessoa não pode.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

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

async function habilitar(tenantId, codigos) {
  await db.query(
    `insert into public.tenant_modules (tenant_id, module_id, is_enabled)
     select $1, m.id, true from public.modules m where m.code = any($2::text[])
     on conflict (tenant_id, module_id) do update set is_enabled = true`,
    [tenantId, codigos],
  );
}

async function regra(
  tenantId,
  { nome = 'regra', gatilho, condicoes = [], acao = 'core.notify', params, ativa = true },
) {
  const { rows } = await db.query(
    `insert into public.automation_rules (tenant_id, name, trigger, conditions, action, action_params, active)
     values ($1, $2, $3, $4::text::jsonb, $5, $6::text::jsonb, $7) returning id`,
    [tenantId, nome, gatilho, JSON.stringify(condicoes), acao, JSON.stringify(params), ativa],
  );
  return rows[0].id;
}

const vender = (userId, itens, pagamentos) =>
  asUserCommitting(db, userId, async () => {
    const { rows } = await db.query(
      'select public.erp_register_sale($1, $2::text::jsonb, $3::text::jsonb) as r',
      [fx.t, JSON.stringify(itens), JSON.stringify(pagamentos)],
    );
    return rows[0].r;
  });

async function avisos() {
  const { rows } = await db.query(
    'select user_id, title, body, link from public.notifications order by title, user_id',
  );
  return rows;
}

async function execucoes() {
  const { rows } = await db.query(
    'select outcome, detail from public.automation_runs order by created_at',
  );
  return rows;
}

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
    delete from auth.users;
  `);
  fx.t = await createTenant(db, { slug: 'cafe-auto', name: 'Café Auto' });
  await habilitar(fx.t, ['core', 'crm', 'erp', 'inventory', 'finance', 'automation']);
  await db.query(
    `update public.tenants set settings = '{"erp.sales_requires_customer": false}'::jsonb where id = $1`,
    [fx.t],
  );

  fx.admin = await createUser(db, { email: 'admin@auto.test', fullName: 'Ana' });
  fx.gestor = await createUser(db, { email: 'gestor@auto.test', fullName: 'Gil' });
  fx.colab = await createUser(db, { email: 'colab@auto.test', fullName: 'Caio' });
  await addMember(db, { tenantId: fx.t, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.t, userId: fx.gestor, roleCode: 'manager' });
  await addMember(db, { tenantId: fx.t, userId: fx.colab, roleCode: 'collaborator' });

  const { rows: p } = await db.query(
    `insert into public.erp_products (tenant_id, name, price_cents, unit, min_stock)
     values ($1, 'Grão arábica', 5000, 'kg', 5) returning id`,
    [fx.t],
  );
  fx.grao = p[0].id;
  const { rows: f } = await db.query(
    `insert into public.erp_payment_methods (tenant_id, name) values ($1, 'Pix') returning id`,
    [fx.t],
  );
  fx.pix = f[0].id;
});

describe('venda registrada', () => {
  it('avisa quem vê o caixa quando passa do valor — e só então', async () => {
    await regra(fx.t, {
      gatilho: 'erp.sale.registered',
      condicoes: [{ campo: 'total', operador: 'gte', valor: 10000 }],
      params: {
        destino: 'permissao',
        permissao: 'finance.cashflow.read',
        titulo: 'Venda nº {{numero}}: {{total}}',
        texto: 'Cliente: {{cliente}}',
      },
    });

    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1 }],
      [{ payment_method_id: fx.pix, amount_cents: 5000 }],
    );
    assert.deepEqual(await avisos(), [], 'R$ 50,00 não passa de R$ 100,00');

    const r = await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 3 }],
      [{ payment_method_id: fx.pix, amount_cents: 15000 }],
    );
    const lista = await avisos();
    // Administrador e gestor têm finance.cashflow.read; o colaborador não.
    assert.deepEqual(lista.map((a) => a.user_id).sort(), [fx.admin, fx.gestor].sort());
    assert.equal(lista[0].title, 'Venda nº 2: R$ 150,00');
    assert.equal(lista[0].body, 'Cliente:');
    assert.equal(lista[0].link, `/erp/vendas/${r.id}`);

    assert.deepEqual(await execucoes(), [{ outcome: 'executed', detail: '2 avisos' }]);
  });

  it('automação que falha não derruba a venda — e o motivo fica registrado', async () => {
    await regra(fx.t, {
      gatilho: 'erp.sale.registered',
      params: { destino: 'usuario', usuario: 'isto-nao-e-uuid', titulo: 'x' },
    });

    const r = await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1 }],
      [{ payment_method_id: fx.pix, amount_cents: 5000 }],
    );
    assert.equal(r.number, 1, 'a venda foi registrada');

    const [execucao] = await execucoes();
    assert.equal(execucao.outcome, 'failed');
    assert.match(execucao.detail, /uuid/);
  });

  it('regra desligada, ou módulo de automação desligado, não roda', async () => {
    await regra(fx.t, {
      gatilho: 'erp.sale.registered',
      ativa: false,
      params: { destino: 'usuario', usuario: fx.admin, titulo: 'x' },
    });
    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1 }],
      [{ payment_method_id: fx.pix, amount_cents: 5000 }],
    );
    assert.deepEqual(await avisos(), []);

    await db.query(`update public.automation_rules set active = true`);
    await db.query(
      `update public.tenant_modules set is_enabled = false
       where tenant_id = $1 and module_id = (select id from public.modules where code = 'automation')`,
      [fx.t],
    );
    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1 }],
      [{ payment_method_id: fx.pix, amount_cents: 5000 }],
    );
    assert.deepEqual(await avisos(), []);
  });
});

describe('saldo no mínimo', () => {
  it('avisa na travessia, não a cada venda', async () => {
    await db.query(
      `insert into public.inventory_movements (tenant_id, product_id, kind, quantity) values ($1, $2, 'in', 10)`,
      [fx.t, fx.grao],
    );
    await regra(fx.t, {
      gatilho: 'inventory.stock.low',
      params: {
        destino: 'permissao',
        permissao: 'inventory.movements.write',
        titulo: '{{produto}} no mínimo: {{saldo}} {{unidade}}',
      },
    });

    // 10 → 6: acima do mínimo (5).
    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 4 }],
      [{ payment_method_id: fx.pix, amount_cents: 20000 }],
    );
    assert.equal((await avisos()).length, 0);

    // 6 → 4,5: atravessou. Todos com inventory.movements.write: os três.
    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1.5 }],
      [{ payment_method_id: fx.pix, amount_cents: 7500 }],
    );
    const lista = await avisos();
    assert.equal(lista.length, 3);
    assert.equal(lista[0].title, 'Grão arábica no mínimo: 4,5 kg');

    // 4,5 → 3,5: já estava no mínimo. Sem aviso novo.
    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1 }],
      [{ payment_method_id: fx.pix, amount_cents: 5000 }],
    );
    assert.equal((await avisos()).length, 3);
  });
});

describe('dois eventos na mesma transação', () => {
  it('uma venda que leva dois produtos ao mínimo avisa dos dois', async () => {
    /*
     * O freio contra laço marca a transação enquanto o motor roda. Se ele não
     * desmarcasse no fim, o segundo evento da mesma venda seria ignorado como
     * se tivesse nascido de dentro do motor.
     */
    const { rows } = await db.query(
      `insert into public.erp_products (tenant_id, name, price_cents, unit, min_stock)
       values ($1, 'Leite', 500, 'l', 5) returning id`,
      [fx.t],
    );
    const leite = rows[0].id;
    await db.query(
      `insert into public.inventory_movements (tenant_id, product_id, kind, quantity)
       values ($1, $2, 'in', 10), ($1, $3, 'in', 10)`,
      [fx.t, fx.grao, leite],
    );
    await regra(fx.t, {
      gatilho: 'inventory.stock.low',
      params: { destino: 'usuario', usuario: fx.admin, titulo: '{{produto}} no mínimo' },
    });

    await vender(
      fx.colab,
      [
        { product_id: fx.grao, quantity: 6 },
        { product_id: leite, quantity: 6 },
      ],
      [{ payment_method_id: fx.pix, amount_cents: 30000 + 3000 }],
    );
    assert.deepEqual(
      (await avisos()).map((a) => a.title),
      ['Grão arábica no mínimo', 'Leite no mínimo'],
    );
  });
});

describe('CRM', () => {
  it('lead de uma origem avisa o responsável', async () => {
    await regra(fx.t, {
      gatilho: 'crm.lead.created',
      condicoes: [{ campo: 'origem', operador: 'contains', valor: 'insta' }],
      params: { destino: 'responsavel', titulo: 'Lead novo: {{nome}} ({{origem}})' },
    });
    await db.query(
      `insert into public.crm_leads (tenant_id, name, source, owner_id) values ($1, 'Lia', 'Indicação', $2)`,
      [fx.t, fx.colab],
    );
    await db.query(
      `insert into public.crm_leads (tenant_id, name, source, owner_id) values ($1, 'Rui', 'Instagram', $2)`,
      [fx.t, fx.colab],
    );
    const lista = await avisos();
    assert.deepEqual(
      lista.map((a) => [a.user_id, a.title]),
      [[fx.colab, 'Lead novo: Rui (Instagram)']],
    );
  });

  it('oportunidade ganha vira atividade para o responsável', async () => {
    const { rows: funil } = await db.query(
      `insert into public.crm_pipelines (tenant_id, name, is_default)
       values ($1, 'Vendas', true) returning id`,
      [fx.t],
    );
    const pipelineId = funil[0].id;
    const { rows: etapas } = await db.query(
      `insert into public.crm_pipeline_stages (tenant_id, pipeline_id, name, kind, position)
       values ($1, $2, 'Proposta', 'open', 1), ($1, $2, 'Fechado', 'won', 2)
       returning id, kind::text`,
      [fx.t, pipelineId],
    );
    const aberta = etapas.find((e) => e.kind === 'open').id;
    const ganha = etapas.find((e) => e.kind === 'won').id;
    const { rows: n } = await db.query(
      `insert into public.crm_deals (tenant_id, pipeline_id, stage_id, title, value_cents, owner_id)
       values ($1, $2, $3, 'Café para o evento', 120000, $4) returning id`,
      [fx.t, pipelineId, aberta, fx.colab],
    );

    await regra(fx.t, {
      gatilho: 'crm.deal.stage_changed',
      acao: 'crm.activity.create',
      condicoes: [{ campo: 'situacao', operador: 'eq', valor: 'won' }],
      params: { titulo: 'Agradecer: {{titulo}} ({{valor}})', dias: 1, responsavel: 'responsavel' },
    });

    await db.query('update public.crm_deals set stage_id = $1 where id = $2', [ganha, n[0].id]);

    const { rows: atividades } = await db.query(
      'select subject, owner_id, deal_id, due_at is not null as tem_prazo from public.crm_activities',
    );
    assert.deepEqual(atividades, [
      {
        subject: 'Agradecer: Café para o evento (R$ 1.200,00)',
        owner_id: fx.colab,
        deal_id: n[0].id,
        tem_prazo: true,
      },
    ]);
  });
});

describe('quem escreve a regra', () => {
  it('colaborador não cria automação; gestor cria', async () => {
    const criar = (quem) =>
      asUser(db, quem, () =>
        db.query(
          `insert into public.automation_rules (tenant_id, name, trigger, action, action_params)
           values ($1, 'x', 'erp.sale.registered', 'core.notify', '{"destino":"responsavel","titulo":"x"}')`,
          [fx.t],
        ),
      );
    await assert.rejects(criar(fx.colab), /row-level security/);
    await criar(fx.gestor);
  });

  it('quem não cria atividade no CRM não cria regra que cria atividade', async () => {
    const { rows } = await db.query(
      `insert into public.roles (tenant_id, code, name) values ($1, 'automatizador', 'x') returning id`,
      [fx.t],
    );
    await db.query(
      `insert into public.role_permissions (role_id, permission_id)
       select $1, id from public.permissions where code in ('automation.rules.read', 'automation.rules.write')`,
      [rows[0].id],
    );
    const quem = await createUser(db, { email: 'auto@auto.test' });
    await db.query(
      `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
       values ($1, $2, $3, 'active', now())`,
      [fx.t, quem, rows[0].id],
    );

    const inserir = (acao) =>
      asUser(db, quem, () =>
        db.query(
          `insert into public.automation_rules (tenant_id, name, trigger, action, action_params)
           values ($1, 'x', 'crm.lead.created', $2, '{"destino":"responsavel","titulo":"x"}')`,
          [fx.t, acao],
        ),
      );
    await inserir('core.notify');
    await assert.rejects(inserir('crm.activity.create'), /row-level security/);
  });

  it('atividade só nasce de evento do CRM', async () => {
    await assert.rejects(
      regra(fx.t, {
        gatilho: 'erp.sale.registered',
        acao: 'crm.activity.create',
        params: { titulo: 'x' },
      }),
      /automation_rules_activity_needs_crm_event/,
    );
  });
});

describe('avisos', () => {
  it('cada um lê só os seus, marca como lido, e não reescreve', async () => {
    await regra(fx.t, {
      gatilho: 'erp.sale.registered',
      params: { destino: 'usuario', usuario: fx.gestor, titulo: 'Venda {{numero}}' },
    });
    await vender(
      fx.colab,
      [{ product_id: fx.grao, quantity: 1 }],
      [{ payment_method_id: fx.pix, amount_cents: 5000 }],
    );

    const doAdmin = await asUser(db, fx.admin, () =>
      db.query('select id from public.notifications'),
    );
    assert.equal(doAdmin.rows.length, 0, 'o aviso é do gestor');

    const lidos = await asUserCommitting(db, fx.gestor, async () => {
      const { rows } = await db.query(
        'update public.notifications set read_at = now() where read_at is null returning id',
      );
      return rows.length;
    });
    assert.equal(lidos, 1);

    await assert.rejects(
      asUser(db, fx.gestor, () => db.query(`update public.notifications set title = 'forjado'`)),
      /permission denied/,
    );
    await assert.rejects(
      asUser(db, fx.gestor, () =>
        db.query(
          `insert into public.notifications (tenant_id, user_id, title) values ($1, $2, 'x')`,
          [fx.t, fx.admin],
        ),
      ),
      /permission denied/,
    );
  });

  it('o registro de execução não se escreve de fora', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () => db.query(`delete from public.automation_runs`)),
      /permission denied/,
    );
  });
});
