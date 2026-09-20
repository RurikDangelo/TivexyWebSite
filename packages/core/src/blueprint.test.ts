/**
 * Testes do contrato de Blueprint.
 *
 * O que estes testes protegem não é o formato — é a **fronteira** do ADR-003.
 * Blueprint escolhe entre opções que o Core já oferece; um documento que
 * referencia módulo, plano ou permissão inexistente é um blueprint tentando
 * inventar funcionalidade, e precisa ser recusado na validação, não descoberto
 * no meio de um provisionamento.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type Blueprint,
  type BlueprintProblem,
  checkBlueprint,
  enables,
  termFor,
} from './blueprint.ts';
import { TERM_KEYS } from './catalog.ts';

/** Um documento mínimo e válido, para as variações partirem daqui. */
const base = {
  code: 'cafeteria',
  name: 'Cafeteria',
  description: 'Cafeterias e casas de café com venda no balcão.',
  version: 1,
  plan: 'profissional',
  modules: ['core', 'erp', 'inventory'],
  terms: {
    'erp.customers': { singular: 'cliente', plural: 'clientes' },
    'erp.products': { singular: 'item do cardápio', plural: 'itens do cardápio' },
  },
  roles: [
    {
      code: 'barista',
      name: 'Barista',
      permissions: ['erp.products.read', 'erp.sales.read', 'erp.sales.write'],
    },
  ],
  seeds: [{ entity: 'erp.product_categories', values: { name: 'Cafés' } }],
  settings: { 'core.currency': 'BRL' },
};

/** Valida e devolve o blueprint, falhando o teste se não for válido. */
function valido(raw: unknown): Blueprint {
  const r = checkBlueprint(raw);
  assert.equal(r.valid, true, r.valid ? '' : JSON.stringify(r.problems, null, 2));
  return (r as { valid: true; blueprint: Blueprint }).blueprint;
}

/** Os problemas encontrados, falhando o teste se o documento for válido. */
function invalido(raw: unknown): readonly BlueprintProblem[] {
  const r = checkBlueprint(raw);
  assert.equal(r.valid, false, 'esperava documento inválido');
  return (r as { valid: false; problems: readonly BlueprintProblem[] }).problems;
}

/** Os caminhos com problema, para comparar sem depender do texto da mensagem. */
function problemas(raw: unknown): string[] {
  return invalido(raw).map((p) => p.path);
}

describe('documento válido', () => {
  it('aceita o mínimo completo', () => {
    const bp = valido(base);
    assert.equal(bp.code, 'cafeteria');
    assert.deepEqual([...bp.modules], ['core', 'erp', 'inventory']);
  });

  it('as listas opcionais viram vazias, não indefinidas', () => {
    // Quem consome não deveria precisar de `?? []` em toda leitura.
    const bp = valido({ ...base, terms: undefined, roles: undefined, seeds: undefined });
    assert.deepEqual(bp.roles, []);
    assert.deepEqual(bp.seeds, []);
    assert.deepEqual(bp.terms, {});
    assert.deepEqual(bp.settings, { 'core.currency': 'BRL' });
  });

  it('apara espaço dos textos', () => {
    const bp = valido({ ...base, name: '  Cafeteria  ' });
    assert.equal(bp.name, 'Cafeteria');
  });
});

describe('a fronteira do ADR-003', () => {
  /**
   * Só módulos, sem nada que dependa deles.
   *
   * Tudo no blueprint aponta para um módulo — papel, rótulo, configuração —,
   * então mexer na lista de módulos faz o resto reclamar junto. Para afirmar
   * algo **sobre módulos**, o resto sai do caminho.
   */
  const soModulos = { ...base, roles: [], terms: {}, settings: {}, seeds: [] };

  it('recusa módulo que não existe no catálogo', () => {
    assert.deepEqual(problemas({ ...soModulos, modules: ['core', 'veterinaria'] }), ['modules[1]']);
  });

  it('tirar um módulo denuncia tudo que dependia dele', () => {
    // A cascata é de propósito, e é a lista inteira: rótulos, permissões de
    // papel e sementes. Relatar só o módulo que sumiu esconderia o trabalho
    // que ainda falta — e é justamente esse trabalho que, esquecido, produz
    // um tenant com configuração pendente para sempre.
    assert.deepEqual(problemas({ ...base, modules: ['core', 'inventory'] }), [
      'terms.erp.customers',
      'terms.erp.products',
      'roles[0].permissions[0]',
      'roles[0].permissions[1]',
      'roles[0].permissions[2]',
      'seeds[0].entity',
    ]);
  });

  it('recusa plano que não existe no catálogo', () => {
    assert.deepEqual(problemas({ ...base, plan: 'premium' }), ['plan']);
  });

  it('recusa permissão que não existe no catálogo', () => {
    const r = { ...base, roles: [{ ...base.roles[0], permissions: ['erp.cafe.servir'] }] };
    assert.deepEqual(problemas(r), ['roles[0].permissions[0]']);
  });

  it('recusa permissão de módulo que o blueprint não habilita', () => {
    // O erro silencioso que este teste existe para pegar: um papel com
    // permissão de CRM num blueprint sem CRM cria gente com permissão para
    // uma tela que não existe. O RLS nega por módulo, e a pessoa vê "módulo
    // não contratado" com a permissão no bolso.
    const r = {
      ...base,
      roles: [{ code: 'vendedor', name: 'Vendedor', permissions: ['crm.leads.write'] }],
    };
    assert.deepEqual(problemas(r), ['roles[0].permissions[0]']);
  });

  it('o módulo core é obrigatório', () => {
    // Sem `core` não há usuários nem permissões — o tenant não teria como ter
    // administrador, e o provisionamento pararia no meio.
    assert.deepEqual(problemas({ ...soModulos, modules: ['erp'] }), ['modules']);
  });

  it('um tenant sem módulo nenhum não opera', () => {
    assert.deepEqual(problemas({ ...base, modules: [] }), ['modules']);
  });
});

