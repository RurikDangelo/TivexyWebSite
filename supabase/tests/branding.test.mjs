/**
 * Marca do cliente e módulos avulsos — contra o Postgres.
 *
 * As duas funções que 20260926010000 trouxe existem porque o painel
 * administrativo precisa entregar uma empresa com a cara do cliente e com os
 * módulos que foram vendidos — não com os que o nicho supôs.
 *
 * O que mais importa aqui: **desligar um módulo não apaga dado**. Se apagasse,
 * um clique errado do Super Admin destruiria o cadastro de um cliente, e
 * religar devolveria uma empresa vazia. O teste abaixo escreve, desliga,
 * religa e confere que o registro voltou inteiro.
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

const comoSuper = (fn) => asUserCommitting(db, fx.super, fn);

const marca = (args) =>
  comoSuper(() =>
    db.query('select public.admin_set_tenant_brand($1, $2, $3, $4) as r', [
      args.tenant ?? fx.t,
      args.cor ?? null,
      args.logo ?? null,
      args.limparLogo ?? false,
    ]),
  );

const modulo = (code, ligado, motivo = null) =>
  comoSuper(() =>
    db.query('select public.admin_set_tenant_module($1, $2, $3, $4) as r', [
      fx.t,
      code,
      ligado,
      motivo,
    ]),
  );

async function lerMarca(tenant = fx.t) {
  const { rows } = await db.query(
    'select brand_primary, brand_logo_path from public.tenants where id = $1',
    [tenant],
  );
  return rows[0];
}

async function moduloLigado(code) {
  const { rows } = await db.query(
    `select tm.is_enabled from public.tenant_modules tm
     join public.modules m on m.id = tm.module_id
     where tm.tenant_id = $1 and m.code = $2`,
    [fx.t, code],
  );
  return rows.length === 0 ? null : rows[0].is_enabled;
}

async function auditoria(acao) {
  const { rows } = await db.query(
    'select resource_id, metadata from public.audit_logs where action = $1 order by created_at',
    [acao],
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
  fx.t = await createTenant(db, { slug: 'marca-teste', name: 'Marca Teste', planCode: 'essencial' });
  await db.query(
    `insert into public.tenant_modules (tenant_id, module_id, is_enabled)
     select $1, m.id, true from public.modules m where m.code = any($2::text[])
     on conflict (tenant_id, module_id) do update set is_enabled = true`,
    [fx.t, ['core', 'crm']],
  );
  fx.super = await createUser(db, { email: 'super@marca.test', isSuperAdmin: true });
  fx.admin = await createUser(db, { email: 'admin@marca.test', fullName: 'Ana' });
  await addMember(db, { tenantId: fx.t, userId: fx.admin, roleCode: 'tenant_admin' });
});

describe('marca — quem pode', () => {
  it('só o Super Admin muda a marca', async () => {
    await assert.rejects(
      asUserCommitting(db, fx.admin, () =>
        db.query(`select public.admin_set_tenant_brand($1, '#ff0000')`, [fx.t]),
      ),
      /só o Super Admin/,
    );
    assert.deepEqual(await lerMarca(), { brand_primary: null, brand_logo_path: null });
  });

  /*
   * A função é `security definer`: ela roda com os poderes de quem a criou. Se
   * a checagem de Super Admin fosse a única barreira e alguém a removesse, a
   * coluna ainda teria que estar fora do alcance de um UPDATE direto. Este
   * teste prova a segunda barreira, não a primeira.
   */
  it('nem pela porta dos fundos: UPDATE direto na coluna é negado', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(`update public.tenants set brand_primary = '#ff0000' where id = $1`, [fx.t]),
      ),
      /permission denied|permissão negada/i,
    );
  });
});

describe('marca — a cor', () => {
  it('grava, e normaliza o que a pessoa digitou', async () => {
    await marca({ cor: '  #1648A6  ' });
    assert.equal((await lerMarca()).brand_primary, '#1648a6');
  });

  it('recusa o que não é hexadecimal de seis dígitos', async () => {
    for (const ruim of ['#fff', 'ff0000', 'rgb(255,0,0)', '#gggggg', '#1648a66']) {
      await assert.rejects(marca({ cor: ruim }), /cor inválida/, ruim);
    }
    assert.equal((await lerMarca()).brand_primary, null);
  });

  it('vazio volta para o azul da Tivexy', async () => {
    await marca({ cor: '#1648a6' });
    await marca({ cor: '   ' });
    assert.equal((await lerMarca()).brand_primary, null);
  });
});

describe('marca — o logo', () => {
  it('aceita caminho dentro da pasta da própria empresa', async () => {
    await marca({ logo: `${fx.t}/logo.png` });
    assert.equal((await lerMarca()).brand_logo_path, `${fx.t}/logo.png`);
  });

  /*
   * O caminho é o que a política do bucket usa para autorizar. Se uma empresa
   * pudesse apontar para a pasta de outra, o logo de um cliente apareceria no
   * sistema do concorrente — e a política do storage, que confere a pasta,
   * não seria consultada em momento nenhum.
   */
  it('recusa caminho na pasta de outra empresa', async () => {
    const outro = await createTenant(db, { slug: 'outra', name: 'Outra', planCode: 'essencial' });
    await assert.rejects(marca({ logo: `${outro}/roubado.png` }), /pasta da própria empresa/);
    assert.equal((await lerMarca()).brand_logo_path, null);
  });

  it('nulo em logo não apaga o que já estava — só p_clear_logo apaga', async () => {
    await marca({ logo: `${fx.t}/logo.png` });
    await marca({ cor: '#1648a6' });
    assert.equal(
      (await lerMarca()).brand_logo_path,
      `${fx.t}/logo.png`,
      'mudar só a cor não podia ter derrubado o logo',
    );

    await marca({ limparLogo: true });
    assert.equal((await lerMarca()).brand_logo_path, null);
  });
});

