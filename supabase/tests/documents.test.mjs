/**
 * CPF e CNPJ no banco — inclusive o CNPJ com letra.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createDatabase, createTenant } from './harness.mjs';

let db;
const fx = {};

before(async () => {
  db = await createDatabase();
  fx.a = await createTenant(db, { slug: 'doc-a', name: 'A' });
  fx.b = await createTenant(db, { slug: 'doc-b', name: 'B' });
});

const inserir = (tabela, tenant, documento) =>
  db.query(
    `insert into public.${tabela} (tenant_id, name, document) values ($1, 'X', $2) returning id`,
    [tenant, documento],
  );

describe('o CNPJ alfanumérico entra', () => {
  it('na conta do CRM', async () => {
    await inserir('crm_companies', fx.a, '12ABC34501DE35');
  });

  it('no próprio tenant', async () => {
    await db.query(`update public.tenants set document = '12ABC34501DE35' where id = $1`, [fx.b]);
  });

  it('e o numérico de sempre continua entrando', async () => {
    await inserir('crm_companies', fx.a, '11222333000181');
  });
});

describe('a pessoa tem documento', () => {
  it('CPF sem pontuação', async () => {
    await inserir('crm_contacts', fx.a, '52998224725');
  });

  it('com pontuação, minúscula ou tamanho errado é recusado', async () => {
    for (const torto of ['529.982.247-25', '12abc34501de35', '1234', '12ABC34501DEXX']) {
      await assert.rejects(inserir('crm_contacts', fx.b, torto), /document_format/, torto);
    }
  });
});

describe('um documento, um cadastro — por tenant', () => {
  it('o mesmo CPF duas vezes no mesmo tenant é a mesma pessoa duas vezes', async () => {
    await inserir('crm_contacts', fx.b, '39053344705');
    await assert.rejects(
      inserir('crm_contacts', fx.b, '39053344705'),
      /document_per_tenant|duplicate/,
    );
  });

  it('em tenants diferentes, é normal — cada um tem a sua base', async () => {
    await inserir('crm_contacts', fx.a, '39053344705');
  });

  it('o mesmo CNPJ em duas contas do mesmo tenant também é recusado', async () => {
    await assert.rejects(
      inserir('crm_companies', fx.a, '12ABC34501DE35'),
      /document_per_tenant|duplicate/,
    );
  });
});
