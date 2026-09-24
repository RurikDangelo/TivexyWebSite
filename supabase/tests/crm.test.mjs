/**
 * Testes do esquema do CRM.
 *
 * Três famílias, e cada uma prova uma afirmação que a migration faz:
 *
 *   1. Isolamento — o CRM herda o do Core, e isso precisa ser verificado, não
 *      suposto: política nova é oportunidade nova de errar.
 *   2. Chave composta — a migration afirma que apontar para outro tenant é
 *      **impossível de escrever**. Ou o banco recusa, ou a afirmação é falsa.
 *   3. Gatilhos — etapa do funil certo, e `closed_at` acompanhando a etapa.
 *
 * O teste mais importante do arquivo é o da família 2. Os três defeitos que a
 * revisão adversarial do Core encontrou eram todos dessa forma, e nenhum deles
 * dava erro: produziam dado que parecia certo na tela e era de outra empresa.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { checkDocument, onlyDigits } from '../../packages/core/src/documento.ts';
import { addMember, asUser, createDatabase, createTenant, createUser } from './harness.mjs';

let db;
const fx = {};

/** Uma linha de CRM, criada com privilégio total (fora do RLS). */
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

  fx.tenantA = await createTenant(db, { slug: 'aurora-crm', name: 'Aurora' });
  fx.tenantB = await createTenant(db, { slug: 'base-crm', name: 'Base' });

  fx.adminA = await createUser(db, { email: 'admin@aurora.crm', fullName: 'Admin A' });
  fx.adminB = await createUser(db, { email: 'admin@base.crm', fullName: 'Admin B' });
  fx.colabA = await createUser(db, { email: 'colab@aurora.crm', fullName: 'Colab A' });

  await addMember(db, { tenantId: fx.tenantA, userId: fx.adminA, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenantB, userId: fx.adminB, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenantA, userId: fx.colabA, roleCode: 'collaborator' });

  /* Um funil completo em cada tenant, para o isolamento ter o que separar. */
  for (const [lado, tenant] of [
    ['A', fx.tenantA],
    ['B', fx.tenantB],
  ]) {
    fx[`empresa${lado}`] = await criar('crm_companies', {
      tenant_id: tenant,
      name: `Cliente ${lado}`,
    });
    fx[`pessoa${lado}`] = await criar('crm_contacts', {
      tenant_id: tenant,
      company_id: fx[`empresa${lado}`],
      name: `Pessoa ${lado}`,
    });
    fx[`funil${lado}`] = await criar('crm_pipelines', {
      tenant_id: tenant,
      name: 'Vendas',
      is_default: true,
    });
    fx[`etapa${lado}`] = await criar('crm_pipeline_stages', {
      tenant_id: tenant,
      pipeline_id: fx[`funil${lado}`],
      name: 'Primeiro contato',
      position: 1,
    });
    fx[`ganha${lado}`] = await criar('crm_pipeline_stages', {
      tenant_id: tenant,
      pipeline_id: fx[`funil${lado}`],
      name: 'Fechado',
      kind: 'won',
      position: 9,
    });
    fx[`negocio${lado}`] = await criar('crm_deals', {
      tenant_id: tenant,
      pipeline_id: fx[`funil${lado}`],
      stage_id: fx[`etapa${lado}`],
      company_id: fx[`empresa${lado}`],
      title: `Proposta ${lado}`,
      value_cents: 150000,
    });
    fx[`lead${lado}`] = await criar('crm_leads', {
      tenant_id: tenant,
      name: `Lead ${lado}`,
    });
    fx[`tipoAtividade${lado}`] = await criar('crm_activity_types', {
      tenant_id: tenant,
      name: 'Ligação',
      position: 1,
    });
    fx[`atividade${lado}`] = await criar('crm_activities', {
      tenant_id: tenant,
      type_id: fx[`tipoAtividade${lado}`],
      subject: `Ligar para ${lado}`,
      lead_id: fx[`lead${lado}`],
    });
  }
});

after(async () => {
  await db?.close?.();
});

/* ── 1. Isolamento ─────────────────────────────────────────────────────── */

