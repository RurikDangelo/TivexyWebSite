/**
 * O funil editável: o que a edição não pode estragar.
 *
 * Mudar o tipo de uma etapa com oportunidades dentro deixaria negócio ganho
 * sem data de fechamento — sem erro, só relatório errado. Trocar o padrão em
 * duas chamadas deixaria o tenant sem padrão numa queda de rede. Os dois têm
 * teste aqui.
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
  const params = colunas.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query(
    `insert into public.${tabela} (${colunas.join(', ')}) values (${params.join(', ')}) returning id`,
    Object.values(valores),
  );
  return rows[0].id;
}

before(async () => {
  db = await createDatabase();

  fx.tenant = await createTenant(db, { slug: 'funil-crm', name: 'Funil' });
  fx.outro = await createTenant(db, { slug: 'funil-outro', name: 'Outro' });
  fx.admin = await createUser(db, { email: 'admin@funil.crm', fullName: 'Admin' });
  fx.leitor = await createUser(db, { email: 'leitor@funil.crm', fullName: 'Leitor' });
  fx.adminOutro = await createUser(db, { email: 'admin@outro.crm', fullName: 'Admin Outro' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.outro, userId: fx.adminOutro, roleCode: 'tenant_admin' });

  /* Lê oportunidade e não escreve: o papel que prova a checagem de permissão. */
  const papel = await criar('roles', {
    tenant_id: fx.tenant,
    code: 'so_le',
    name: 'Só lê',
    is_system: false,
  });
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, id from public.permissions where code = 'crm.deals.read'`,
    [papel],
  );
  await db.query(
    `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [fx.tenant, fx.leitor, papel],
  );

  fx.vendas = await criar('crm_pipelines', {
    tenant_id: fx.tenant,
    name: 'Vendas',
    is_default: true,
  });
  fx.parcerias = await criar('crm_pipelines', { tenant_id: fx.tenant, name: 'Parcerias' });
  fx.funilOutro = await criar('crm_pipelines', { tenant_id: fx.outro, name: 'Do outro' });

  fx.cheia = await criar('crm_pipeline_stages', {
    tenant_id: fx.tenant,
    pipeline_id: fx.vendas,
    name: 'Proposta',
  });
  fx.vazia = await criar('crm_pipeline_stages', {
    tenant_id: fx.tenant,
    pipeline_id: fx.vendas,
    name: 'Negociação',
  });
  await criar('crm_deals', {
    tenant_id: fx.tenant,
    pipeline_id: fx.vendas,
    stage_id: fx.cheia,
    title: 'Negócio aberto',
  });
});

const padroes = async (tenant) => {
  const { rows } = await db.query(
    'select id from public.crm_pipelines where tenant_id = $1 and is_default',
    [tenant],
  );
  return rows.map((r) => r.id);
};

describe('etapa com oportunidades não muda de natureza', () => {
  it('mudar o tipo é recusado — as oportunidades ficariam ganhas sem data', async () => {
    await assert.rejects(
      db.query(`update public.crm_pipeline_stages set kind = 'won' where id = $1`, [fx.cheia]),
      /ainda tem oportunidades/,
    );
  });

  it('a recusa fala o vocabulário do tenant — a mensagem chega na tela', async () => {
    await db.exec('begin');
    try {
      await db.query(
        `update public.tenants
         set terms = '{"crm.deals": {"singular": "tratamento", "plural": "tratamentos"}}'::jsonb
         where id = $1`,
        [fx.tenant],
      );
      await assert.rejects(
        db.query(`update public.crm_pipeline_stages set kind = 'won' where id = $1`, [fx.cheia]),
        /ainda tem tratamentos/,
      );
    } finally {
      await db.exec('rollback');
    }
  });

  it('mudar de funil é recusado — a oportunidade ficaria em dois funis', async () => {
    await assert.rejects(
      db.query('update public.crm_pipeline_stages set pipeline_id = $1 where id = $2', [
        fx.parcerias,
        fx.cheia,
      ]),
      /ainda tem oportunidades/,
    );
  });

  it('etapa vazia muda de tipo à vontade', async () => {
    await db.exec('begin');
    try {
      await db.query(`update public.crm_pipeline_stages set kind = 'lost' where id = $1`, [
        fx.vazia,
      ]);
    } finally {
      await db.exec('rollback');
    }
  });

  it('renomear e reordenar continuam livres, com ou sem oportunidades', async () => {
    await db.exec('begin');
    try {
      await db.query(
        `update public.crm_pipeline_stages set name = 'Proposta enviada', position = 9
         where id = $1`,
        [fx.cheia],
      );
    } finally {
      await db.exec('rollback');
    }
  });
});

