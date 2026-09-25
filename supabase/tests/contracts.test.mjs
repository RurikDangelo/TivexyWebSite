/**
 * Contratos TypeScript × catálogo SQL.
 *
 * `@tivexy/core` declara em TypeScript os mesmos códigos que as migrations
 * declaram em SQL. Duplicação é dívida; este arquivo é o pagamento.
 *
 * A comparação é nos DOIS sentidos de propósito. Conferir só um lado deixa
 * passar o caso mais provável: alguém adiciona a permissão na migration e
 * esquece do TypeScript, e a aplicação nunca consegue verificá-la.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBlueprint } from '../../packages/core/src/blueprint.ts';
import {
  CRM_LEAD_STATUSES,
  CRM_STAGE_KINDS,
  DOCUMENT_PATTERN,
  ERP_SALE_STATUSES,
  FINANCE_DIRECTIONS,
  INVENTORY_MOVEMENT_KINDS,
  MEMBERSHIP_STATUSES,
  MODULE_CODES,
  PERMISSION_CODES,
  PLAN_CODES,
  PRODUCT_UNITS,
  PROVISIONING_STATUSES,
  PROVISIONING_STEP_STATUSES,
  SYSTEM_ROLE_CODES,
  TENANT_SETTINGS,
  TENANT_STATUSES,
  UNIT_INFO,
  isActive,
  isTerminal,
  lineTotalCents,
  moduleOf,
} from '../../packages/core/src/index.ts';
import { planProvisioning } from '../../packages/core/src/provisioning-plan.ts';
import { permissionMatrix, permissionRows } from '../../scripts/permission-matrix.mjs';
import { createDatabase } from './harness.mjs';

/** O caminho do documento que carrega a matriz copiada à mão. */
const AUTHORIZATION_MD = fileURLToPath(
  new URL('../../docs/12-SECURITY/AUTHORIZATION.md', import.meta.url),
);

let db;

before(async () => {
  db = await createDatabase();
});

after(async () => {
  await db?.close();
});

/** Compara dois conjuntos e diz exatamente o que sobra de cada lado. */
function assertSameSet(doTypeScript, doBanco, rotulo) {
  const ts = new Set(doTypeScript);
  const sql = new Set(doBanco);
  const soNoTs = [...ts].filter((v) => !sql.has(v)).sort();
  const soNoSql = [...sql].filter((v) => !ts.has(v)).sort();

  assert.deepEqual(
    { soNoTs, soNoSql },
    { soNoTs: [], soNoSql: [] },
    `${rotulo}: TypeScript e SQL divergiram`,
  );
}

async function codes(sql) {
  const { rows } = await db.query(sql);
  return rows.map((r) => r.code);
}

async function enumLabels(typeName) {
  const { rows } = await db.query(
    `select e.enumlabel as code
     from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = $1
     order by e.enumsortorder`,
    [typeName],
  );
  return rows.map((r) => r.code);
}

describe('catálogo: TypeScript espelha o SQL', () => {
  it('módulos', async () => {
    assertSameSet(MODULE_CODES, await codes('select code from public.modules'), 'módulos');
  });

  it('permissões', async () => {
    assertSameSet(
      PERMISSION_CODES,
      await codes('select code from public.permissions'),
      'permissões',
    );
  });

  it('papéis de sistema', async () => {
    assertSameSet(
      SYSTEM_ROLE_CODES,
      await codes('select code from public.roles where tenant_id is null'),
      'papéis de sistema',
    );
  });

  it('planos', async () => {
    assertSameSet(PLAN_CODES, await codes('select code from public.plans'), 'planos');
  });
});

describe('enums: TypeScript espelha o SQL', () => {
  it('tenant_status', async () => {
    assert.deepEqual([...TENANT_STATUSES], await enumLabels('tenant_status'));
  });

  it('membership_status', async () => {
    assert.deepEqual([...MEMBERSHIP_STATUSES], await enumLabels('membership_status'));
  });

  it('provisioning_status', async () => {
    assert.deepEqual([...PROVISIONING_STATUSES], await enumLabels('provisioning_status'));
  });

  it('provisioning_step_status', async () => {
    assert.deepEqual([...PROVISIONING_STEP_STATUSES], await enumLabels('provisioning_step_status'));
  });

  it('situação de etapa do funil', async () => {
    assert.deepEqual([...CRM_STAGE_KINDS], await enumLabels('crm_stage_kind'));
  });

  it('ciclo do lead', async () => {
    assert.deepEqual([...CRM_LEAD_STATUSES], await enumLabels('crm_lead_status'));
  });

  it('movimentação de estoque', async () => {
    assert.deepEqual([...INVENTORY_MOVEMENT_KINDS], await enumLabels('inventory_movement_kind'));
  });

  it('situação da venda', async () => {
    assert.deepEqual([...ERP_SALE_STATUSES], await enumLabels('erp_sale_status'));
  });

  it('direção do lançamento', async () => {
    assert.deepEqual([...FINANCE_DIRECTIONS], await enumLabels('finance_direction'));
  });
});

