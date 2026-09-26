/**
 * Excluir no CRM exige a permissão de excluir.
 *
 * O catálogo sempre teve `crm.*.delete`, e o papel de Colaborador sempre foi
 * desenhado sem ela. Nada cobrava: a política de escrita era `for all` com
 * `.write`, e `for all` inclui `delete`. Estes testes cobram as quatro tabelas
 * que têm permissão de exclusão própria, nos dois sentidos — quem não pode não
 * apaga, e quem pode continua apagando. Separar a política em três não pode
 * ter quebrado o inserir e o atualizar, e há teste para isso também.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { addMember, asUser, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
const fx = {};

async function criar(tabela, valores) {
  const colunas = Object.keys(valores);
  const params = colunas.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query(
    `insert into public.${tabela} (${colunas.join(', ')}) values (${params.join(', ')}) returning id`,
    Object.values(valores),
  );
  return rows[0].id;
}

/** Tenta apagar como `userId` e devolve quantas linhas saíram. Desfaz no fim. */
const apagar = (userId, tabela, id) =>
  asUser(db, userId, async () => {
    const { rows } = await db.query(`delete from public.${tabela} where id = $1 returning id`, [
      id,
    ]);
    return rows.length;
  });

before(async () => {
  db = await createDatabase();

  fx.tenant = await createTenant(db, { slug: 'apaga-crm', name: 'Apaga' });
  fx.admin = await createUser(db, { email: 'admin@apaga.crm', fullName: 'Admin' });
  fx.colab = await createUser(db, { email: 'colab@apaga.crm', fullName: 'Colab' });
  fx.gestor = await createUser(db, { email: 'gestor@apaga.crm', fullName: 'Gestor' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.colab, roleCode: 'collaborator' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.gestor, roleCode: 'manager' });

  const funil = await criar('crm_pipelines', { tenant_id: fx.tenant, name: 'Vendas' });
  const etapa = await criar('crm_pipeline_stages', {
    tenant_id: fx.tenant,
    pipeline_id: funil,
    name: 'Contato',
  });

  fx.linhas = {
    crm_leads: await criar('crm_leads', { tenant_id: fx.tenant, name: 'Lead' }),
    crm_contacts: await criar('crm_contacts', { tenant_id: fx.tenant, name: 'Pessoa' }),
    crm_companies: await criar('crm_companies', { tenant_id: fx.tenant, name: 'Conta' }),
    crm_deals: await criar('crm_deals', {
      tenant_id: fx.tenant,
      pipeline_id: funil,
      stage_id: etapa,
      title: 'Negócio',
    }),
  };
  fx.coluna = {
    crm_leads: 'name',
    crm_contacts: 'name',
    crm_companies: 'name',
    crm_deals: 'title',
  };
});

describe('excluir exige `.delete`, não `.write`', () => {
  for (const tabela of ['crm_leads', 'crm_contacts', 'crm_companies', 'crm_deals']) {
    it(`${tabela}: colaborador não apaga`, async () => {
      assert.equal(await apagar(fx.colab, tabela, fx.linhas[tabela]), 0);
    });

    it(`${tabela}: administrador apaga`, async () => {
      assert.equal(await apagar(fx.admin, tabela, fx.linhas[tabela]), 1);
    });

    it(`${tabela}: gestor apaga — o papel dele inclui excluir`, async () => {
      assert.equal(await apagar(fx.gestor, tabela, fx.linhas[tabela]), 1);
    });
  }
});

describe('separar a política não quebrou o resto', () => {
  it('colaborador continua cadastrando e editando o que o papel dele permite', async () => {
    /* Contas o colaborador só lê — ver o catálogo. As outras três ele escreve. */
    for (const tabela of ['crm_leads', 'crm_contacts', 'crm_deals']) {
      const coluna = fx.coluna[tabela];
      const editadas = await asUser(db, fx.colab, async () => {
        const { rows } = await db.query(
          `update public.${tabela} set ${coluna} = ${coluna} || ' (editado)' where id = $1 returning id`,
          [fx.linhas[tabela]],
        );
        return rows.length;
      });
      assert.equal(editadas, 1, `${tabela}: o colaborador perdeu a edição`);
    }

    const cadastrou = await asUser(db, fx.colab, async () => {
      const { rows } = await db.query(
        'insert into public.crm_leads (tenant_id, name) values ($1, $2) returning id',
        [fx.tenant, 'Novo'],
      );
      return rows.length;
    });
    assert.equal(cadastrou, 1);
  });

  it('colaborador continua sem editar conta — o papel dele só lê', async () => {
    const editadas = await asUser(db, fx.colab, async () => {
      const { rows } = await db.query(
        `update public.crm_companies set name = 'X' where id = $1 returning id`,
        [fx.linhas.crm_companies],
      );
      return rows.length;
    });
    assert.equal(editadas, 0);
  });

  it('quem só tem `.delete` apaga e não edita — as duas permissões são independentes', async () => {
    const papel = await criar('roles', {
      tenant_id: fx.tenant,
      code: 'so_apaga',
      name: 'Só apaga',
      is_system: false,
    });
    await db.query(
      `insert into public.role_permissions (role_id, permission_id)
       select $1, id from public.permissions where code in ('crm.leads.read', 'crm.leads.delete')`,
      [papel],
    );
    const pessoa = await createUser(db, { email: 'apaga@apaga.crm', fullName: 'Só Apaga' });
    await db.query(
      `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
       values ($1, $2, $3, 'active', now())`,
      [fx.tenant, pessoa, papel],
    );

    const editadas = await asUser(db, pessoa, async () => {
      const { rows } = await db.query(
        `update public.crm_leads set name = 'X' where id = $1 returning id`,
        [fx.linhas.crm_leads],
      );
      return rows.length;
    });
    assert.equal(editadas, 0);
    assert.equal(await apagar(pessoa, 'crm_leads', fx.linhas.crm_leads), 1);
  });
});