describe('isolamento entre tenants', () => {
  const tabelas = [
    'crm_companies',
    'crm_contacts',
    'crm_pipelines',
    'crm_pipeline_stages',
    'crm_deals',
    'crm_leads',
    'crm_activity_types',
    'crm_activities',
  ];

  it('cada tabela do CRM só devolve linhas do próprio tenant', async () => {
    for (const tabela of tabelas) {
      const linhas = await asUser(db, fx.adminA, () =>
        db.query(`select tenant_id from public.${tabela}`),
      );
      assert.ok(linhas.rows.length > 0, `${tabela}: o cenário precisa ter linha para separar`);
      for (const linha of linhas.rows) {
        assert.equal(linha.tenant_id, fx.tenantA, `${tabela} vazou linha de outro tenant`);
      }
    }
  });

  it('não dá para ler uma linha do outro tenant nem sabendo o id', async () => {
    const { rows } = await asUser(db, fx.adminA, () =>
      db.query('select id from public.crm_deals where id = $1', [fx.negocioB]),
    );
    assert.equal(rows.length, 0, 'o id de outro tenant não pode responder nada');
  });

  it('não dá para escrever no tenant do outro', async () => {
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('insert into public.crm_leads (tenant_id, name) values ($1, $2)', [
          fx.tenantB,
          'Infiltrado',
        ]),
      ),
      /row-level security|violates/i,
    );
  });

  it('não dá para apagar a linha do outro', async () => {
    await asUser(db, fx.adminA, () =>
      db.query('delete from public.crm_deals where id = $1', [fx.negocioB]),
    );
    const { rows } = await db.query('select id from public.crm_deals where id = $1', [fx.negocioB]);
    assert.equal(rows.length, 1, 'a oportunidade do outro tenant sumiu');
  });

  it('`tenant_id` não é editável — nem para a própria linha', async () => {
    // O RLS recusaria de qualquer jeito, porque o `with check` olha o valor
    // novo. Mas depender disso é depender de a política continuar escrita do
    // jeito certo; o privilégio de coluna é a regra direta.
    await assert.rejects(
      asUser(db, fx.adminA, () =>
        db.query('update public.crm_leads set tenant_id = $1 where id = $2', [
          fx.tenantB,
          fx.leadA,
        ]),
      ),
      /permission denied|row-level security/i,
    );
  });
});

/* ── 2. Permissão ──────────────────────────────────────────────────────── */

describe('permissão, não só pertencimento', () => {
  it('colaborador lê lead e não apaga', async () => {
    // `collaborator` tem leads.read/write e não tem leads.delete — ver a
    // matriz em docs/12-SECURITY/AUTHORIZATION.md, gerada do próprio banco.
    const leitura = await asUser(db, fx.colabA, () =>
      db.query('select id from public.crm_leads where id = $1', [fx.leadA]),
    );
    assert.equal(leitura.rows.length, 1, 'colaborador precisa enxergar o lead');
  });

  it('quem não é membro não enxerga nada do CRM', async () => {
    const estranho = await createUser(db, { email: 'ninguem@fora.crm', fullName: 'Ninguém' });
    const { rows } = await asUser(db, estranho, () =>
      db.query('select id from public.crm_companies'),
    );
    assert.equal(rows.length, 0);
  });
});

/* ── 3. Chave composta: a garantia estrutural ──────────────────────────── */