describe('coerência interna', () => {
  it('toda permissão pertence a um módulo declarado', () => {
    const modulos = new Set(MODULE_CODES);
    const orfas = PERMISSION_CODES.filter((p) => !modulos.has(moduleOf(p)));
    assert.deepEqual(orfas, []);
  });

  it('o módulo lido do código bate com o módulo gravado no banco', async () => {
    const { rows } = await db.query(`
      select p.code, m.code as modulo
      from public.permissions p
      join public.modules m on m.id = p.module_id
    `);
    const divergentes = rows
      .filter((r) => moduleOf(r.code) !== r.modulo)
      .map((r) => `${r.code} -> ${r.modulo}`);
    assert.deepEqual(divergentes, []);
  });

  it('não há código repetido', () => {
    for (const [rotulo, lista] of [
      ['módulos', MODULE_CODES],
      ['permissões', PERMISSION_CODES],
      ['papéis', SYSTEM_ROLE_CODES],
      ['planos', PLAN_CODES],
    ]) {
      assert.equal(new Set(lista).size, lista.length, `${rotulo}: há código duplicado`);
    }
  });
});

describe('provisionamento — o que o TypeScript acha que está vivo', () => {
  /**
   * `isActive()` responde "esta execução ainda ocupa o tenant?". O banco
   * responde a mesma pergunta pelo índice parcial
   * `provisioning_runs_one_active_per_tenant`.
   *
   * Se os dois discordarem, a aplicação diz "pode começar outra execução" e o
   * banco recusa com violação de unicidade — erro que chega ao usuário como
   * falha genérica, no pior momento possível. É duplicação de regra, e
   * duplicação de regra se confere.
   */
  it('isActive concorda com o índice parcial do banco', async () => {
    const { rows } = await db.query(`
      select pg_get_expr(i.indpred, i.indrelid) as predicado
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      where c.relname = 'provisioning_runs_one_active_per_tenant'
    `);
    assert.equal(rows.length, 1, 'o índice parcial precisa existir');

    const noBanco = [...rows[0].predicado.matchAll(/'([a-z]+)'::/g)].map((m) => m[1]).sort();
    const noTypeScript = PROVISIONING_STATUSES.filter(isActive).sort();

    assertSameSet(noTypeScript, noBanco, 'estados que ocupam o tenant');
  });

  /**
   * A constraint exige `finished_at` exatamente nos estados terminais. Se o
   * TypeScript achar que `compensating` é terminal, a aplicação grava a data
   * de fim e o banco recusa — foi assim que a retomada quebrou.
   */
  it('isTerminal concorda com a constraint de data de fim', async () => {
    const { rows } = await db.query(`
      select pg_get_constraintdef(oid) as definicao
      from pg_constraint
      where conname = 'provisioning_runs_finished_consistency'
    `);
    assert.equal(rows.length, 1, 'a constraint precisa existir');

    const noBanco = [...rows[0].definicao.matchAll(/'([a-z]+)'::/g)].map((m) => m[1]).sort();
    const noTypeScript = PROVISIONING_STATUSES.filter(isTerminal).sort();

    assertSameSet(noTypeScript, noBanco, 'estados terminais');
  });
});

