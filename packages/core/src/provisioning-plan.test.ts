/**
 * Testes do plano de provisionamento.
 *
 * O valor de o plano ser puro está aqui: a ordem das operações, a recusa por
 * módulo fora do plano e a validação do subdomínio são testadas sem subir
 * banco nenhum. O teste que prova que o plano **funciona** contra Postgres
 * está em `supabase/tests/blueprint-provisioning.test.mjs`, e executa
 * exatamente estas operações.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Blueprint, BlueprintProblem } from './blueprint.ts';
import { checkBlueprint } from './blueprint.ts';
import type { ModuleCode } from './catalog.ts';
import {
  type ProvisioningOperation,
  type ProvisioningPlan,
  planProvisioning,
  previewOf,
} from './provisioning-plan.ts';

const blueprint: Blueprint = (() => {
  const r = checkBlueprint({
    code: 'cafeteria',
    name: 'Cafeteria',
    description: 'Cafeterias e casas de café.',
    version: 1,
    plan: 'profissional',
    modules: ['core', 'erp', 'inventory'],
    terms: { 'erp.products': { singular: 'item', plural: 'itens' } },
    roles: [
      { code: 'barista', name: 'Barista', permissions: ['erp.sales.read', 'erp.sales.write'] },
      { code: 'gerente_de_loja', name: 'Gerente', permissions: ['erp.products.write'] },
    ],
    seeds: [
      { entity: 'erp.product_categories', values: { name: 'Cafés' } },
      { entity: 'erp.payment_methods', values: { name: 'Pix' } },
    ],
    settings: { currency: 'BRL' },
  });
  assert.equal(r.valid, true);
  return (r as { valid: true; blueprint: Blueprint }).blueprint;
})();

const PLANO: readonly ModuleCode[] = ['core', 'crm', 'erp', 'inventory', 'finance', 'automation'];

const entrada = (over: Partial<Parameters<typeof planProvisioning>[0]> = {}) => ({
  blueprint,
  planModules: PLANO,
  slug: 'cafe-do-centro',
  name: 'Café do Centro',
  admin: { email: 'dono@cafedocentro.com.br', fullName: 'Ana Souza' },
  ...over,
});

function ok(plan: ProvisioningPlan): readonly ProvisioningOperation[] {
  assert.equal(plan.ok, true, plan.ok ? '' : JSON.stringify(plan.problems, null, 2));
  return (plan as { ok: true; operations: readonly ProvisioningOperation[] }).operations;
}

function caminhos(plan: ProvisioningPlan): string[] {
  assert.equal(plan.ok, false, 'esperava plano recusado');
  return (plan as { ok: false; problems: readonly BlueprintProblem[] }).problems.map((p) => p.path);
}

describe('a ordem é contrato', () => {
  const tipos = ok(planProvisioning(entrada())).map((o) => o.kind);

  it('o tenant nasce primeiro', () => {
    assert.equal(tipos[0], 'create_tenant');
  });

  it('módulo antes de papel — a permissão do papel pertence a um módulo', () => {
    assert.ok(tipos.lastIndexOf('enable_module') < tipos.indexOf('create_role'));
  });

  it('papel antes de administrador — o vínculo dele aponta para um papel', () => {
    assert.ok(tipos.lastIndexOf('create_role') < tipos.indexOf('create_admin'));
  });

  it('convite por último', () => {
    assert.equal(tipos[tipos.length - 1], 'invite');
  });

  it('uma operação por módulo, papel e semente — nada se perde', () => {
    const conta = (k: string) => tipos.filter((t) => t === k).length;
    assert.equal(conta('enable_module'), blueprint.modules.length);
    assert.equal(conta('create_role'), blueprint.roles.length);
    assert.equal(conta('seed'), blueprint.seeds.length);
    assert.equal(conta('create_tenant'), 1);
    assert.equal(conta('create_admin'), 1);
  });
});

describe('o administrador', () => {
  it('recebe tenant_admin, nunca um papel do blueprint', () => {
    // Quem recebe a empresa precisa poder administrar tudo dentro dela,
    // inclusive criar e editar os papéis que o nicho trouxe. Um blueprint que
    // pudesse escolher o papel do administrador poderia entregar uma empresa
    // sem ninguém capaz de administrá-la.
    const admin = ok(planProvisioning(entrada())).find((o) => o.kind === 'create_admin');
    assert.equal(admin?.kind === 'create_admin' && admin.role, 'tenant_admin');
  });

  it('e-mail e nome vêm normalizados', () => {
    const plan = entrada({ admin: { email: '  DONO@Cafe.COM.br ', fullName: '  Ana  ' } });
    const admin = ok(planProvisioning(plan)).find((o) => o.kind === 'create_admin');
    assert.deepEqual(admin?.kind === 'create_admin' && [admin.email, admin.fullName], [
      'dono@cafe.com.br',
      'Ana',
    ]);
  });

  it('o convite vai para o mesmo e-mail normalizado', () => {
    const ops = ok(planProvisioning(entrada({ admin: { email: 'X@Y.COM', fullName: 'X' } })));
    const convite = ops.find((o) => o.kind === 'invite');
    assert.equal(convite?.kind === 'invite' && convite.email, 'x@y.com');
  });
});

describe('o blueprint não passa por cima do comercial', () => {
  it('recusa módulo fora do plano, nomeando qual', () => {
    const plan = planProvisioning(entrada({ planModules: ['core', 'crm'] }));
    assert.deepEqual(caminhos(plan), ['blueprint.modules[1]', 'blueprint.modules[2]']);
  });

  it('declarar menos que o plano oferece é normal', () => {
    // A cafeteria não usa CRM nem automação, e o plano os inclui. Isso não é
    // erro: `tenant_modules` é a verdade sobre acesso, não o plano.
    const ops = ok(planProvisioning(entrada()));
    const modulos = ops.flatMap((o) => (o.kind === 'enable_module' ? [o.module] : []));
    assert.deepEqual(modulos, ['core', 'erp', 'inventory']);
    assert.ok(!modulos.includes('crm'));
  });
});

describe('o subdomínio', () => {
  it('normaliza caixa e espaço', () => {
    const ops = ok(planProvisioning(entrada({ slug: '  Cafe-Do-Centro ' })));
    const tenant = ops[0];
    assert.equal(tenant?.kind === 'create_tenant' && tenant.slug, 'cafe-do-centro');
  });

  for (const ruim of [
    'a',
    '-cafe',
    'cafe-',
    'café',
    'cafe_do_centro',
    'cafe do centro',
    'CAFE!',
    '',
    'x'.repeat(64),
  ]) {
    it(`recusa ${JSON.stringify(ruim)}`, () => {
      assert.ok(
        caminhos(planProvisioning(entrada({ slug: ruim }))).includes('slug'),
        'subdomínio inválido precisa ser recusado antes de qualquer escrita',
      );
    });
  }

  it('aceita o limite de 63 caracteres', () => {
    assert.equal(planProvisioning(entrada({ slug: 'x'.repeat(63) })).ok, true);
  });
});

describe('relata todos os problemas de uma vez', () => {
  it('quem cria um cliente não descobre um erro por vez', () => {
    const plan = planProvisioning(
      entrada({
        slug: 'A',
        name: '   ',
        admin: { email: 'sem-arroba', fullName: '' },
        planModules: ['core'],
      }),
    );
    assert.deepEqual(caminhos(plan).sort(), [
      'admin.email',
      'admin.fullName',
      'blueprint.modules[1]',
      'blueprint.modules[2]',
      'name',
      'slug',
    ]);
  });
});

describe('prévia', () => {
  it('resume o que o cliente vai receber', () => {
    const p = previewOf(ok(planProvisioning(entrada())));
    assert.deepEqual(p, {
      modules: ['core', 'erp', 'inventory'],
      roles: ['barista', 'gerente_de_loja'],
      seeds: 2,
      adminEmail: 'dono@cafedocentro.com.br',
    });
  });

  it('a prévia bate com o plano, não com o blueprint', () => {
    // Se a prévia lesse o blueprint direto, mostraria o que foi pedido em vez
    // do que vai acontecer — e qualquer divergência entre os dois passaria
    // despercebida exatamente na tela que existe para conferir.
    const ops = ok(planProvisioning(entrada()));
    const p = previewOf(ops);
    assert.equal(p.modules.length, ops.filter((o) => o.kind === 'enable_module').length);
    assert.equal(p.roles.length, ops.filter((o) => o.kind === 'create_role').length);
  });
});