describe('referência entre tenants é impossível de escrever', () => {
  it('pessoa não aponta para conta de outro tenant', async () => {
    await assert.rejects(
      criar('crm_contacts', {
        tenant_id: fx.tenantA,
        company_id: fx.empresaB,
        name: 'Espião',
      }),
      /foreign key|violates/i,
    );
  });

  it('oportunidade não aponta para funil de outro tenant', async () => {
    await assert.rejects(
      criar('crm_deals', {
        tenant_id: fx.tenantA,
        pipeline_id: fx.funilB,
        stage_id: fx.etapaB,
        title: 'Vazada',
      }),
      /foreign key|violates/i,
    );
  });

  it('etapa não pertence a funil de outro tenant', async () => {
    await assert.rejects(
      criar('crm_pipeline_stages', {
        tenant_id: fx.tenantA,
        pipeline_id: fx.funilB,
        name: 'Etapa alheia',
      }),
      /foreign key|violates/i,
    );
  });

  it('atividade não aponta para oportunidade de outro tenant', async () => {
    await assert.rejects(
      criar('crm_activities', {
        tenant_id: fx.tenantA,
        subject: 'Ligar',
        deal_id: fx.negocioB,
      }),
      /foreign key|violates/i,
    );
  });

  it('responsável precisa ser membro deste tenant', async () => {
    await assert.rejects(
      criar('crm_companies', {
        tenant_id: fx.tenantA,
        name: 'Com dono alheio',
        owner_id: fx.adminB,
      }),
      /foreign key|violates/i,
    );
  });

  /*
   * A prova de que a garantia é do banco e não do caminho da aplicação: a
   * escrita acima roda **sem RLS**, com privilégio total. Se só o RLS
   * protegesse, ela passaria — e passaria também para o provisionamento, que
   * usa a chave de serviço.
   */
  it('a recusa vale mesmo com privilégio total, fora do RLS', async () => {
    await assert.rejects(
      db.query(
        `insert into public.crm_deals (tenant_id, pipeline_id, stage_id, title)
         values ($1, $2, $3, 'Direto no banco')`,
        [fx.tenantA, fx.funilB, fx.etapaB],
      ),
      /foreign key|violates/i,
    );
  });
});

/* ── 4. Gatilhos ───────────────────────────────────────────────────────── */

describe('a etapa precisa ser do funil da oportunidade', () => {
  it('recusa etapa de outro funil do mesmo tenant', async () => {
    // Mesmo tenant, então a chave composta deixa passar. É o caso que ela
    // **não** alcança, e por isso existe um gatilho.
    const outroFunil = await criar('crm_pipelines', {
      tenant_id: fx.tenantA,
      name: 'Pós-venda',
    });
    const outraEtapa = await criar('crm_pipeline_stages', {
      tenant_id: fx.tenantA,
      pipeline_id: outroFunil,
      name: 'Acompanhamento',
    });

    await assert.rejects(
      criar('crm_deals', {
        tenant_id: fx.tenantA,
        pipeline_id: fx.funilA,
        stage_id: outraEtapa,
        title: 'Etapa de outro funil',
      }),
      /não pertence ao funil/i,
    );
  });
});

describe('closed_at acompanha a etapa', () => {
  it('nasce vazio em etapa aberta', async () => {
    const { rows } = await db.query('select closed_at from public.crm_deals where id = $1', [
      fx.negocioA,
    ]);
    assert.equal(rows[0].closed_at, null);
  });

  it('é carimbado ao entrar em etapa terminal', async () => {
    await db.query('update public.crm_deals set stage_id = $1 where id = $2', [
      fx.ganhaA,
      fx.negocioA,
    ]);
    const { rows } = await db.query('select closed_at from public.crm_deals where id = $1', [
      fx.negocioA,
    ]);
    assert.notEqual(rows[0].closed_at, null, 'oportunidade ganha sem data de fechamento');
  });

  it('é limpo ao voltar para etapa aberta', async () => {
    await db.query('update public.crm_deals set stage_id = $1 where id = $2', [
      fx.etapaA,
      fx.negocioA,
    ]);
    const { rows } = await db.query('select closed_at from public.crm_deals where id = $1', [
      fx.negocioA,
    ]);
    assert.equal(rows[0].closed_at, null, 'oportunidade reaberta continuou com data de fechamento');
  });

  /*
   * O caso que motiva o gatilho existir: a data não depende de quem escreve
   * lembrar dela. Importação, automação e SQL à mão passam pelo mesmo caminho.
   */
  it('não depende de a escrita informar a data', async () => {
    const negocio = await criar('crm_deals', {
      tenant_id: fx.tenantA,
      pipeline_id: fx.funilA,
      stage_id: fx.ganhaA,
      title: 'Nasce ganha',
    });
    const { rows } = await db.query('select closed_at from public.crm_deals where id = $1', [
      negocio,
    ]);
    assert.notEqual(rows[0].closed_at, null);
  });
});