describe('o subdomínio: TypeScript × constraint', () => {
  /**
   * `planProvisioning` valida o slug antes de escrever, e o banco valida de
   * novo em `tenants_slug_format`. Duplicação deliberada: sem a primeira, um
   * endereço inválido só é recusado depois de meia dúzia de operações, e chega
   * ao Super Admin como violação de constraint — que não diz o que fazer.
   *
   * A propriedade que importa **não** é "os dois aceitam as mesmas entradas".
   * O Core normaliza antes de validar: `CAFE` vira `cafe`, e é `cafe` que chega
   * ao banco. Comparar as entradas cruas acusaria divergência onde há
   * normalização.
   *
   * O que precisa valer é:
   *
   * > O Core nunca produz um slug que o banco recusaria.
   *
   * Ser mais rígido que o banco é aceitável — é só uma recusa mais cedo, com
   * mensagem melhor. Ser mais frouxo é o que produz violação de constraint no
   * meio do provisionamento, com o tenant já criado.
   *
   * A comparação é de **comportamento**: extrai a expressão real da constraint
   * e pergunta ao Postgres. Comparar o texto das duas expressões falharia por
   * diferença de escrita sem que nada estivesse errado.
   */
  const candidatos = [
    'cafe-do-centro',
    'ab',
    'a1',
    'x'.repeat(63),
    'a',
    '-cafe',
    'cafe-',
    'café',
    'cafe_do_centro',
    'cafe do centro',
    'CAFE',
    '',
    'x'.repeat(64),
  ];

  const blueprintMinimo = {
    code: 'teste',
    name: 'Teste',
    description: 'Para o teste de slug.',
    version: 1,
    plan: 'essencial',
    modules: ['core'],
    terms: {},
    roles: [],
    seeds: [],
    settings: {},
  };

  /** O slug que o Core gravaria, ou `null` se ele recusar a entrada. */
  function slugQueOCoreGrava(entrada) {
    const bp = checkBlueprint(blueprintMinimo);
    assert.equal(bp.valid, true);
    const plano = planProvisioning({
      blueprint: bp.blueprint,
      planModules: ['core'],
      slug: entrada,
      name: 'Teste',
      admin: { email: 'a@b.com', fullName: 'A' },
    });
    if (!plano.ok) return null;
    const criar = plano.operations.find((o) => o.kind === 'create_tenant');
    return criar.slug;
  }

  it('nunca produz um endereço que o banco recusaria', async () => {
    const { rows } = await db.query(`
      select pg_get_constraintdef(oid) as formato
      from pg_constraint where conname = 'tenants_slug_format'
    `);
    assert.equal(rows.length, 1, 'a constraint precisa existir');

    const expressao = /~ '([^']+)'/.exec(rows[0].formato)?.[1];
    assert.ok(expressao, `não consegui extrair a expressão de: ${rows[0].formato}`);

    const escapariam = [];
    for (const entrada of candidatos) {
      const gravado = slugQueOCoreGrava(entrada);
      if (gravado === null) continue; // recusado antes de escrever: ótimo

      const { rows: r } = await db.query('select ($1 ~ $2) and length($1) between 2 and 63 as ok', [
        gravado,
        expressao,
      ]);
      if (r[0].ok !== true) {
        escapariam.push(`${JSON.stringify(entrada)} → ${JSON.stringify(gravado)}`);
      }
    }

    assert.deepEqual(
      escapariam,
      [],
      'o Core deixou passar endereços que o banco recusa — viraria violação de constraint com o tenant já criado',
    );
  });

  it('normaliza em vez de recusar quando dá para normalizar', () => {
    // Exigir que o Super Admin digite tudo em minúscula seria rigor sem
    // motivo: `CAFE` é um endereço perfeitamente válido depois de normalizado.
    assert.equal(slugQueOCoreGrava('CAFE'), 'cafe');
    assert.equal(slugQueOCoreGrava('  Cafe-Do-Centro  '), 'cafe-do-centro');
  });

  it('e o conjunto de candidatos cobre os dois lados', () => {
    // Sem isto, uma lista só de endereços válidos faria o teste acima passar
    // sem nunca exercitar uma recusa.
    const aceitos = candidatos.filter((c) => slugQueOCoreGrava(c) !== null);
    assert.ok(aceitos.length > 0, 'nenhum candidato válido');
    assert.ok(aceitos.length < candidatos.length, 'nenhum candidato inválido');
  });
});

describe('a matriz de permissões da documentação', () => {
  /**
   * `docs/12-SECURITY/AUTHORIZATION.md` traz a matriz completa — 52 permissões
   * contra três papéis. Ela é **copiada à mão** da saída de
   * `npm run docs:matrix`, e cópia manual diverge: basta uma permissão nova
   * entrar na migration para a documentação passar a mentir.
   *
   * Matriz de permissão errada na documentação é pior que nenhuma: alguém
   * decide quem pode o quê olhando para ela.
   *
   * O teste importa **a mesma função** que o comando usa, não uma segunda
   * implementação — duas implementações poderiam concordar entre si e discordar
   * do banco.
   */
  it('bate com o catálogo do banco', async () => {
    const gerada = permissionRows(await permissionMatrix(db));
    const noDocumento = permissionRows(readFileSync(AUTHORIZATION_MD, 'utf8'));

    const soNoDocumento = noDocumento.filter((l) => !gerada.includes(l));
    const soNoBanco = gerada.filter((l) => !noDocumento.includes(l));

    assert.deepEqual(
      { soNoDocumento, soNoBanco },
      { soNoDocumento: [], soNoBanco: [] },
      'a matriz da documentação divergiu do catálogo — rode `npm run docs:matrix` e cole a saída',
    );
  });

  it('e cobre todas as permissões, não um pedaço', () => {
    // Sem isto, um documento truncado passaria: as linhas que sobraram bateriam.
    const noDocumento = permissionRows(readFileSync(AUTHORIZATION_MD, 'utf8'));
    assert.equal(noDocumento.length, PERMISSION_CODES.length);
  });
});

