/**
 * Testes do esquema do ERP.
 *
 * Quatro famílias, e cada uma prova uma afirmação que as migrations fazem:
 *
 *   1. Isolamento — o ERP herda o do Core, e isso se verifica, não se supõe.
 *   2. **Estoque é razão, não coluna.** O saldo é mantido por gatilho e a
 *      aplicação não consegue escrevê-lo. É a afirmação central do módulo.
 *   3. **Total é derivado.** Ninguém digita o total de uma venda.
 *   4. Confirmar é uma transação: número, estado, baixa e recebimento juntos,
 *      respeitando as duas configurações do tenant.
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

/** Uma linha, criada com privilégio total (fora do RLS). */
async function criar(tabela, valores) {
  const colunas = Object.keys(valores);
  const params = colunas.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query(
    `insert into public.${tabela} (${colunas.join(', ')}) values (${params.join(', ')}) returning id`,
    Object.values(valores),
  );
  return rows[0].id;
}

async function saldo(tenantId, produtoId) {
  const { rows } = await db.query(
    'select quantity from public.erp_stock_balances where tenant_id = $1 and product_id = $2',
    [tenantId, produtoId],
  );
  return rows.length === 0 ? null : Number(rows[0].quantity);
}

/**
 * Os campos de uma venda, com o dinheiro já em `Number`.
 *
 * Normalizar aqui não é conveniência: **o PGlite devolve `bigint` como número
 * e o driver de produção devolve como texto.** É a mesma família da armadilha
 * do `jsonb` que já custou uma noite neste projeto — o teste passa e a
 * produção diverge. Comparar sempre normalizado é o que impede o teste de
 * afirmar algo que só vale num dos dois.
 */
async function venda(id) {
  const { rows } = await db.query(
    'select status, number, total_cents, discount_cents from public.erp_sales where id = $1',
    [id],
  );
  const linha = rows[0];
  if (linha === undefined) return null;
  return {
    status: linha.status,
    number: linha.number === null ? null : Number(linha.number),
    total_cents: Number(linha.total_cents),
    discount_cents: Number(linha.discount_cents),
  };
}

/** Liga ou desliga uma configuração do tenant. */
async function configurar(tenantId, chave, valor) {
  await db.query(
    `update public.tenants
        set settings = coalesce(settings, '{}'::jsonb) || ($2)::text::jsonb
      where id = $1`,
    [tenantId, JSON.stringify({ [chave]: valor })],
  );
}

before(async () => {
  db = await createDatabase();

  fx.tenantA = await createTenant(db, { slug: 'aurora-erp', name: 'Aurora', planCode: 'avancado' });
  fx.tenantB = await createTenant(db, { slug: 'base-erp', name: 'Base', planCode: 'avancado' });

  fx.adminA = await createUser(db, { email: 'admin@aurora.erp', fullName: 'Admin A' });
  fx.adminB = await createUser(db, { email: 'admin@base.erp', fullName: 'Admin B' });
  await addMember(db, { tenantId: fx.tenantA, userId: fx.adminA, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenantB, userId: fx.adminB, roleCode: 'tenant_admin' });

  for (const [lado, tenant] of [
    ['A', fx.tenantA],
    ['B', fx.tenantB],
  ]) {
    fx[`categoria${lado}`] = await criar('erp_product_categories', {
      tenant_id: tenant,
      name: 'Bebidas',
    });
    fx[`produto${lado}`] = await criar('erp_products', {
      tenant_id: tenant,
      category_id: fx[`categoria${lado}`],
      name: `Café ${lado}`,
      sku: `CAFE-${lado}`,
      unit: 'kg',
      price_cents: 4500,
      cost_cents: 2000,
    });
    fx[`servico${lado}`] = await criar('erp_products', {
      tenant_id: tenant,
      name: `Consultoria ${lado}`,
      unit: 'h',
      price_cents: 20000,
      track_stock: false,
    });
    fx[`forma${lado}`] = await criar('erp_payment_methods', {
      tenant_id: tenant,
      name: 'Dinheiro',
    });
    fx[`empresa${lado}`] = await criar('crm_companies', {
      tenant_id: tenant,
      name: `Cliente ${lado}`,
    });
    fx[`movimento${lado}`] = await criar('erp_stock_movements', {
      tenant_id: tenant,
      product_id: fx[`produto${lado}`],
      kind: 'in',
      quantity: 100,
      reason: 'Estoque inicial',
    });
    fx[`venda${lado}`] = await criar('erp_sales', {
      tenant_id: tenant,
      company_id: fx[`empresa${lado}`],
    });
    fx[`item${lado}`] = await criar('erp_sale_items', {
      tenant_id: tenant,
      sale_id: fx[`venda${lado}`],
      product_id: fx[`produto${lado}`],
      quantity: 2,
      unit_price_cents: 4500,
    });
    fx[`conta${lado}`] = await criar('finance_entries', {
      tenant_id: tenant,
      kind: 'payable',
      description: `Aluguel ${lado}`,
      amount_cents: 300000,
      due_date: '2026-10-10',
    });
  }
});