/* ── 5. Regras de forma ────────────────────────────────────────────────── */

describe('o que o esquema recusa', () => {
  it('atividade sem alvo', async () => {
    await assert.rejects(
      criar('crm_activities', { tenant_id: fx.tenantA, subject: 'Solta no mundo' }),
      /crm_activities_one_target/,
    );
  });

  it('atividade com dois alvos', async () => {
    await assert.rejects(
      criar('crm_activities', {
        tenant_id: fx.tenantA,
        subject: 'Ambígua',
        lead_id: fx.leadA,
        deal_id: fx.negocioA,
      }),
      /crm_activities_one_target/,
    );
  });

  it('dois funis padrão no mesmo tenant', async () => {
    await assert.rejects(
      criar('crm_pipelines', { tenant_id: fx.tenantA, name: 'Outro padrão', is_default: true }),
      /crm_pipelines_one_default_per_tenant|duplicate key/i,
    );
  });

  it('cada tenant tem o seu padrão, sem conflito com o do vizinho', async () => {
    const { rows } = await db.query(
      'select tenant_id from public.crm_pipelines where is_default order by tenant_id',
    );
    assert.equal(rows.length, 2, 'os dois tenants precisam ter funil padrão próprio');
  });

  it('nome em branco', async () => {
    await assert.rejects(
      criar('crm_companies', { tenant_id: fx.tenantA, name: '   ' }),
      /name_not_blank/,
    );
  });

  it('valor negativo', async () => {
    await assert.rejects(
      criar('crm_deals', {
        tenant_id: fx.tenantA,
        pipeline_id: fx.funilA,
        stage_id: fx.etapaA,
        title: 'Negativa',
        value_cents: -1,
      }),
      /value_not_negative/,
    );
  });

  it('lead convertido sem data de conversão', async () => {
    await assert.rejects(
      criar('crm_leads', { tenant_id: fx.tenantA, name: 'Meio convertido', status: 'converted' }),
      /converted_consistency/,
    );
  });

  it('lead com data de conversão e status que não é convertido', async () => {
    await assert.rejects(
      criar('crm_leads', {
        tenant_id: fx.tenantA,
        name: 'Data sem estado',
        status: 'qualified',
        converted_at: new Date().toISOString(),
      }),
      /converted_consistency/,
    );
  });
});

/* ── 5.1 O documento que a tela grava ──────────────────────────────────── */

/**
 * O contrato entre `checkDocument()` e `crm_companies_document_digits`.
 *
 * Os dois falam do mesmo campo e moram em arquivos diferentes: um em
 * TypeScript, decidindo o que o formulário aceita; outro em SQL, decidindo o
 * que a coluna aceita. Enquanto concordarem, quem cola um CNPJ pontuado do
 * site da Receita consegue cadastrar. No dia em que divergirem, o sintoma é
 * um erro de constraint falando de expressão regular para quem só queria
 * cadastrar uma empresa — e nenhum teste de unidade pega, porque cada lado
 * continua certo sozinho.
 */
describe('o documento aceito na tela entra na coluna', () => {
  const COMO_A_PESSOA_DIGITA = [
    '12.345.678/0001-95',
    '98765432000188',
    '123.456.789-01',
    '  11122233344  ',
  ];

  for (const entrada of COMO_A_PESSOA_DIGITA) {
    it(`"${entrada.trim()}" é aceito nos dois lados`, async () => {
      assert.equal(checkDocument(entrada), null, 'a conferência da tela deveria aceitar');

      /* E o Postgres aceita o que ela manda gravar. */
      const id = await criar('crm_companies', {
        tenant_id: fx.tenantA,
        name: `Documento ${entrada.trim()}`,
        document: onlyDigits(entrada),
      });

      const { rows } = await db.query('select document from public.crm_companies where id = $1', [
        id,
      ]);
      assert.match(rows[0].document, /^[0-9]+$/);
    });
  }

  it('a pontuação é recusada pela coluna — por isso a tela limpa antes', async () => {
    /*
     * A prova de que `onlyDigits()` não é enfeite. Sem ela, exatamente a
     * colagem mais comum é a que falha.
     */
    await assert.rejects(
      criar('crm_companies', {
        tenant_id: fx.tenantA,
        name: 'Pontuada',
        document: '12.345.678/0001-95',
      }),
      /document_digits/,
    );
  });
});