describe('relata todos os problemas, não o primeiro', () => {
  it('três permissões erradas viram três problemas', () => {
    // Devolver um por vez transforma escrever blueprint num jogo de tentativa
    // e erro, com um ciclo de validação por engano.
    const r = {
      ...base,
      roles: [
        {
          code: 'barista',
          name: 'Barista',
          permissions: ['nao.existe.um', 'nao.existe.dois', 'crm.leads.read'],
        },
      ],
    };
    assert.deepEqual(problemas(r), [
      'roles[0].permissions[0]',
      'roles[0].permissions[1]',
      'roles[0].permissions[2]',
    ]);
  });

  it('problemas em campos diferentes aparecem juntos', () => {
    const r = { ...base, code: 'Cafeteria Legal', plan: 'inexistente', version: 0 };
    assert.deepEqual(problemas(r).sort(), ['code', 'plan', 'version']);
  });

  it('cada problema diz onde e o quê', () => {
    const encontrados = invalido({ ...base, plan: 'premium' });
    assert.equal(encontrados.length, 1);
    assert.equal(encontrados[0]?.path, 'plan');
    assert.match(
      encontrados[0]?.message ?? '',
      /premium/,
      'a mensagem precisa citar o valor recusado',
    );
  });
});

describe('formato', () => {
  for (const ruim of ['Cafeteria', 'cafeteria_legal', 'cafeteria-', '-cafeteria', 'café', '']) {
    it(`recusa code ${JSON.stringify(ruim)}`, () => {
      assert.ok(problemas({ ...base, code: ruim }).includes('code'));
    });
  }

  it('aceita code com número e hífen', () => {
    assert.equal(
      valido({ ...base, code: 'clinica-odontologica-2' }).code,
      'clinica-odontologica-2',
    );
  });

  it('recusa code de papel fora de snake_case', () => {
    const r = { ...base, roles: [{ ...base.roles[0], code: 'Barista Chefe' }] };
    assert.ok(problemas(r).includes('roles[0].code'));
  });

  it('recusa módulo repetido', () => {
    assert.deepEqual(problemas({ ...base, modules: ['core', 'erp', 'erp'] }), ['modules[2]']);
  });

  it('recusa code de papel repetido', () => {
    const r = { ...base, roles: [base.roles[0], { ...base.roles[0], name: 'Outro' }] };
    assert.ok(problemas(r).includes('roles[1].code'));
  });

  it('recusa papel sem permissão nenhuma', () => {
    const r = { ...base, roles: [{ code: 'vazio', name: 'Vazio', permissions: [] }] };
    assert.ok(problemas(r).includes('roles[0].permissions'));
  });

  it('versão precisa ser inteiro a partir de 1', () => {
    for (const v of [0, -1, 1.5, '1', null]) {
      assert.ok(problemas({ ...base, version: v }).includes('version'), `${String(v)} passou`);
    }
  });
});

describe('entrada hostil', () => {
  for (const lixo of [null, undefined, 'texto', 42, [], true]) {
    it(`${JSON.stringify(lixo) ?? 'undefined'} não quebra a validação`, () => {
      const r = checkBlueprint(lixo);
      assert.equal(r.valid, false);
      assert.ok((r as { valid: false; problems: unknown[] }).problems.length > 0);
    });
  }

  it('lista onde deveria haver objeto é recusada', () => {
    // `[]` passa em `typeof === 'object'`: sem a checagem de Array, um
    // `terms: []` seria aceito e produziria rótulos vazios silenciosamente.
    assert.ok(problemas({ ...base, terms: [] }).includes('terms'));
    assert.ok(problemas({ ...base, settings: [] }).includes('settings'));
  });

  it('rótulo sem plural é recusado', () => {
    const r = { ...base, terms: { 'erp.customers': { singular: 'cliente' } } };
    assert.deepEqual(problemas(r), ['terms.erp.customers.plural']);
  });
});