describe('crm_set_default_pipeline', () => {
  it('troca o padrão, e continua havendo exatamente um', async () => {
    await asUserCommitting(db, fx.admin, () =>
      db.query('select public.crm_set_default_pipeline($1)', [fx.parcerias]),
    );
    assert.deepEqual(await padroes(fx.tenant), [fx.parcerias]);

    await asUserCommitting(db, fx.admin, () =>
      db.query('select public.crm_set_default_pipeline($1)', [fx.vendas]),
    );
    assert.deepEqual(await padroes(fx.tenant), [fx.vendas]);
  });

  it('quem só lê recebe a recusa, não um sucesso que não mudou nada', async () => {
    await assert.rejects(
      asUser(db, fx.leitor, () =>
        db.query('select public.crm_set_default_pipeline($1)', [fx.parcerias]),
      ),
      /permissão/,
    );
    assert.deepEqual(await padroes(fx.tenant), [fx.vendas]);
  });

  it('o funil de outro tenant não existe para quem pergunta', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query('select public.crm_set_default_pipeline($1)', [fx.funilOutro]),
      ),
      /funil não encontrado/,
    );
  });
});

describe('crm_create_pipeline', () => {
  const criarFunil = (userId, tenant, nome) =>
    asUserCommitting(db, userId, async () => {
      const { rows } = await db.query('select public.crm_create_pipeline($1, $2) as id', [
        tenant,
        nome,
      ]);
      return rows[0].id;
    });

  it('o funil nasce com por onde sair — ganho e perda', async () => {
    const id = await criarFunil(fx.admin, fx.tenant, 'Recompra');
    const { rows } = await db.query(
      'select kind from public.crm_pipeline_stages where pipeline_id = $1 order by position',
      [id],
    );
    assert.deepEqual(
      rows.map((r) => r.kind),
      ['won', 'lost'],
    );
  });

  it('não vira padrão quando o tenant já tem um', async () => {
    const id = await criarFunil(fx.admin, fx.tenant, 'Indicações');
    const { rows } = await db.query('select is_default from public.crm_pipelines where id = $1', [
      id,
    ]);
    assert.equal(rows[0].is_default, false);
  });

  it('o primeiro funil do tenant nasce padrão', async () => {
    const id = await criarFunil(fx.adminOutro, fx.outro, 'Primeiro');
    /* `fx.funilOutro` foi criado fora da função e sem padrão; este é o primeiro padrão. */
    assert.deepEqual(await padroes(fx.outro), [id]);
  });

  it('não cria no tenant de outra pessoa — o RLS da inserção vale dentro da função', async () => {
    await assert.rejects(criarFunil(fx.admin, fx.outro, 'Invasão'), /row-level security|violates/i);
  });

  it('quem só lê não cria', async () => {
    await assert.rejects(criarFunil(fx.leitor, fx.tenant, 'Não'), /row-level security|violates/i);
  });

  it('nome em branco é recusado com frase, não com constraint', async () => {
    await assert.rejects(criarFunil(fx.admin, fx.tenant, '   '), /precisa de um nome/);
  });
});

describe('crm_stage_counts', () => {
  const contar = (userId, tenant) =>
    asUser(db, userId, async () => {
      const { rows } = await db.query('select * from public.crm_stage_counts($1)', [tenant]);
      return new Map(rows.map((r) => [r.stage_id, Number(r.deals)]));
    });

  it('conta as oportunidades de cada etapa', async () => {
    const contagem = await contar(fx.admin, fx.tenant);
    assert.equal(contagem.get(fx.cheia), 1);
    assert.equal(contagem.has(fx.vazia), false);
  });

  it('não conta o que o RLS esconde — o outro tenant vê zero', async () => {
    const contagem = await contar(fx.adminOutro, fx.tenant);
    assert.equal(contagem.size, 0);
  });
});