after(async () => {
  await db?.close?.();
});

/* ── 1. Isolamento ─────────────────────────────────────────────────────── */

describe('isolamento entre tenants', () => {
  const tabelas = [
    'erp_product_categories',
    'erp_products',
    'erp_payment_methods',
    'erp_stock_movements',
    'erp_stock_balances',
    'erp_sales',
    'erp_sale_items',
    'finance_entries',
  ];

  it('cada tabela do ERP só devolve linhas do próprio tenant', async () => {
    for (const tabela of tabelas) {
      const { rows } = await asUser(db, fx.adminA, () =>
        db.query(`select tenant_id from public.${tabela}`),
      );
      assert.ok(rows.length > 0, `${tabela}: o cenário precisa ter linha para separar`);
      for (const linha of rows) {
        assert.equal(linha.tenant_id, fx.tenantA, `${tabela} vazou linha de outro tenant`);
      }
    }
  });

  it('não dá para escrever no tenant do outro', async () => {
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('insert into public.erp_products (tenant_id, name) values ($1, $2)', [
          fx.tenantB,
          'Infiltrado',
        ]),
      ),
      /row-level security|violates/i,
    );
  });

  it('`tenant_id` não é editável, nem na própria linha', async () => {
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('update public.erp_products set tenant_id = $1 where id = $2', [
          fx.tenantB,
          fx.produtoA,
        ]),
      ),
      /permission denied|row-level security/i,
    );
  });
});

/* ── 2. Referência entre tenants é impossível de escrever ──────────────── */

describe('a chave composta fecha o ERP', () => {
  it('produto não aponta para categoria de outro tenant', async () => {
    await assert.rejects(
      criar('erp_products', {
        tenant_id: fx.tenantA,
        category_id: fx.categoriaB,
        name: 'Espião',
      }),
      /category_do_tenant/,
    );
  });

  it('item de venda não aponta para produto de outro tenant', async () => {
    await assert.rejects(
      criar('erp_sale_items', {
        tenant_id: fx.tenantA,
        sale_id: fx.vendaA,
        product_id: fx.produtoB,
        quantity: 1,
        unit_price_cents: 100,
      }),
      /product_do_tenant/,
    );
  });

  it('venda não aponta para cliente de outro tenant', async () => {
    await assert.rejects(
      criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaB }),
      /company_do_tenant/,
    );
  });

  it('movimento não aponta para produto de outro tenant', async () => {
    await assert.rejects(
      criar('erp_stock_movements', {
        tenant_id: fx.tenantA,
        product_id: fx.produtoB,
        kind: 'in',
        quantity: 1,
      }),
      /product_do_tenant/,
    );
  });
});

/* ── 3. Estoque é razão, não coluna ────────────────────────────────────── */