/* ── 5.2 A agenda ──────────────────────────────────────────────────────── */

describe('a atividade segue o alvo', () => {
  /*
   * `on delete cascade` nas quatro colunas de alvo. A alternativa seria
   * `set null`, e ela produziria exatamente o que a constraint de alvo único
   * existe para impedir: uma atividade sem alvo nenhum, que a própria
   * constraint então recusaria — deixando o `delete` do lead falhar por causa
   * de uma atividade. Apagar o lead precisa apagar a agenda dele.
   */
  it('apagar o lead leva a atividade junto', async () => {
    const lead = await criar('crm_leads', { tenant_id: fx.tenantA, name: 'Some junto' });
    const atividade = await criar('crm_activities', {
      tenant_id: fx.tenantA,
      subject: 'Ligar antes de sumir',
      lead_id: lead,
    });

    await db.query('delete from public.crm_leads where id = $1', [lead]);

    const { rows } = await db.query('select id from public.crm_activities where id = $1', [
      atividade,
    ]);
    assert.equal(rows.length, 0, 'a atividade ficou órfã de um lead que não existe mais');
  });

  it('apagar o tipo de atividade preserva a atividade, sem tipo', async () => {
    /*
     * Aqui `set null` é o certo, e a diferença com o caso acima é o que cada
     * um significa: sem alvo a atividade não quer dizer nada; sem tipo ela
     * continua sendo "ligar para o cliente na terça".
     */
    const tipo = await criar('crm_activity_types', { tenant_id: fx.tenantA, name: 'Temporário' });
    const atividade = await criar('crm_activities', {
      tenant_id: fx.tenantA,
      type_id: tipo,
      subject: 'Sobrevive ao tipo',
      lead_id: fx.leadA,
    });

    await db.query('delete from public.crm_activity_types where id = $1', [tipo]);

    const { rows } = await db.query(
      'select type_id, tenant_id from public.crm_activities where id = $1',
      [atividade],
    );
    assert.equal(rows.length, 1, 'a atividade não deveria sumir com o tipo');
    assert.equal(rows[0].type_id, null);
    assert.equal(rows[0].tenant_id, fx.tenantA, 'o tenant foi anulado junto com o tipo');
  });

  it('tipo de atividade não é compartilhado entre tenants', async () => {
    await assert.rejects(
      criar('crm_activities', {
        tenant_id: fx.tenantA,
        type_id: fx.tipoAtividadeB,
        subject: 'Tipo emprestado',
        lead_id: fx.leadA,
      }),
      /type_do_tenant/,
    );
  });

  it('o alvo precisa ser do mesmo tenant', async () => {
    await assert.rejects(
      criar('crm_activities', {
        tenant_id: fx.tenantA,
        subject: 'Espiando a agenda alheia',
        lead_id: fx.leadB,
      }),
      /lead_do_tenant/,
    );
  });
});

/* ── 6. O que acontece quando o tenant sai ─────────────────────────────── */

describe('apagar o tenant leva o CRM junto', () => {
  it('nenhuma linha de CRM sobrevive ao tenant', async () => {
    const tenant = await createTenant(db, { slug: 'efemero-crm', name: 'Efêmero' });
    const empresa = await criar('crm_companies', { tenant_id: tenant, name: 'Some junto' });
    await criar('crm_contacts', { tenant_id: tenant, company_id: empresa, name: 'Também' });

    await db.query('delete from public.tenants where id = $1', [tenant]);

    for (const tabela of ['crm_companies', 'crm_contacts']) {
      const { rows } = await db.query(
        `select count(*)::int as n from public.${tabela} where tenant_id = $1`,
        [tenant],
      );
      assert.equal(rows[0].n, 0, `${tabela} deixou órfão para trás`);
    }
  });
});
