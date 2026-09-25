/**
 * ERP — cadastro, venda, estoque e financeiro, contra o Postgres de verdade.
 *
 * O que estes testes mais cobram não é que a venda funciona: é que ela
 * **só** funciona do jeito certo, por qualquer caminho. A função registra a
 * venda, mas o PostgREST deixa escrever nas tabelas direto — então cada
 * garantia (preço do cadastro, venda imutável, total que fecha, baixa de
 * estoque sem venda) tem um teste que tenta contorná-la.
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

/* ── Cenário ───────────────────────────────────────────────────────────── */

async function habilitar(tenantId, codigos) {
  await db.query(
    `insert into public.tenant_modules (tenant_id, module_id, is_enabled)
     select $1, m.id, true from public.modules m where m.code = any($2::text[])
     on conflict (tenant_id, module_id) do update set is_enabled = true`,
    [tenantId, codigos],
  );
}

async function desabilitar(tenantId, codigo) {
  await db.query(
    `update public.tenant_modules set is_enabled = false
     where tenant_id = $1 and module_id = (select id from public.modules where code = $2)`,
    [tenantId, codigo],
  );
}

async function configurar(tenantId, valores) {
  await db.query(`update public.tenants set settings = settings || $2::text::jsonb where id = $1`, [
    tenantId,
    JSON.stringify(valores),
  ]);
}

async function produto(tenantId, { name, price, unit = 'un', track = true, active = true }) {
  const { rows } = await db.query(
    `insert into public.erp_products (tenant_id, name, price_cents, unit, track_stock, active)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [tenantId, name, price, unit, track, active],
  );
  return rows[0].id;
}

async function forma(tenantId, { name, days = 0, active = true }) {
  const { rows } = await db.query(
    `insert into public.erp_payment_methods (tenant_id, name, settlement_days, active)
     values ($1, $2, $3, $4) returning id`,
    [tenantId, name, days, active],
  );
  return rows[0].id;
}

async function papel(tenantId, code, permissoes) {
  const { rows } = await db.query(
    `insert into public.roles (tenant_id, code, name) values ($1, $2, $2) returning id`,
    [tenantId, code],
  );
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p where p.code = any($2::text[])`,
    [rows[0].id, permissoes],
  );
  return rows[0].id;
}