describe('o saldo vem do razão', () => {
  it('entrada soma, saída subtrai', async () => {
    const t = fx.tenantA;
    const p = await criar('erp_products', { tenant_id: t, name: 'Chá' });

    assert.equal(await saldo(t, p), null, 'produto sem movimento não tem linha de saldo');

    await criar('erp_stock_movements', { tenant_id: t, product_id: p, kind: 'in', quantity: 10 });
    assert.equal(await saldo(t, p), 10);

    await criar('erp_stock_movements', { tenant_id: t, product_id: p, kind: 'out', quantity: 3 });
    assert.equal(await saldo(t, p), 7);
  });

  it('ajuste para menos entra como saída — o sinal é do tipo', async () => {
    /*
     * `quantity` é sempre positiva, e há constraint provando. Quantidade
     * negativa com kind `in` seria uma saída disfarçada de entrada, e nenhuma
     * soma perceberia.
     */
    const t = fx.tenantA;
    const p = await criar('erp_products', { tenant_id: t, name: 'Açúcar' });
    await criar('erp_stock_movements', { tenant_id: t, product_id: p, kind: 'in', quantity: 5 });

    await assert.rejects(
      criar('erp_stock_movements', {
        tenant_id: t,
        product_id: p,
        kind: 'in',
        quantity: -2,
      }),
      /quantity_positive/,
    );
    assert.equal(await saldo(t, p), 5);
  });

  it('a aplicação não escreve o saldo — nem com permissão de tudo', async () => {
    /*
     * A afirmação central do módulo. Se isto passasse, o saldo viraria uma
     * segunda verdade e divergiria do razão no primeiro acerto manual.
     */
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('update public.erp_stock_balances set quantity = 999 where product_id = $1', [
          fx.produtoA,
        ]),
      ),
      /permission denied/i,
    );
  });

  it('o razão não se edita nem se apaga — corrigir é lançar ajuste', async () => {
    await assert.rejects(
      db.query('update public.erp_stock_movements set quantity = 1 where id = $1', [fx.movimentoA]),
      /não se altera/,
    );
    await assert.rejects(
      db.query('delete from public.erp_stock_movements where id = $1', [fx.movimentoA]),
      /não se altera/,
    );
  });

  it('o saldo bate com a soma do razão, sempre', async () => {
    // O invariante. Qualquer caminho que gravasse saldo sem passar pelo razão
    // quebraria aqui.
    const { rows } = await db.query(
      `select b.product_id,
              b.quantity as saldo,
              coalesce(sum(case m.kind when 'out' then -m.quantity else m.quantity end), 0) as razao
         from public.erp_stock_balances b
         left join public.erp_stock_movements m
                on m.tenant_id = b.tenant_id and m.product_id = b.product_id
        group by b.product_id, b.quantity`,
    );
    assert.ok(rows.length > 0, 'o cenário precisa ter saldo para comparar');
    for (const linha of rows) {
      assert.equal(
        Number(linha.saldo),
        Number(linha.razao),
        `o saldo do produto ${linha.product_id} divergiu do razão`,
      );
    }
  });
});

/* ── 4. Total derivado ─────────────────────────────────────────────────── */

describe('o total da venda é derivado', () => {
  it('somar item recalcula o total', async () => {
    const v = await criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaA });
    assert.equal((await venda(v)).total_cents, 0);

    await criar('erp_sale_items', {
      tenant_id: fx.tenantA,
      sale_id: v,
      product_id: fx.produtoA,
      quantity: 3,
      unit_price_cents: 1000,
    });
    assert.equal((await venda(v)).total_cents, 3000);
  });

  it('apagar item recalcula também', async () => {
    const v = await criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaA });
    const item = await criar('erp_sale_items', {
      tenant_id: fx.tenantA,
      sale_id: v,
      product_id: fx.produtoA,
      quantity: 1,
      unit_price_cents: 5000,
    });
    await db.query('delete from public.erp_sale_items where id = $1', [item]);
    assert.equal((await venda(v)).total_cents, 0);
  });

  it('mudar o desconto recalcula, sem precisar mexer em item', async () => {
    // Sem o gatilho do desconto, o total ficaria com o desconto antigo até
    // alguém mexer num item — e ninguém mexe depois de fechar.
    const v = await criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaA });
    await criar('erp_sale_items', {
      tenant_id: fx.tenantA,
      sale_id: v,
      product_id: fx.produtoA,
      quantity: 1,
      unit_price_cents: 10000,
    });

    await db.query('update public.erp_sales set discount_cents = 2500 where id = $1', [v]);
    assert.equal((await venda(v)).total_cents, 7500);
  });

  it('desconto maior que os itens não faz total negativo', async () => {
    const v = await criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaA });
    await criar('erp_sale_items', {
      tenant_id: fx.tenantA,
      sale_id: v,
      product_id: fx.produtoA,
      quantity: 1,
      unit_price_cents: 1000,
    });
    await db.query('update public.erp_sales set discount_cents = 99999 where id = $1', [v]);
    assert.equal((await venda(v)).total_cents, 0);
  });
});