describe('leitura', () => {
  it('termFor devolve o rótulo do nicho', () => {
    const bp = valido(base);
    assert.deepEqual(termFor(bp, 'erp.customers', { singular: 'x', plural: 'y' }), {
      singular: 'cliente',
      plural: 'clientes',
    });
  });

  it('termFor cai no padrão quando o blueprint não traduz', () => {
    // Blueprint incompleto precisa continuar funcionando: a interface mostra o
    // nome genérico, não um espaço em branco nem a própria chave.
    const bp = valido(base);
    const padrao = { singular: 'lead', plural: 'leads' };
    assert.deepEqual(termFor(bp, 'crm.leads', padrao), padrao);
  });

  it('enables responde pelos módulos declarados', () => {
    const bp = valido(base);
    assert.equal(enables(bp, 'erp'), true);
    assert.equal(enables(bp, 'crm'), false);
  });
});

describe('o vocabulário precisa existir', () => {
  it('recusa chave que não é recurso do Core', () => {
    // Este é o defeito sem sintoma: `erp.produtos` nunca daria erro, o rótulo
    // simplesmente não seria aplicado, e a tela mostraria o nome genérico como
    // se estivesse tudo certo.
    const r = { ...base, terms: { 'erp.produtos': { singular: 'item', plural: 'itens' } } };
    assert.deepEqual(problemas(r), ['terms.erp.produtos']);
  });

  it('recusa rótulo de módulo que o blueprint não habilita', () => {
    const r = { ...base, terms: { 'crm.leads': { singular: 'x', plural: 'y' } } };
    assert.deepEqual(problemas(r), ['terms.crm.leads']);
  });

  it('aceita qualquer recurso que tenha permissão no catálogo', () => {
    // A lista de chaves renomeáveis é derivada das permissões, então tudo que
    // o Core protege pode ser renomeado. Sem exceção que alguém precise decorar.
    for (const chave of TERM_KEYS.filter((k) => k.startsWith('erp.'))) {
      const r = { ...base, terms: { [chave]: { singular: 'a', plural: 'b' } } };
      assert.equal(checkBlueprint(r).valid, true, `${chave} deveria ser renomeável`);
    }
  });
});

describe('as configurações precisam existir', () => {
  it('recusa chave que não é configuração do Core', () => {
    // O Blueprint escolhe o valor de uma configuração; ele não decide que
    // configurações existem. Antes, `moeda` entrava calada e nunca era lida.
    assert.deepEqual(problemas({ ...base, settings: { moeda: 'BRL' } }), ['settings.moeda']);
  });

  it('recusa configuração de módulo que o blueprint não habilita', () => {
    const r = { ...base, settings: { 'crm.contact_requires_document': true } };
    assert.deepEqual(problemas(r), ['settings.crm.contact_requires_document']);
  });

  it('recusa valor do tipo errado, dizendo o que esperava', () => {
    const r = checkBlueprint({ ...base, settings: { 'erp.sales_requires_customer': 'sim' } });
    assert.equal(r.valid, false);
    const [p] = (r as { valid: false; problems: BlueprintProblem[] }).problems;
    assert.equal(p?.path, 'settings.erp.sales_requires_customer');
    assert.match(p?.message ?? '', /verdadeiro ou falso/);
  });

  it('recusa valor fora das opções, listando as aceitas', () => {
    const r = checkBlueprint({ ...base, settings: { 'core.currency': 'USD' } });
    assert.equal(r.valid, false);
    const [p] = (r as { valid: false; problems: BlueprintProblem[] }).problems;
    assert.match(p?.message ?? '', /BRL/, 'a mensagem precisa dizer o que é aceito');
  });

  it('recusa fuso horário que não existe', () => {
    const r = { ...base, settings: { 'core.timezone': 'America/Sao_Paulo_Errado' } };
    assert.ok(problemas(r).includes('settings.core.timezone'));
  });

  it('aceita fuso horário de verdade', () => {
    for (const fuso of ['America/Sao_Paulo', 'America/Manaus', 'UTC']) {
      const r = { ...base, settings: { 'core.timezone': fuso } };
      assert.equal(checkBlueprint(r).valid, true, `${fuso} deveria ser aceito`);
    }
  });
});

describe('sementes', () => {
  const semente = (entity: string, values: Record<string, unknown> = { name: 'X' }) => ({
    ...base,
    seeds: [{ entity, values }],
  });

  it('recusa alvo fora da forma "modulo.entidade"', () => {
    for (const ruim of ['produtos', 'ERP.products', 'erp.', '.products', 'erp-products']) {
      assert.deepEqual(problemas(semente(ruim)), ['seeds[0].entity'], `${ruim} passou`);
    }
  });

  it('recusa semear em módulo que o blueprint não habilita', () => {
    // Pendente é estado normal para semente hoje — os módulos de negócio não
    // têm tabela. Por isso uma semente no módulo errado nunca chamaria
    // atenção: ficaria pendente para sempre, esperando uma tabela que este
    // tenant jamais vai ter.
    assert.deepEqual(problemas(semente('crm.pipelines')), ['seeds[0].entity']);
  });

  it('recusa semente sem valor nenhum', () => {
    assert.deepEqual(problemas(semente('erp.product_categories', {})), ['seeds[0].values']);
  });

  it('aceita entidade com underscore, que é como as tabelas se chamam', () => {
    assert.equal(checkBlueprint(semente('erp.product_categories')).valid, true);
    assert.equal(checkBlueprint(semente('erp.payment_methods')).valid, true);
  });
});