describe('marca — auditoria', () => {
  it('uma mudança, uma linha, com o antes e o depois', async () => {
    await marca({ cor: '#1648a6', logo: `${fx.t}/a.png` });
    await marca({ cor: '#c2352b', logo: `${fx.t}/b.png` });

    const linhas = await auditoria('tenant.brand_changed');
    assert.equal(linhas.length, 2);
    assert.deepEqual(linhas[1].metadata, {
      cor_de: '#1648a6',
      cor_para: '#c2352b',
      logo_de: `${fx.t}/a.png`,
      logo_para: `${fx.t}/b.png`,
    });
  });
});

describe('o balde do logo', () => {
  it('existe, é público para leitura e não aceita SVG', async () => {
    const { rows } = await db.query(
      `select public, file_size_limit, allowed_mime_types
       from storage.buckets where id = 'tenant-branding'`,
    );
    assert.equal(rows.length, 1, 'o balde tem que existir');
    assert.equal(rows[0].public, true);
    assert.equal(rows[0].file_size_limit, 524288);
    assert.ok(
      !rows[0].allowed_mime_types.includes('image/svg+xml'),
      'SVG é documento executável servido de origem pública: fica de fora',
    );
  });

  it('a RLS dos objetos está ligada — sem isso a política não vale nada', async () => {
    const { rows } = await db.query(
      `select relrowsecurity from pg_class
       where oid = 'storage.objects'::regclass`,
    );
    assert.equal(rows[0].relrowsecurity, true);
  });

  it('quem não é Super Admin não grava arquivo no balde', async () => {
    await assert.rejects(
      asUser(db, fx.admin, () =>
        db.query(
          `insert into storage.objects (bucket_id, name) values ('tenant-branding', $1)`,
          [`${fx.t}/logo.png`],
        ),
      ),
      /row-level security/,
    );
  });

  it('o Super Admin grava, e qualquer um lê — o logo aparece antes do login', async () => {
    await comoSuper(() =>
      db.query(`insert into storage.objects (bucket_id, name) values ('tenant-branding', $1)`, [
        `${fx.t}/logo.png`,
      ]),
    );
    const { rows } = await asUser(db, fx.admin, () =>
      db.query(`select name from storage.objects where bucket_id = 'tenant-branding'`),
    );
    assert.equal(rows.length, 1);
  });
});

describe('módulos avulsos', () => {
  it('só o Super Admin liga ou desliga', async () => {
    await assert.rejects(
      asUserCommitting(db, fx.admin, () =>
        db.query(`select public.admin_set_tenant_module($1, 'erp', true, null)`, [fx.t]),
      ),
      /só o Super Admin/,
    );
  });

  it('liga um módulo que o plano não deu', async () => {
    assert.equal(await moduloLigado('erp'), null, 'o teste começa sem ERP');
    await modulo('erp', true, 'Piloto de 30 dias');
    assert.equal(await moduloLigado('erp'), true);

    const [linha] = await auditoria('tenant.module_enabled');
    assert.equal(linha.resource_id, 'erp');
    assert.deepEqual(linha.metadata, { de: null, para: true, motivo: 'Piloto de 30 dias' });
  });

  it('desligar não apaga dado: religar devolve o que estava lá', async () => {
    await db.query(`insert into public.crm_leads (tenant_id, name) values ($1, 'Lia')`, [fx.t]);

    await modulo('crm', false, 'Cliente pediu para pausar');
    assert.equal(await moduloLigado('crm'), false);

    const { rows: aindaLa } = await db.query(
      'select name from public.crm_leads where tenant_id = $1',
      [fx.t],
    );
    assert.deepEqual(
      aindaLa.map((r) => r.name),
      ['Lia'],
      'desligar o módulo tirou o acesso, não o cadastro',
    );

    await modulo('crm', true);
    assert.equal(await moduloLigado('crm'), true);
    const { rows: devolvido } = await asUser(db, fx.admin, () =>
      db.query('select name from public.crm_leads where tenant_id = $1', [fx.t]),
    );
    assert.deepEqual(
      devolvido.map((r) => r.name),
      ['Lia'],
    );
  });

  it('recusa módulo que não existe', async () => {
    await assert.rejects(modulo('modulo_inventado', true), /módulo desconhecido/);
  });

  it('recusa ligar o que já está ligado, e desligar o que já está desligado', async () => {
    await assert.rejects(modulo('crm', true), /já está ligado/);
    await modulo('crm', false);
    await assert.rejects(modulo('crm', false), /já está desligado/);
  });

  /*
   * Mexer em módulo no meio do provisionamento é corrida com o próprio
   * provisionamento, que está ligando módulos pelo blueprint. O último a
   * escrever venceria, e qual dos dois seria o último é sorte.
   */
  it('recusa mexer em empresa que ainda está provisionando', async () => {
    await db.query(`update public.tenants set status = 'provisioning' where id = $1`, [fx.t]);
    await assert.rejects(modulo('erp', true), /em provisionamento/);
  });
});