/* ── 5. Confirmar a venda ──────────────────────────────────────────────── */

describe('confirmar a venda é uma transação', () => {
  async function vendaPronta(tenant, empresa, produto, quantidade = 2) {
    const v = await criar('erp_sales', { tenant_id: tenant, company_id: empresa });
    await criar('erp_sale_items', {
      tenant_id: tenant,
      sale_id: v,
      product_id: produto,
      quantity: quantidade,
      unit_price_cents: 4500,
    });
    return v;
  }

  it('atribui número, baixa estoque e gera o recebimento', async () => {
    const antes = await saldo(fx.tenantA, fx.produtoA);
    const v = await vendaPronta(fx.tenantA, fx.empresaA, fx.produtoA, 2);

    await asUserCommitting(db, fx.adminA, () =>
      db.query('select * from public.erp_confirm_sale($1)', [v]),
    );

    const depois = await venda(v);
    assert.equal(depois.status, 'confirmed');
    assert.ok(depois.number !== null && depois.number > 0, 'venda confirmada precisa de número');

    assert.equal(await saldo(fx.tenantA, fx.produtoA), antes - 2, 'o estoque não baixou');

    const { rows } = await db.query(
      'select kind, amount_cents from public.finance_entries where sale_id = $1',
      [v],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'receivable');
    assert.equal(Number(rows[0].amount_cents), depois.total_cents);
  });

  it('o número é sequencial por tenant, e não gasta em rascunho', async () => {
    /*
     * Buraco em sequência de venda é a primeira coisa que um contador
     * pergunta. Rascunho abandonado não pode consumir número.
     */
    const t = await createTenant(db, { slug: 'sequencia-erp', name: 'Sequência' });
    const quem = await createUser(db, { email: 'seq@erp.teste', fullName: 'Seq' });
    await addMember(db, { tenantId: t, userId: quem, roleCode: 'tenant_admin' });
    const p = await criar('erp_products', { tenant_id: t, name: 'Item', price_cents: 100 });
    const e = await criar('crm_companies', { tenant_id: t, name: 'Cliente' });

    /* Um rascunho que nunca será confirmado. */
    await vendaPronta(t, e, p);

    const primeira = await vendaPronta(t, e, p);
    const segunda = await vendaPronta(t, e, p);

    await asUserCommitting(db, quem, () =>
      db.query('select * from public.erp_confirm_sale($1)', [primeira]),
    );
    await asUserCommitting(db, quem, () =>
      db.query('select * from public.erp_confirm_sale($1)', [segunda]),
    );

    assert.equal((await venda(primeira)).number, 1);
    assert.equal((await venda(segunda)).number, 2);
  });

  it('serviço não baixa estoque', async () => {
    // Sem o filtro por `track_stock`, "hora de consultoria" apareceria no
    // inventário com saldo negativo eterno.
    const v = await criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaA });
    await criar('erp_sale_items', {
      tenant_id: fx.tenantA,
      sale_id: v,
      product_id: fx.servicoA,
      quantity: 3,
      unit_price_cents: 20000,
    });

    await asUserCommitting(db, fx.adminA, () =>
      db.query('select * from public.erp_confirm_sale($1)', [v]),
    );

    assert.equal(await saldo(fx.tenantA, fx.servicoA), null, 'serviço criou saldo de estoque');
  });

  it('venda sem item não confirma', async () => {
    const v = await criar('erp_sales', { tenant_id: fx.tenantA, company_id: fx.empresaA });
    await assert.rejects(
      asUserCommitting(db, fx.adminA, () =>
        db.query('select * from public.erp_confirm_sale($1)', [v]),
      ),
      /sem itens/,
    );
  });

  it('confirmar duas vezes não duplica baixa nem recebimento', async () => {
    const v = await vendaPronta(fx.tenantA, fx.empresaA, fx.produtoA, 1);
    await asUserCommitting(db, fx.adminA, () =>
      db.query('select * from public.erp_confirm_sale($1)', [v]),
    );
    const saldoDepois = await saldo(fx.tenantA, fx.produtoA);

    await assert.rejects(
      asUserCommitting(db, fx.adminA, () =>
        db.query('select * from public.erp_confirm_sale($1)', [v]),
      ),
      /já saiu do rascunho/,
    );

    assert.equal(await saldo(fx.tenantA, fx.produtoA), saldoDepois);
    const { rows } = await db.query(
      'select count(*)::int as n from public.finance_entries where sale_id = $1',
      [v],
    );
    assert.equal(rows[0].n, 1);
  });

  it('não dá para confirmar venda de outro tenant', async () => {
    await assert.rejects(
      asUserCommitting(db, fx.adminA, () =>
        db.query('select * from public.erp_confirm_sale($1)', [fx.vendaB]),
      ),
      /não encontrada/,
    );
    assert.equal((await venda(fx.vendaB)).status, 'draft');
  });
});