async function membroCom(tenantId, userId, roleId) {
  await db.query(
    `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [tenantId, userId, roleId],
  );
}

/* ── Ações ─────────────────────────────────────────────────────────────── */

const vender = (userId, tenantId, itens, pagamentos, extra = {}) =>
  asUserCommitting(db, userId, async () => {
    const { rows } = await db.query(
      'select public.erp_register_sale($1, $2::text::jsonb, $3::text::jsonb, $4, $5, $6) as r',
      [
        tenantId,
        JSON.stringify(itens),
        JSON.stringify(pagamentos),
        extra.cliente ?? null,
        extra.desconto ?? 0,
        extra.obs ?? null,
      ],
    );
    return rows[0].r;
  });

const cancelar = (userId, saleId, motivo) =>
  asUserCommitting(db, userId, async () => {
    const { rows } = await db.query('select public.erp_cancel_sale($1, $2) as r', [saleId, motivo]);
    return rows[0].r;
  });

const movimentar = (userId, tenantId, productId, kind, campos = {}) =>
  asUserCommitting(db, userId, () =>
    db.query(
      `insert into public.inventory_movements
         (tenant_id, product_id, kind, quantity, counted_quantity, reason, unit_cost_cents)
       values ($1, $2, $3::public.inventory_movement_kind, $4, $5, $6, $7)`,
      [
        tenantId,
        productId,
        kind,
        campos.quantidade ?? 0,
        campos.contado ?? null,
        campos.motivo ?? null,
        campos.custo ?? null,
      ],
    ),
  );

async function saldo(tenantId, productId) {
  const { rows } = await db.query(
    'select quantity from public.inventory_stock_levels where tenant_id = $1 and product_id = $2',
    [tenantId, productId],
  );
  return rows[0] === undefined ? null : Number(rows[0].quantity);
}

async function lancamentosDaVenda(saleId) {
  const { rows } = await db.query(
    `select direction::text, description, amount_cents, due_date::text, paid_on::text,
            cancelled_at, sale_payment_id
     from public.finance_entries where sale_id = $1
     order by direction, amount_cents`,
    [saleId],
  );
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}

async function hoje() {
  const { rows } = await db.query(
    `select (now() at time zone 'America/Sao_Paulo')::date::text as d,
            ((now() at time zone 'America/Sao_Paulo')::date + 30)::text as d30`,
  );
  return rows[0];
}

/* ── Ciclo ─────────────────────────────────────────────────────────────── */

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

  fx.a = await createTenant(db, { slug: 'loja-a', name: 'Loja A' });
  fx.b = await createTenant(db, { slug: 'loja-b', name: 'Loja B' });
  await habilitar(fx.a, ['core', 'erp', 'inventory', 'finance']);
  await habilitar(fx.b, ['core', 'erp', 'inventory', 'finance']);
  // O padrão é exigir cliente. Quase todo teste vende no balcão; o que cobra
  // o padrão cria o próprio tenant.
  await configurar(fx.a, { 'erp.sales_requires_customer': false });
  await configurar(fx.b, { 'erp.sales_requires_customer': false });

  fx.adminA = await createUser(db, { email: 'admin@a.test', fullName: 'Ana' });
  fx.gestorA = await createUser(db, { email: 'gestor@a.test', fullName: 'Gil' });
  fx.colabA = await createUser(db, { email: 'caixa@a.test', fullName: 'Caio' });
  fx.adminB = await createUser(db, { email: 'admin@b.test', fullName: 'Bia' });
  await addMember(db, { tenantId: fx.a, userId: fx.adminA, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.a, userId: fx.gestorA, roleCode: 'manager' });
  await addMember(db, { tenantId: fx.a, userId: fx.colabA, roleCode: 'collaborator' });
  await addMember(db, { tenantId: fx.b, userId: fx.adminB, roleCode: 'tenant_admin' });

  fx.cafe = await produto(fx.a, { name: 'Café coado', price: 550 });
  fx.queijo = await produto(fx.a, { name: 'Queijo minas', price: 5990, unit: 'kg' });
  fx.sacola = await produto(fx.a, { name: 'Sacola', price: 10, track: false });
  fx.dinheiro = await forma(fx.a, { name: 'Dinheiro', days: 0 });
  fx.credito = await forma(fx.a, { name: 'Cartão de crédito', days: 30 });

  fx.cafeB = await produto(fx.b, { name: 'Café da B', price: 700 });
  fx.pixB = await forma(fx.b, { name: 'Pix', days: 0 });
});

/* ── 1. Cadastro ───────────────────────────────────────────────────────── */

describe('cadastro', () => {
  it('colaborador lê produto e não cadastra; administrador cadastra', async () => {
    const lidos = await asUser(db, fx.colabA, () =>
      db.query('select name from public.erp_products where tenant_id = $1 order by name', [fx.a]),
    );
    assert.deepEqual(
      lidos.rows.map((r) => r.name),
      ['Café coado', 'Queijo minas', 'Sacola'],
    );

    await assert.rejects(
      asUser(db, fx.colabA, () =>
        db.query(`insert into public.erp_products (tenant_id, name) values ($1, 'Pão')`, [fx.a]),
      ),
      /row-level security/,
    );

    await asUserCommitting(db, fx.adminA, () =>
      db.query(`insert into public.erp_products (tenant_id, name) values ($1, 'Pão')`, [fx.a]),
    );
  });

  it('o outro tenant não aparece, nem para quem administra', async () => {
    const { rows } = await asUser(db, fx.adminA, () =>
      db.query('select id from public.erp_products where id = $1', [fx.cafeB]),
    );
    assert.equal(rows.length, 0);
  });

  it('gestor edita produto e não apaga — apagar é `erp.products.delete`', async () => {
    /*
     * A política de exclusão é separada da de escrita. Com `for all`, quem
     * edita apagaria — o defeito que o CRM teve até 25/09.
     */
    const colaborador = await papel(fx.a, 'cadastrista', [
      'erp.products.read',
      'erp.products.write',
    ]);
    const cadastrista = await createUser(db, { email: 'cad@a.test' });
    await membroCom(fx.a, cadastrista, colaborador);

    const apagados = await asUser(db, cadastrista, async () => {
      const { rows } = await db.query(
        'delete from public.erp_products where id = $1 returning id',
        [fx.sacola],
      );
      return rows.length;
    });
    assert.equal(apagados, 0);

    const editados = await asUser(db, cadastrista, async () => {
      const { rows } = await db.query(
        `update public.erp_products set price_cents = 20 where id = $1 returning id`,
        [fx.sacola],
      );
      return rows.length;
    });
    assert.equal(editados, 1);
  });

  it('unidade fora da lista, preço negativo e mínimo negativo são recusados', async () => {
    await assert.rejects(
      db.query(
        `insert into public.erp_products (tenant_id, name, unit) values ($1, 'X', 'caixa')`,
        [fx.a],
      ),
      /erp_products_unit_known/,
    );
    await assert.rejects(
      db.query(
        `insert into public.erp_products (tenant_id, name, price_cents) values ($1, 'X', -1)`,
        [fx.a],
      ),
      /erp_products_price_not_negative/,
    );
    await assert.rejects(
      db.query(
        `insert into public.erp_products (tenant_id, name, min_stock) values ($1, 'X', -1)`,
        [fx.a],
      ),
      /erp_products_min_stock_not_negative/,
    );
  });

  it('código interno e código de barras são únicos por tenant, e só por tenant', async () => {
    await db.query(`update public.erp_products set sku = 'CAF-01', barcode = '789' where id = $1`, [
      fx.cafe,
    ]);

    await assert.rejects(
      db.query(`update public.erp_products set sku = 'caf-01' where id = $1`, [fx.queijo]),
      /erp_products_sku_per_tenant/,
      'maiúscula e minúscula são o mesmo código',
    );
    await assert.rejects(
      db.query(`update public.erp_products set barcode = '789' where id = $1`, [fx.queijo]),
      /erp_products_barcode_per_tenant/,
    );

    await db.query(`update public.erp_products set sku = 'CAF-01', barcode = '789' where id = $1`, [
      fx.cafeB,
    ]);
  });

  it('produto não aponta para categoria de outro tenant; apagar a categoria não apaga o produto', async () => {
    const { rows: catB } = await db.query(
      `insert into public.erp_product_categories (tenant_id, name) values ($1, 'Bebidas') returning id`,
      [fx.b],
    );
    await assert.rejects(
      db.query('update public.erp_products set category_id = $1 where id = $2', [
        catB[0].id,
        fx.cafe,
      ]),
      /erp_products_category_do_tenant/,
    );

    const { rows: catA } = await db.query(
      `insert into public.erp_product_categories (tenant_id, name) values ($1, 'Cafés') returning id`,
      [fx.a],
    );
    await db.query('update public.erp_products set category_id = $1 where id = $2', [
      catA[0].id,
      fx.cafe,
    ]);
    await db.query('delete from public.erp_product_categories where id = $1', [catA[0].id]);

    const { rows } = await db.query('select category_id from public.erp_products where id = $1', [
      fx.cafe,
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].category_id, null);
  });

  it('cliente: documento no formato do Core, e único por tenant', async () => {
    await db.query(
      `insert into public.erp_customers (tenant_id, name, document) values ($1, 'Rita', '52998224725')`,
      [fx.a],
    );
    await assert.rejects(
      db.query(
        `insert into public.erp_customers (tenant_id, name, document) values ($1, 'Outra', '52998224725')`,
        [fx.a],
      ),
      /erp_customers_document_per_tenant/,
    );
    await assert.rejects(
      db.query(
        `insert into public.erp_customers (tenant_id, name, document) values ($1, 'Fmt', '529.982.247-25')`,
        [fx.a],
      ),
      /erp_customers_document_format/,
      'o banco guarda só os caracteres; a máscara é da tela',
    );
    // CNPJ alfanumérico (julho de 2026) passa.
    await db.query(
      `insert into public.erp_customers (tenant_id, name, document) values ($1, 'Nova', '12ABC34501DE35')`,
      [fx.a],
    );
  });

  it('forma de pagamento: quem vende lê; só quem configura escreve', async () => {
    const lidas = await asUser(db, fx.colabA, () =>
      db.query('select name from public.erp_payment_methods where tenant_id = $1', [fx.a]),
    );
    assert.equal(lidas.rows.length, 2);

    for (const quem of [fx.colabA, fx.gestorA]) {
      await assert.rejects(
        asUser(db, quem, () =>
          db.query(
            `insert into public.erp_payment_methods (tenant_id, name) values ($1, 'Fiado')`,
            [fx.a],
          ),
        ),
        /row-level security/,
      );
    }

    await asUserCommitting(db, fx.adminA, () =>
      db.query(
        `insert into public.erp_payment_methods (tenant_id, name, settlement_days) values ($1, 'Boleto', 3)`,
        [fx.a],
      ),
    );

    await assert.rejects(
      db.query(
        `insert into public.erp_payment_methods (tenant_id, name, settlement_days) values ($1, 'X', 400)`,
        [fx.a],
      ),
      /erp_payment_methods_settlement/,
    );
  });

  it('`tenant_id` não se edita — pelo privilégio, e não só pelo RLS', async () => {
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('update public.erp_products set tenant_id = $1 where id = $2', [fx.b, fx.cafe]),
      ),
      /permission denied/,
    );
  });
});

/* ── 2. Venda ──────────────────────────────────────────────────────────── */

describe('registrar venda', () => {
  it('grava venda, itens e pagamentos, com preço e nome do cadastro', async () => {
    const r = await vender(
      fx.adminA,
      fx.a,
      [
        { product_id: fx.cafe, quantity: 2 },
        { product_id: fx.queijo, quantity: 0.335 },
      ],
      [
        { payment_method_id: fx.dinheiro, amount_cents: 1107 },
        { payment_method_id: fx.credito, amount_cents: 2000 },
      ],
    );

    // 2 × 5,50 = 11,00; 0,335 kg × 59,90 = 20,0665 → 20,07.
    assert.equal(r.number, 1);
    assert.equal(r.total_cents, 3107);

    const { rows: venda } = await db.query(
      `select status::text, subtotal_cents, discount_cents, total_cents, created_by
       from public.erp_sales where id = $1`,
      [r.id],
    );
    assert.equal(venda[0].status, 'completed');
    assert.equal(Number(venda[0].subtotal_cents), 3107);
    assert.equal(venda[0].created_by, fx.adminA);

    const { rows: itens } = await db.query(
      `select description, unit, quantity, unit_price_cents, total_cents
       from public.erp_sale_items where sale_id = $1 order by position`,
      [r.id],
    );
    assert.deepEqual(
      itens.map((i) => [
        i.description,
        i.unit,
        Number(i.quantity),
        Number(i.unit_price_cents),
        Number(i.total_cents),
      ]),
      [
        ['Café coado', 'un', 2, 550, 1100],
        ['Queijo minas', 'kg', 0.335, 5990, 2007],
      ],
    );

    const { rows: pagos } = await db.query(
      `select method_name, settlement_days, amount_cents
       from public.erp_sale_payments where sale_id = $1 order by position`,
      [r.id],
    );
    assert.deepEqual(
      pagos.map((p) => [p.method_name, p.settlement_days, Number(p.amount_cents)]),
      [
        ['Dinheiro', 0, 1107],
        ['Cartão de crédito', 30, 2000],
      ],
    );

    const { rows: auditoria } = await db.query(
      `select actor_user_id, metadata from public.audit_logs
       where tenant_id = $1 and action = 'sale.registered'`,
      [fx.a],
    );
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0].actor_user_id, fx.adminA);
    assert.equal(auditoria[0].metadata.number, 1);
  });

  it('numeração sequencial por tenant', async () => {
    const um = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    const dois = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    const outra = await vender(
      fx.adminB,
      fx.b,
      [{ product_id: fx.cafeB, quantity: 1 }],
      [{ payment_method_id: fx.pixB, amount_cents: 700 }],
    );
    assert.deepEqual([um.number, dois.number, outra.number], [1, 2, 1]);
  });

  it('desconto fica registrado, e não passa do valor dos itens', async () => {
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 2 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 1000 }],
      { desconto: 100 },
    );
    assert.equal(r.total_cents, 1000);

    await assert.rejects(
      vender(fx.adminA, fx.a, [{ product_id: fx.cafe, quantity: 1 }], [], { desconto: 551 }),
      /desconto/,
    );
  });

  it('pagamentos que não fecham com o total são recusados', async () => {
    await assert.rejects(
      vender(
        fx.adminA,
        fx.a,
        [{ product_id: fx.cafe, quantity: 2 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 1000 }],
      ),
      /os pagamentos somam 1000 centavos, e a venda é de 1100/,
    );
    const { rows } = await db.query('select count(*)::int as n from public.erp_sales');
    assert.equal(rows[0].n, 0, 'nada fica pela metade');
  });

  it('o padrão é exigir cliente, e a configuração desliga', async () => {
    const c = await createTenant(db, { slug: 'loja-c', name: 'Loja C' });
    await habilitar(c, ['core', 'erp']);
    const adminC = await createUser(db, { email: 'admin@c.test' });
    await addMember(db, { tenantId: c, userId: adminC, roleCode: 'tenant_admin' });
    const pao = await produto(c, { name: 'Pão', price: 100 });
    const pix = await forma(c, { name: 'Pix' });

    await assert.rejects(
      vender(
        adminC,
        c,
        [{ product_id: pao, quantity: 1 }],
        [{ payment_method_id: pix, amount_cents: 100 }],
      ),
      /exige cliente identificado/,
    );

    const { rows } = await db.query(
      `insert into public.erp_customers (tenant_id, name) values ($1, 'Rita') returning id`,
      [c],
    );
    const r = await vender(
      adminC,
      c,
      [{ product_id: pao, quantity: 1 }],
      [{ payment_method_id: pix, amount_cents: 100 }],
      { cliente: rows[0].id },
    );
    assert.equal(r.number, 1);

    await configurar(c, { 'erp.sales_requires_customer': false });
    const semCliente = await vender(
      adminC,
      c,
      [{ product_id: pao, quantity: 1 }],
      [{ payment_method_id: pix, amount_cents: 100 }],
    );
    assert.equal(semCliente.number, 2);
  });

  it('produto desativado, fração de unidade inteira e produto de outro tenant são recusados', async () => {
    await db.query('update public.erp_products set active = false where id = $1', [fx.sacola]);
    await assert.rejects(
      vender(
        fx.adminA,
        fx.a,
        [{ product_id: fx.sacola, quantity: 1 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 10 }],
      ),
      /"Sacola" está desativado/,
    );

    await assert.rejects(
      vender(
        fx.adminA,
        fx.a,
        [{ product_id: fx.cafe, quantity: 1.5 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 825 }],
      ),
      /"Café coado" se vende por un, sem fração/,
    );

    await assert.rejects(
      vender(
        fx.adminA,
        fx.a,
        [{ product_id: fx.cafeB, quantity: 1 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 700 }],
      ),
      /produto não encontrado/,
    );

    await assert.rejects(
      vender(
        fx.adminA,
        fx.a,
        [{ product_id: fx.cafe, quantity: 1.0001 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
      ),
      /até três casas decimais/,
    );
  });

  it('sem `erp.sales.write`, a mensagem diz o que falta', async () => {
    const estoquista = await papel(fx.a, 'estoquista', [
      'erp.products.read',
      'inventory.stock.read',
      'inventory.movements.write',
    ]);
    const quem = await createUser(db, { email: 'est@a.test' });
    await membroCom(fx.a, quem, estoquista);

    await assert.rejects(
      vender(
        quem,
        fx.a,
        [{ product_id: fx.cafe, quantity: 1 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
      ),
      /você não tem permissão para registrar venda/,
    );
  });

  it('o outro tenant não vende no meu nome', async () => {
    await assert.rejects(
      vender(
        fx.adminB,
        fx.a,
        [{ product_id: fx.cafe, quantity: 1 }],
        [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
      ),
      /você não tem permissão para registrar venda/,
    );
  });
});

describe('venda escrita à mão, sem a função', () => {
  it('venda sem item não passa do commit', async () => {
    await assert.rejects(
      asUserCommitting(db, fx.adminA, () =>
        db.query(
          `insert into public.erp_sales (tenant_id, subtotal_cents, total_cents) values ($1, 0, 0)`,
          [fx.a],
        ),
      ),
      /a venda precisa de pelo menos um item/,
    );
  });

  it('o preço digitado é ignorado: vale o do cadastro', async () => {
    /*
     * Três inserções avulsas, como faria quem chamasse o PostgREST direto.
     * O item pede R$ 0,01 pelo café; o gatilho grava R$ 5,50, e a venda só
     * fecha porque o subtotal diz R$ 5,50.
     */
    await asUserCommitting(db, fx.adminA, async () => {
      const { rows } = await db.query(
        `insert into public.erp_sales (tenant_id, subtotal_cents, total_cents)
         values ($1, 550, 550) returning id`,
        [fx.a],
      );
      await db.query(
        `insert into public.erp_sale_items (tenant_id, sale_id, product_id, quantity, unit_price_cents,
           description, unit, total_cents)
         values ($1, $2, $3, 1, 1, 'Café baratinho', 'un', 1)`,
        [fx.a, rows[0].id, fx.cafe],
      );
      await db.query(
        `insert into public.erp_sale_payments (tenant_id, sale_id, payment_method_id, amount_cents,
           method_name, settlement_days)
         values ($1, $2, $3, 550, 'Qualquer', 99)`,
        [fx.a, rows[0].id, fx.dinheiro],
      );
    });

    const { rows } = await db.query(
      `select i.description, i.unit_price_cents, p.method_name, p.settlement_days
       from public.erp_sale_items i join public.erp_sale_payments p on p.sale_id = i.sale_id`,
    );
    assert.equal(rows[0].description, 'Café coado');
    assert.equal(Number(rows[0].unit_price_cents), 550);
    assert.equal(rows[0].method_name, 'Dinheiro');
    assert.equal(rows[0].settlement_days, 0);
  });

  it('item não entra em venda já registrada — nem de preço zero', async () => {
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    await db.query('update public.erp_products set price_cents = 0 where id = $1', [fx.sacola]);

    await assert.rejects(
      asUserCommitting(db, fx.adminA, () =>
        db.query(
          `insert into public.erp_sale_items (tenant_id, sale_id, product_id, quantity)
           values ($1, $2, $3, 1)`,
          [fx.a, r.id, fx.sacola],
        ),
      ),
      /a venda nº 1 já foi registrada/,
    );
  });

  it('item, pagamento e total não se editam; venda não se apaga', async () => {
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );

    for (const sql of [
      'update public.erp_sale_items set quantity = 5 where sale_id = $1',
      'update public.erp_sale_payments set amount_cents = 1 where sale_id = $1',
      'update public.erp_sales set total_cents = 1 where id = $1',
      'update public.erp_sales set sold_at = now() - interval $$10 days$$ where id = $1',
      'delete from public.erp_sales where id = $1',
      'delete from public.erp_sale_items where sale_id = $1',
    ]) {
      await assert.rejects(
        asUser(db, fx.adminA, () => db.query(sql, [r.id])),
        /permission denied/,
        sql,
      );
    }
  });
});

describe('cancelar venda', () => {
  it('colaborador registra e não cancela; gestor cancela, com motivo, uma vez', async () => {
    const r = await vender(
      fx.colabA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );

    await assert.rejects(
      cancelar(fx.colabA, r.id, 'errei'),
      /você não tem permissão para cancelar venda/,
    );
    // A mensagem é da função; a garantia é do RLS. Pelo PostgREST, direto na
    // tabela, a mesma pessoa não cancela nada.
    const direto = await asUserCommitting(db, fx.colabA, async () => {
      const { rows } = await db.query(
        `update public.erp_sales set status = 'cancelled', cancel_reason = 'direto'
         where id = $1 returning id`,
        [r.id],
      );
      return rows.length;
    });
    assert.equal(direto, 0);

    await assert.rejects(cancelar(fx.gestorA, r.id, '   '), /diga o motivo do cancelamento/);

    await cancelar(fx.gestorA, r.id, 'cliente desistiu');

    const { rows } = await db.query(
      `select status::text, cancel_reason, cancelled_by, cancelled_at from public.erp_sales where id = $1`,
      [r.id],
    );
    assert.equal(rows[0].status, 'cancelled');
    assert.equal(rows[0].cancel_reason, 'cliente desistiu');
    assert.equal(rows[0].cancelled_by, fx.gestorA);
    assert.ok(rows[0].cancelled_at instanceof Date);

    await assert.rejects(cancelar(fx.gestorA, r.id, 'de novo'), /a venda nº 1 já está cancelada/);

    const { rows: auditoria } = await db.query(
      `select actor_user_id, metadata from public.audit_logs where action = 'sale.cancelled'`,
    );
    assert.equal(auditoria.length, 1);
    assert.equal(auditoria[0].actor_user_id, fx.gestorA);
    assert.equal(auditoria[0].metadata.reason, 'cliente desistiu');
  });
});

/* ── 3. Estoque ────────────────────────────────────────────────────────── */

describe('estoque', () => {
  it('a venda baixa o que controla estoque, e só isso', async () => {
    await movimentar(fx.adminA, fx.a, fx.cafe, 'in', { quantidade: 10 });

    await vender(
      fx.colabA,
      fx.a,
      [
        { product_id: fx.cafe, quantity: 2 },
        { product_id: fx.queijo, quantity: 0.5 },
        { product_id: fx.sacola, quantity: 1 },
      ],
      [{ payment_method_id: fx.dinheiro, amount_cents: 1100 + 2995 + 10 }],
    );

    assert.equal(await saldo(fx.a, fx.cafe), 8);
    assert.equal(await saldo(fx.a, fx.queijo), -0.5, 'saldo negativo é permitido — e aparece');
    assert.equal(await saldo(fx.a, fx.sacola), null, 'sacola não controla estoque');

    const { rows } = await db.query(
      `select kind::text, quantity, sale_item_id is not null as ligado
       from public.inventory_movements where product_id = $1 and kind = 'sale'`,
      [fx.cafe],
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].quantity), -2);
    assert.equal(rows[0].ligado, true);
  });

  it('com a baixa desligada, ou sem o módulo, a venda não mexe no estoque', async () => {
    await configurar(fx.a, { 'inventory.deduct_on_sale': false });
    await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    assert.equal(await saldo(fx.a, fx.cafe), null);

    await configurar(fx.a, { 'inventory.deduct_on_sale': true });
    await desabilitar(fx.a, 'inventory');
    await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    assert.equal(await saldo(fx.a, fx.cafe), null);
  });

  it('venda cancelada devolve exatamente o que baixou — mesmo se o cadastro mudou', async () => {
    await movimentar(fx.adminA, fx.a, fx.cafe, 'in', { quantidade: 10 });
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 3 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 1650 }],
    );
    assert.equal(await saldo(fx.a, fx.cafe), 7);

    await db.query('update public.erp_products set track_stock = false where id = $1', [fx.cafe]);
    await cancelar(fx.adminA, r.id, 'devolvido');
    assert.equal(await saldo(fx.a, fx.cafe), 10);

    const { rows } = await db.query(
      `select count(*)::int as n from public.inventory_movements where sale_id = $1 and kind = 'sale_return'`,
      [r.id],
    );
    assert.equal(rows[0].n, 1);
  });

  it('entrada, saída com motivo e contagem', async () => {
    await movimentar(fx.colabA, fx.a, fx.cafe, 'in', { quantidade: 10, custo: 300 });
    assert.equal(await saldo(fx.a, fx.cafe), 10);

    await assert.rejects(
      movimentar(fx.colabA, fx.a, fx.cafe, 'out', { quantidade: -2 }),
      /inventory_movements_reason/,
      'saída sem motivo é o furo que ninguém explica',
    );
    await movimentar(fx.colabA, fx.a, fx.cafe, 'out', { quantidade: -2, motivo: 'quebrou' });
    assert.equal(await saldo(fx.a, fx.cafe), 8);

    // Contou 5: o banco calcula a diferença contra o saldo.
    await movimentar(fx.colabA, fx.a, fx.cafe, 'adjustment', { contado: 5 });
    assert.equal(await saldo(fx.a, fx.cafe), 5);
    const { rows } = await db.query(
      `select quantity, counted_quantity from public.inventory_movements
       where product_id = $1 and kind = 'adjustment'`,
      [fx.cafe],
    );
    assert.equal(Number(rows[0].quantity), -3);
    assert.equal(Number(rows[0].counted_quantity), 5);

    // Contagem que confere também fica registrada.
    await movimentar(fx.colabA, fx.a, fx.cafe, 'adjustment', { contado: 5 });
    assert.equal(await saldo(fx.a, fx.cafe), 5);
  });

  it('fração só em unidade fracionada; produto sem controle não movimenta', async () => {
    await assert.rejects(
      movimentar(fx.adminA, fx.a, fx.cafe, 'in', { quantidade: 1.5 }),
      /"Café coado" se conta por un, sem fração/,
    );
    await movimentar(fx.adminA, fx.a, fx.queijo, 'in', { quantidade: 1.25 });
    assert.equal(await saldo(fx.a, fx.queijo), 1.25);

    await assert.rejects(
      movimentar(fx.adminA, fx.a, fx.sacola, 'in', { quantidade: 1 }),
      /"Sacola" não controla estoque/,
    );
  });

  it('baixa e devolução de venda não se escrevem à mão; o razão e o saldo não se editam', async () => {
    /*
     * Com venda e item de verdade, para que só o RLS possa recusar: sem ele,
     * uma "devolução" avulsa de uma venda que ninguém cancelou poria
     * mercadoria no estoque pela porta dos fundos — e a ligação com a venda
     * pareceria legítima.
     */
    await movimentar(fx.adminA, fx.a, fx.cafe, 'in', { quantidade: 10 });
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    const { rows: item } = await db.query(
      'select id from public.erp_sale_items where sale_id = $1',
      [r.id],
    );

    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query(
          `insert into public.inventory_movements (tenant_id, product_id, kind, quantity, sale_id, sale_item_id)
           values ($1, $2, 'sale_return', 1, $3, $4)`,
          [fx.a, fx.cafe, r.id, item[0].id],
        ),
      ),
      /row-level security/,
    );
    assert.equal(await saldo(fx.a, fx.cafe), 9);

    for (const sql of [
      'update public.inventory_movements set quantity = 100 where tenant_id = $1',
      'delete from public.inventory_movements where tenant_id = $1',
      'update public.inventory_stock_levels set quantity = 100 where tenant_id = $1',
      'delete from public.inventory_stock_levels where tenant_id = $1',
    ]) {
      await assert.rejects(
        asUser(db, fx.adminA, () => db.query(sql, [fx.a])),
        /permission denied/,
        sql,
      );
    }
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query(
          `insert into public.inventory_stock_levels (tenant_id, product_id, quantity) values ($1, $2, 99)`,
          [fx.a, fx.queijo],
        ),
      ),
      /permission denied/,
    );
  });

  it('produto com movimentação não se apaga', async () => {
    await movimentar(fx.adminA, fx.a, fx.cafe, 'in', { quantidade: 1 });
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('delete from public.erp_products where id = $1', [fx.cafe]),
      ),
      /inventory_movements_product_do_tenant/,
    );
  });
});

/* ── 4. Financeiro ─────────────────────────────────────────────────────── */

describe('financeiro', () => {
  it('cada pagamento vira conta a receber: à vista já recebida, a prazo em aberto', async () => {
    const dia = await hoje();
    const r = await vender(
      fx.colabA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 2 }],
      [
        { payment_method_id: fx.dinheiro, amount_cents: 300 },
        { payment_method_id: fx.credito, amount_cents: 800 },
      ],
    );

    const lancs = await lancamentosDaVenda(r.id);
    assert.deepEqual(
      lancs.map((l) => [l.direction, l.description, l.amount_cents, l.due_date, l.paid_on]),
      [
        ['receivable', 'Venda nº 1 — Dinheiro', 300, dia.d, dia.d],
        ['receivable', 'Venda nº 1 — Cartão de crédito', 800, dia.d30, null],
      ],
    );
  });

  it('o caixa não lê o financeiro, e a venda dele gera a conta a receber mesmo assim', async () => {
    await vender(
      fx.colabA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.credito, amount_cents: 550 }],
    );
    const visto = await asUser(db, fx.colabA, () =>
      db.query('select id from public.finance_entries where tenant_id = $1', [fx.a]),
    );
    assert.equal(visto.rows.length, 0);

    const { rows } = await db.query('select count(*)::int as n from public.finance_entries');
    assert.equal(rows[0].n, 1);
  });

  it('a descrição usa o vocabulário do nicho', async () => {
    await db.query(`update public.tenants set terms = $2::text::jsonb where id = $1`, [
      fx.a,
      JSON.stringify({ 'erp.sales': { singular: 'pedido', plural: 'pedidos' } }),
    ]);
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    const [l] = await lancamentosDaVenda(r.id);
    assert.equal(l.description, 'Pedido nº 1 — Dinheiro');
  });

  it('sem o módulo financeiro, a venda não gera lançamento', async () => {
    await desabilitar(fx.a, 'finance');
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.credito, amount_cents: 550 }],
    );
    assert.deepEqual(await lancamentosDaVenda(r.id), []);
  });

  it('cancelar: o que não entrou é cancelado; o que entrou vira devolução a pagar', async () => {
    const dia = await hoje();
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 2 }],
      [
        { payment_method_id: fx.dinheiro, amount_cents: 300 },
        { payment_method_id: fx.credito, amount_cents: 800 },
      ],
    );
    await cancelar(fx.adminA, r.id, 'cliente devolveu');

    const lancs = await lancamentosDaVenda(r.id);
    const [devolucao, recebido, emAberto] = [
      lancs.find((l) => l.direction === 'payable'),
      lancs.find((l) => l.direction === 'receivable' && l.paid_on !== null),
      lancs.find((l) => l.direction === 'receivable' && l.paid_on === null),
    ];

    assert.ok(emAberto.cancelled_at instanceof Date, 'o crédito não vai mais entrar');
    assert.equal(recebido.cancelled_at, null, 'o dinheiro que entrou não some do caixa');
    assert.equal(devolucao.amount_cents, 300);
    assert.equal(devolucao.due_date, dia.d);
    assert.equal(devolucao.paid_on, null);
    assert.equal(devolucao.description, 'Devolução — Venda nº 1');
  });

  it('lançamento da venda: registra-se a baixa; valor e cancelamento seguem a venda', async () => {
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.credito, amount_cents: 550 }],
    );
    const { rows } = await db.query('select id from public.finance_entries where sale_id = $1', [
      r.id,
    ]);
    const id = rows[0].id;
    const dia = await hoje();

    await asUserCommitting(db, fx.gestorA, () =>
      db.query('update public.finance_entries set paid_on = $2::date where id = $1', [id, dia.d]),
    );

    await assert.rejects(
      asUser(db, fx.gestorA, () =>
        db.query('update public.finance_entries set amount_cents = 1 where id = $1', [id]),
      ),
      /veio da venda nº 1: valor, vencimento e descrição seguem a venda/,
    );
    await asUserCommitting(db, fx.gestorA, () =>
      db.query('update public.finance_entries set paid_on = null where id = $1', [id]),
    );
    await assert.rejects(
      asUser(db, fx.gestorA, () =>
        db.query(
          `update public.finance_entries set cancelled_at = now(), cancel_reason = 'x' where id = $1`,
          [id],
        ),
      ),
      /para cancelar, cancele a venda/,
    );
  });

  it('lançamento avulso: permissão por direção, e nunca com cara de venda', async () => {
    const dia = await hoje();
    const inserir = (quem, direcao, extra = '') =>
      asUserCommitting(db, quem, () =>
        db.query(
          `insert into public.finance_entries (tenant_id, direction, description, amount_cents, due_date${extra ? ', sale_id' : ''})
           values ($1, $2::public.finance_direction, 'Aluguel', 150000, $3::date${extra ? ', $4' : ''})`,
          extra ? [fx.a, direcao, dia.d, extra] : [fx.a, direcao, dia.d],
        ),
      );

    await assert.rejects(inserir(fx.colabA, 'payable'), /row-level security/);

    const pagar = await papel(fx.a, 'contas_a_pagar', [
      'finance.payables.read',
      'finance.payables.write',
    ]);
    const quem = await createUser(db, { email: 'pagar@a.test' });
    await membroCom(fx.a, quem, pagar);

    await inserir(quem, 'payable');
    await assert.rejects(inserir(quem, 'receivable'), /row-level security/);

    // Uma conta a receber da venda escrita à mão seria dinheiro inventado.
    const r = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    await assert.rejects(inserir(fx.adminA, 'receivable', r.id), /row-level security/);

    // E quem só cuida do que se paga não vê o que se recebe.
    const visto = await asUser(db, quem, () =>
      db.query('select direction::text from public.finance_entries where tenant_id = $1', [fx.a]),
    );
    assert.deepEqual(
      visto.rows.map((v) => v.direction),
      ['payable'],
    );
  });

  it('pagamento no futuro, cancelar o que foi pago e mexer no cancelado são recusados', async () => {
    const dia = await hoje();
    const { rows } = await db.query(
      `insert into public.finance_entries (tenant_id, direction, description, amount_cents, due_date)
       values ($1, 'payable', 'Luz', 30000, $2::date) returning id`,
      [fx.a, dia.d],
    );
    const id = rows[0].id;
    const como = (sql, params) => asUserCommitting(db, fx.adminA, () => db.query(sql, params));

    await assert.rejects(
      como(`update public.finance_entries set paid_on = $2::date + 1 where id = $1`, [id, dia.d]),
      /não pode estar no futuro/,
    );

    await como(`update public.finance_entries set paid_on = $2::date where id = $1`, [id, dia.d]);
    await assert.rejects(
      como(
        `update public.finance_entries set cancelled_at = now(), cancel_reason = 'x' where id = $1`,
        [id],
      ),
      /lançamento pago não se cancela/,
    );

    await como(`update public.finance_entries set paid_on = null where id = $1`, [id]);
    await assert.rejects(
      como(`update public.finance_entries set cancelled_at = now() where id = $1`, [id]),
      /diga o motivo/,
    );
    await como(
      `update public.finance_entries set cancelled_at = now(), cancel_reason = 'lançado em dobro' where id = $1`,
      [id],
    );
    await assert.rejects(
      como(`update public.finance_entries set description = 'outra' where id = $1`, [id]),
      /lançamento cancelado não muda/,
    );

    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('delete from public.finance_entries where id = $1', [id]),
      ),
      /permission denied/,
    );
  });
});

/* ── 5. Resumo de vendas ───────────────────────────────────────────────── */

describe('erp_sales_summary', () => {
  const resumo = (userId, tenantId, de, ate) =>
    asUser(db, userId, async () => {
      const { rows } = await db.query(
        'select * from public.erp_sales_summary($1, $2::timestamptz, $3::timestamptz)',
        [tenantId, de, ate],
      );
      const r = rows[0];
      return {
        vendas: Number(r.sales_count),
        total: Number(r.total_cents),
        desconto: Number(r.discount_cents),
        canceladas: Number(r.cancelled_count),
      };
    });

  it('soma o que foi concluído no período, e conta à parte o cancelado', async () => {
    await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 2 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 1000 }],
      { desconto: 100 },
    );
    const outra = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    await cancelar(fx.adminA, outra.id, 'errado');

    const r = await resumo(fx.gestorA, fx.a, '2000-01-01', '2100-01-01');
    assert.deepEqual(r, { vendas: 1, total: 1000, desconto: 100, canceladas: 1 });
  });

  it('o período é [de, até): o fim de um dia é o começo do outro', async () => {
    const r1 = await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    await db.query(`update public.erp_sales set sold_at = '2026-09-24T03:00:00Z' where id = $1`, [
      r1.id,
    ]);
    // 24/09 00:00 em São Paulo é 03:00 UTC: a venda é do dia 24, não do 23.
    assert.equal(
      (await resumo(fx.adminA, fx.a, '2026-09-23T03:00:00Z', '2026-09-24T03:00:00Z')).vendas,
      0,
    );
    assert.equal(
      (await resumo(fx.adminA, fx.a, '2026-09-24T03:00:00Z', '2026-09-25T03:00:00Z')).vendas,
      1,
    );
  });

  it('o tenant alheio recebe zero — não erro, nada', async () => {
    await vender(
      fx.adminA,
      fx.a,
      [{ product_id: fx.cafe, quantity: 1 }],
      [{ payment_method_id: fx.dinheiro, amount_cents: 550 }],
    );
    const r = await resumo(fx.adminB, fx.a, '2000-01-01', '2100-01-01');
    assert.deepEqual(r, { vendas: 0, total: 0, desconto: 0, canceladas: 0 });
  });
});