describe('documentos: a regra do Core é a do banco', () => {
  /*
   * `checkDocument()` decide o que a tela aceita; a constraint decide o que o
   * banco grava. Se divergirem, a tela aceita e o banco recusa com erro de
   * constraint — ou o contrário. Foi assim que o CNPJ alfanumérico ficou de
   * fora: a regra vivia em um lugar só, e estava errada lá.
   */
  for (const constraint of [
    'crm_contacts_document_format',
    'crm_companies_document_format',
    'tenants_document_format',
    'erp_customers_document_format',
  ]) {
    it(constraint, async () => {
      const { rows } = await db.query(
        'select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1',
        [constraint],
      );
      assert.equal(rows.length, 1, `${constraint} sumiu`);
      assert.ok(
        rows[0].def.includes(`'${DOCUMENT_PATTERN}'`),
        `${constraint}: ${rows[0].def} não usa ${DOCUMENT_PATTERN}`,
      );
    });
  }
});

describe('ERP: a regra do Core é a do banco', () => {
  /** Os valores entre aspas de uma constraint `in (...)`, na ordem. */
  async function valoresDaConstraint(nome) {
    const { rows } = await db.query(
      'select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1',
      [nome],
    );
    assert.equal(rows.length, 1, `${nome} sumiu`);
    return [...rows[0].def.matchAll(/'([a-z]+)'::text/g)].map((m) => m[1]);
  }

  for (const constraint of ['erp_products_unit_known', 'erp_sale_items_unit_known']) {
    it(`unidades: PRODUCT_UNITS × ${constraint}`, async () => {
      assertSameSet(PRODUCT_UNITS, await valoresDaConstraint(constraint), constraint);
    });
  }

  it('unidade fracionada: UNIT_INFO × erp_unit_is_fractional(), unidade por unidade', async () => {
    /*
     * A função é a regra única do banco: a constraint do item e os gatilhos
     * de venda e de estoque chamam ela. Se divergir do Core, a tela aceita
     * 1,5 onde o banco recusa — ou o contrário.
     */
    const divergentes = [];
    for (const unidade of PRODUCT_UNITS) {
      const { rows } = await db.query('select public.erp_unit_is_fractional($1) as f', [unidade]);
      if (rows[0].f !== UNIT_INFO[unidade].fracionada) {
        divergentes.push(`${unidade}: banco ${rows[0].f}, Core ${UNIT_INFO[unidade].fracionada}`);
      }
    }
    assert.deepEqual(divergentes, []);

    const { rows } = await db.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'erp_sale_items_fraction'`,
    );
    assert.match(rows[0].def, /erp_unit_is_fractional\(unit\)/, 'a constraint usa a função');
  });

  it('total da linha: lineTotalCents × round() do Postgres', async () => {
    const casos = [
      [2, 550],
      [0.335, 5990],
      [0.5, 1],
      [0.005, 1],
      [0.004, 1],
      [1.005, 1999],
      [12.345, 9999999],
      [3, 0],
      [0.001, 99999999],
    ];
    const divergentes = [];
    for (const [quantidade, preco] of casos) {
      const { rows } = await db.query('select round($1::numeric(14,3) * $2::bigint)::bigint as t', [
        String(quantidade),
        preco,
      ]);
      const banco = Number(rows[0].t);
      const core = lineTotalCents(quantidade, preco);
      if (banco !== core)
        divergentes.push(`${quantidade} × ${preco}: banco ${banco}, Core ${core}`);
    }
    assert.deepEqual(divergentes, []);
  });

  it('padrões de configuração: TENANT_SETTINGS × setting_defaults, nos dois sentidos', async () => {
    /*
     * A venda é registrada no banco e lê "venda exige cliente" dali. Se o
     * padrão do banco divergir do Core, a tela de configurações mostra uma
     * coisa e o caixa faz outra — para toda empresa que nunca mexeu nela.
     */
    const { rows } = await db.query(
      'select key, module, default_value from public.setting_defaults order by key',
    );
    const doBanco = rows.map((r) => `${r.key} | ${r.module} | ${JSON.stringify(r.default_value)}`);
    const doCore = TENANT_SETTINGS.map(
      (d) => `${d.key} | ${d.module} | ${JSON.stringify(d.default)}`,
    );
    assertSameSet(doCore, doBanco, 'padrões de configuração');
  });
});