/* ── 6. As duas configurações que ninguém consumia ─────────────────────── */

describe('as configurações do tenant passam a valer', () => {
  it('inventory.deduct_on_sale desligado não baixa estoque', async () => {
    const t = await createTenant(db, { slug: 'sem-baixa-erp', name: 'Sem Baixa' });
    const quem = await createUser(db, { email: 'sembaixa@erp.teste', fullName: 'Sem Baixa' });
    await addMember(db, { tenantId: t, userId: quem, roleCode: 'tenant_admin' });
    const p = await criar('erp_products', { tenant_id: t, name: 'Item', price_cents: 500 });
    const e = await criar('crm_companies', { tenant_id: t, name: 'Cliente' });
    await criar('erp_stock_movements', { tenant_id: t, product_id: p, kind: 'in', quantity: 50 });

    await configurar(t, 'inventory.deduct_on_sale', false);

    const v = await criar('erp_sales', { tenant_id: t, company_id: e });
    await criar('erp_sale_items', {
      tenant_id: t,
      sale_id: v,
      product_id: p,
      quantity: 5,
      unit_price_cents: 500,
    });

    await asUserCommitting(db, quem, () =>
      db.query('select * from public.erp_confirm_sale($1)', [v]),
    );

    assert.equal(await saldo(t, p), 50, 'baixou estoque com a configuração desligada');
  });

  it('erp.sales_requires_customer ligado recusa venda sem cliente', async () => {
    const v = await criar('erp_sales', { tenant_id: fx.tenantA });
    await criar('erp_sale_items', {
      tenant_id: fx.tenantA,
      sale_id: v,
      product_id: fx.produtoA,
      quantity: 1,
      unit_price_cents: 100,
    });

    await assert.rejects(
      asUserCommitting(db, fx.adminA, () =>
        db.query('select * from public.erp_confirm_sale($1)', [v]),
      ),
      /identificar quem comprou/,
    );
  });

  it('desligado, a venda de balcão passa', async () => {
    const t = await createTenant(db, { slug: 'balcao-erp', name: 'Balcão' });
    const quem = await createUser(db, { email: 'balcao@erp.teste', fullName: 'Balcão' });
    await addMember(db, { tenantId: t, userId: quem, roleCode: 'tenant_admin' });
    const p = await criar('erp_products', { tenant_id: t, name: 'Pão', price_cents: 100 });

    await configurar(t, 'erp.sales_requires_customer', false);

    const v = await criar('erp_sales', { tenant_id: t });
    await criar('erp_sale_items', {
      tenant_id: t,
      sale_id: v,
      product_id: p,
      quantity: 2,
      unit_price_cents: 100,
    });

    await asUserCommitting(db, quem, () =>
      db.query('select * from public.erp_confirm_sale($1)', [v]),
    );
    assert.equal((await venda(v)).status, 'confirmed');
  });
});
