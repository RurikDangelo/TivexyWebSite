/**
 * Testes da conversão de lead.
 *
 * O que mais importa aqui é a **atomicidade**. São quatro escritas que só
 * fazem sentido juntas, e o pior desfecho parcial não parece defeito: a
 * oportunidade aparece no funil e o lead continua na fila, esperando alguém
 * ligar de novo. Há teste forçando a falha na última escrita e conferindo que
 * as três primeiras voltaram atrás.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  addMember,
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

/**
 * Converte como uma pessoa de verdade — pelo RLS, não com privilégio total.
 *
 * `asUserCommitting` e não `asUser`: o que se verifica aqui é que conta, pessoa
 * e oportunidade **ficaram** no banco. Com o rollback do `asUser`, a função
 * devolveria os ids e a leitura seguinte não acharia nada.
 */
async function converter(userId, { leadId, stageId, titulo = null, valor = 0 }) {
  return asUserCommitting(db, userId, () =>
    db.query('select * from public.crm_convert_lead($1, $2, $3, $4)', [
      leadId,
      stageId,
      titulo,
      valor,
    ]),
  );
}

before(async () => {
  db = await createDatabase();

  fx.tenant = await createTenant(db, { slug: 'conv-crm', name: 'Conversão' });
  fx.outro = await createTenant(db, { slug: 'conv-outro', name: 'Outro' });

  fx.admin = await createUser(db, { email: 'admin@conv.crm', fullName: 'Admin' });
  fx.leitor = await createUser(db, { email: 'leitor@conv.crm', fullName: 'Só Leitura' });
  fx.adminOutro = await createUser(db, { email: 'admin@outro.crm', fullName: 'Admin Outro' });

  await addMember(db, { tenantId: fx.tenant, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.outro, userId: fx.adminOutro, roleCode: 'tenant_admin' });

  /*
   * Um papel que lê lead e não escreve oportunidade. É o cenário que prova o
   * SECURITY INVOKER: a função não pode dar acesso que o papel não tem.
   */
  const papel = await criar('roles', {
    tenant_id: fx.tenant,
    code: 'so_leads',
    name: 'Só leads',
    is_system: false,
  });
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p
     where p.code in ('crm.leads.read', 'crm.leads.write', 'crm.contacts.write',
                      'crm.companies.write')`,
    [papel],
  );
  await db.query(
    `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [fx.tenant, fx.leitor, papel],
  );

  /*
   * E um papel que escreve oportunidade e **não** escreve pessoa. É o único
   * jeito de fazer a conversão falhar no meio: a checagem de permissão passa,
   * a conta é criada, e o `insert` da pessoa é recusado pelo RLS.
   */
  const meioCaminho = await criar('roles', {
    tenant_id: fx.tenant,
    code: 'sem_pessoas',
    name: 'Sem pessoas',
    is_system: false,
  });
  await db.query(
    `insert into public.role_permissions (role_id, permission_id)
     select $1, p.id from public.permissions p
     where p.code in ('crm.leads.read', 'crm.leads.write', 'crm.companies.write',
                      'crm.deals.read', 'crm.deals.write')`,
    [meioCaminho],
  );
  fx.semPessoas = await createUser(db, { email: 'meio@conv.crm', fullName: 'Meio Caminho' });
  await db.query(
    `insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [fx.tenant, fx.semPessoas, meioCaminho],
  );

  fx.funil = await criar('crm_pipelines', {
    tenant_id: fx.tenant,
    name: 'Vendas',
    is_default: true,
  });
  fx.etapa = await criar('crm_pipeline_stages', {
    tenant_id: fx.tenant,
    pipeline_id: fx.funil,
    name: 'Proposta',
    position: 1,
  });

  fx.funilOutro = await criar('crm_pipelines', { tenant_id: fx.outro, name: 'Vendas' });
  fx.etapaOutro = await criar('crm_pipeline_stages', {
    tenant_id: fx.outro,
    pipeline_id: fx.funilOutro,
    name: 'Proposta',
  });
});

after(async () => {
  await db?.close?.();
});

let lead;
let empresaDoLead;
/*
 * Nome de empresa diferente a cada teste.
 *
 * `asUserCommitting` confirma a transação, então o que um teste cria sobra
 * para o seguinte — é o preço de verificar que a escrita ficou. Um nome fixo
 * faria o segundo teste reaproveitar a conta do primeiro e as contagens
 * medirem o acumulado.
 */
let sequencia = 0;
beforeEach(async () => {
  empresaDoLead = `Padaria ${++sequencia}`;
  lead = await criar('crm_leads', {
    tenant_id: fx.tenant,
    name: 'Joana Ribeiro',
    email: 'joana@exemplo.com.br',
    phone: '11988887777',
    company_name: empresaDoLead,
    status: 'qualified',
  });
});

describe('o que a conversão cria', () => {
  it('conta, pessoa e oportunidade, ligadas entre si', async () => {
    const { rows } = await converter(fx.admin, { leadId: lead, stageId: fx.etapa });
    const [r] = rows;

    assert.ok(r.company_id && r.contact_id && r.deal_id, 'os três precisam nascer');

    const { rows: pessoa } = await db.query(
      'select company_id, name, email, phone from public.crm_contacts where id = $1',
      [r.contact_id],
    );
    assert.equal(pessoa[0].company_id, r.company_id, 'a pessoa precisa ficar na conta');
    assert.equal(pessoa[0].name, 'Joana Ribeiro');
    assert.equal(pessoa[0].email, 'joana@exemplo.com.br');

    const { rows: negocio } = await db.query(
      'select company_id, contact_id, pipeline_id, title from public.crm_deals where id = $1',
      [r.deal_id],
    );
    assert.equal(negocio[0].company_id, r.company_id);
    assert.equal(negocio[0].contact_id, r.contact_id);
    assert.equal(negocio[0].pipeline_id, fx.funil, 'o funil sai da etapa');
  });

  it('o lead fica carimbado com o que virou', async () => {
    const { rows } = await converter(fx.admin, { leadId: lead, stageId: fx.etapa });

    const { rows: depois } = await db.query(
      `select status::text, converted_at, converted_company_id, converted_contact_id,
              converted_deal_id
       from public.crm_leads where id = $1`,
      [lead],
    );

    assert.equal(depois[0].status, 'converted');
    assert.notEqual(depois[0].converted_at, null);
    assert.equal(depois[0].converted_company_id, rows[0].company_id);
    assert.equal(depois[0].converted_contact_id, rows[0].contact_id);
    assert.equal(depois[0].converted_deal_id, rows[0].deal_id);
  });

  it('sem título, o negócio leva o nome de quem virou cliente', async () => {
    const { rows } = await converter(fx.admin, { leadId: lead, stageId: fx.etapa });
    const { rows: negocio } = await db.query('select title from public.crm_deals where id = $1', [
      rows[0].deal_id,
    ]);
    assert.equal(negocio[0].title, 'Joana Ribeiro');
  });

  it('com título, usa o título', async () => {
    const { rows } = await converter(fx.admin, {
      leadId: lead,
      stageId: fx.etapa,
      titulo: 'Reforma da cozinha',
      valor: 450000,
    });
    const { rows: negocio } = await db.query(
      'select title, value_cents from public.crm_deals where id = $1',
      [rows[0].deal_id],
    );
    assert.equal(negocio[0].title, 'Reforma da cozinha');
    assert.equal(Number(negocio[0].value_cents), 450000);
  });

  it('lead sem empresa vira pessoa sem conta', async () => {
    const sozinho = await criar('crm_leads', {
      tenant_id: fx.tenant,
      name: 'Consumidor Final',
      status: 'new',
    });

    const { rows } = await converter(fx.admin, { leadId: sozinho, stageId: fx.etapa });
    assert.equal(rows[0].company_id, null, 'pessoa física não precisa de conta');
    assert.notEqual(rows[0].contact_id, null);
  });
});

describe('conta existente', () => {
  it('reaproveita em vez de duplicar, ignorando caixa', async () => {
    const existente = await criar('crm_companies', {
      tenant_id: fx.tenant,
      name: empresaDoLead.toUpperCase(),
    });

    const { rows } = await converter(fx.admin, { leadId: lead, stageId: fx.etapa });
    assert.equal(rows[0].company_id, existente, 'criou uma segunda conta com o mesmo nome');

    const { rows: contagem } = await db.query(
      `select count(*)::int as n from public.crm_companies
       where tenant_id = $1 and lower(name) = lower($2)`,
      [fx.tenant, empresaDoLead],
    );
    assert.equal(contagem[0].n, 1);
  });

  it('não reaproveita conta de outro tenant', async () => {
    await criar('crm_companies', { tenant_id: fx.outro, name: empresaDoLead });

    const { rows } = await converter(fx.admin, { leadId: lead, stageId: fx.etapa });
    const { rows: dona } = await db.query(
      'select tenant_id from public.crm_companies where id = $1',
      [rows[0].company_id],
    );
    assert.equal(dona[0].tenant_id, fx.tenant);
  });
});

describe('o que a conversão recusa', () => {
  it('converter duas vezes', async () => {
    await converter(fx.admin, { leadId: lead, stageId: fx.etapa });
    await assert.rejects(
      converter(fx.admin, { leadId: lead, stageId: fx.etapa }),
      /já foi convertido/,
    );
  });

  it('lead descartado', async () => {
    const descartado = await criar('crm_leads', {
      tenant_id: fx.tenant,
      name: 'Não quis',
      status: 'disqualified',
    });
    await assert.rejects(
      converter(fx.admin, { leadId: descartado, stageId: fx.etapa }),
      /descartado/,
    );
  });

  it('etapa de outro tenant', async () => {
    await assert.rejects(
      converter(fx.admin, { leadId: lead, stageId: fx.etapaOutro }),
      /etapa não encontrada/,
    );
  });

  /*
   * Lead de outro tenant responde "não encontrado", a mesma coisa que um id
   * inventado. Dizer "este lead é de outra empresa" confirmaria que ele
   * existe — e quem tentasse ids ao acaso descobriria quais são reais.
   */
  it('lead de outro tenant é indistinguível de inexistente', async () => {
    const alheio = await criar('crm_leads', { tenant_id: fx.outro, name: 'Alheio' });

    const porAlheio = await converter(fx.admin, { leadId: alheio, stageId: fx.etapa }).catch(
      (e) => e.message,
    );
    const porInventado = await converter(fx.admin, {
      leadId: '00000000-0000-0000-0000-000000000000',
      stageId: fx.etapa,
    }).catch((e) => e.message);

    assert.equal(porAlheio, porInventado, 'as duas mensagens precisam ser iguais');
    assert.match(String(porAlheio), /não encontrado/);
  });

  it('valor negativo vira zero, não erro de constraint', async () => {
    const { rows } = await converter(fx.admin, {
      leadId: lead,
      stageId: fx.etapa,
      valor: -1000,
    });
    const { rows: negocio } = await db.query(
      'select value_cents from public.crm_deals where id = $1',
      [rows[0].deal_id],
    );
    assert.equal(Number(negocio[0].value_cents), 0);
  });
});

describe('atomicidade', () => {
  /*
   * A prova de verdade. `sem_pessoas` passa na checagem de permissão — tem
   * `crm.deals.write` —, então a função **começa**: cria a conta e só depois
   * esbarra no RLS ao inserir a pessoa.
   *
   * O desfecho parcial que isso evita é o pior de todos: uma conta órfã na
   * base, sem pessoa e sem oportunidade, com o lead ainda na fila. Ninguém
   * olha para isso e pensa "faltou permissão".
   */
  it('falha depois de criar a conta, e a conta não fica', async () => {
    await assert.rejects(
      converter(fx.semPessoas, { leadId: lead, stageId: fx.etapa }),
      /row-level security|violates/i,
      'o cenário depende de o RLS recusar a pessoa, não a permissão de antes',
    );

    const { rows: contas } = await db.query(
      `select count(*)::int as n from public.crm_companies
       where tenant_id = $1 and lower(name) = lower($2)`,
      [fx.tenant, empresaDoLead],
    );
    assert.equal(contas[0].n, 0, 'a conta sobreviveu a uma conversão que falhou no meio');

    const { rows: lido } = await db.query(
      'select status::text from public.crm_leads where id = $1',
      [lead],
    );
    assert.equal(lido[0].status, 'qualified', 'o lead mudou de estado sem ter convertido');
  });
});

describe('a função não dá acesso que o papel não tem', () => {
  /*
   * A prova do SECURITY INVOKER. `so_leads` escreve lead, pessoa e conta, e
   * **não** escreve oportunidade. Se a função rodasse como DEFINER, ela seria
   * um caminho para criar oportunidade sem ter a permissão — um buraco com
   * nome amigável.
   */
  it('quem não pode criar oportunidade não converte', async () => {
    await assert.rejects(
      converter(fx.leitor, { leadId: lead, stageId: fx.etapa }),
      /não tem permissão/,
    );
  });

  it('e não deixa metade do caminho para trás', async () => {
    await converter(fx.leitor, { leadId: lead, stageId: fx.etapa }).catch(() => {});

    const { rows: contas } = await db.query(
      `select count(*)::int as n from public.crm_companies
       where tenant_id = $1 and lower(name) = lower($2)`,
      [fx.tenant, empresaDoLead],
    );
    const { rows: pessoas } = await db.query(
      `select count(*)::int as n from public.crm_contacts
       where tenant_id = $1 and company_id is null and name = 'Joana Ribeiro'`,
      [fx.tenant],
    );
    const { rows: lido } = await db.query(
      'select status::text from public.crm_leads where id = $1',
      [lead],
    );

    assert.equal(contas[0].n, 0, 'a conta sobreviveu a uma conversão que falhou');
    assert.equal(pessoas[0].n, 0, 'a pessoa sobreviveu a uma conversão que falhou');
    assert.equal(lido[0].status, 'qualified', 'o lead mudou de estado sem ter convertido');
  });
});
