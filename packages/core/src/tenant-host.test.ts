/**
 * Testes da leitura de tenant pelo endereço.
 *
 * O teste que mais importa aqui não é nenhum caso individual — é o invariante
 * dos dois sentidos: **nenhum slug reservado pode ser provisionado.** Reservar
 * `www` só na leitura deixaria a armadilha armada na escrita, e o sintoma
 * apareceria como um cliente criado, cobrado e inalcançável.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Blueprint, checkBlueprint } from './blueprint.ts';
import type { ModuleCode } from './catalog.ts';
import { planProvisioning } from './provisioning-plan.ts';
import { RESERVED_SUBDOMAINS, isReservedSubdomain, tenantSlugFromHost } from './tenant-host.ts';

describe('o endereço diz o tenant', () => {
  const casos: [string, string | null][] = [
    ['acme.tivexy.com.br', 'acme'],
    ['cafe-do-centro.tivexy.com.br', 'cafe-do-centro'],
    ['acme.tivexy.app', 'acme'],

    // Porta e caixa não fazem parte do nome.
    ['ACME.Tivexy.com.br', 'acme'],
    ['acme.tivexy.com.br:443', 'acme'],
    ['  acme.tivexy.com.br  ', 'acme'],

    // Desenvolvimento pelo mesmo caminho da produção.
    ['acme.localhost', 'acme'],
    ['acme.localhost:3000', 'acme'],

    // O apex não é tenant nenhum.
    ['tivexy.com.br', null],
    ['tivexy.app', null],
    ['localhost', null],
    ['localhost:3000', null],

    // Reservados da plataforma.
    ['www.tivexy.com.br', null],
    ['app.tivexy.com.br', null],
    ['api.tivexy.com.br', null],
    ['admin.tivexy.com.br', null],

    // Dois níveis levariam dois endereços ao mesmo lugar.
    ['a.b.tivexy.com.br', null],

    // Fora do domínio da Tivexy: devolve "não sei" em vez de chutar.
    ['tivexy-web-abc123.vercel.app', null],
    ['cliente.parceiro.com', null],
    ['acme.tivexy.com.br.golpe.example', null],

    // Nada disso carrega tenant.
    ['192.168.0.10', null],
    ['192.168.0.10:3000', null],
    ['[::1]:3000', null],
    ['', null],
    ['   ', null],
  ];

  for (const [host, esperado] of casos) {
    it(`${JSON.stringify(host)} → ${JSON.stringify(esperado)}`, () => {
      assert.equal(tenantSlugFromHost(host), esperado);
    });
  }

  it('entrada que não é texto devolve nulo em vez de quebrar', () => {
    // O cabeçalho `Host` pode simplesmente não vir.
    for (const lixo of [null, undefined, 42, {}, []]) {
      assert.equal(tenantSlugFromHost(lixo as unknown as string), null);
    }
  });

  it('um domínio parecido não é o domínio', () => {
    // `tivexy.com.br.golpe.example` termina com `.example`, não com
    // `.tivexy.com.br` — mas um `includes` ingênuo casaria.
    assert.equal(tenantSlugFromHost('acme.naotivexy.com.br'), null);
    assert.equal(tenantSlugFromHost('acme.tivexy.com.brx'), null);
  });
});

describe('subdomínios reservados', () => {
  it('a lista é única e minúscula', () => {
    assert.equal(new Set(RESERVED_SUBDOMAINS).size, RESERVED_SUBDOMAINS.length);
    for (const s of RESERVED_SUBDOMAINS) {
      assert.equal(s, s.toLowerCase(), `${s} precisa estar em minúsculas`);
    }
  });

  it('a checagem ignora caixa e espaço', () => {
    assert.equal(isReservedSubdomain('WWW'), true);
    assert.equal(isReservedSubdomain('  api  '), true);
    assert.equal(isReservedSubdomain('acme'), false);
  });

  it('todo reservado é um slug que o banco aceitaria', () => {
    // Se um reservado não pudesse ser slug de todo jeito, reservá-lo seria
    // ruído — e sugeriria que a lista foi escrita sem conferir a constraint.
    const formato = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    for (const s of RESERVED_SUBDOMAINS) {
      assert.ok(formato.test(s) && s.length >= 2, `${s} nunca seria um slug válido`);
    }
  });
});

describe('o invariante dos dois sentidos', () => {
  const blueprint: Blueprint = (() => {
    const r = checkBlueprint({
      code: 'generico',
      name: 'Genérico',
      description: 'Para o teste de endereço reservado.',
      version: 1,
      plan: 'essencial',
      modules: ['core'],
      terms: { 'core.users': { singular: 'pessoa', plural: 'pessoas' } },
      roles: [],
      seeds: [],
      settings: {},
    });
    assert.equal(r.valid, true);
    return (r as { valid: true; blueprint: Blueprint }).blueprint;
  })();

  const planejar = (slug: string) =>
    planProvisioning({
      blueprint,
      planModules: ['core'] as readonly ModuleCode[],
      slug,
      name: 'Cliente',
      admin: { email: 'dono@cliente.com.br', fullName: 'Dono' },
    });

  it('nenhum slug reservado pode ser provisionado', () => {
    // O que este teste impede: criar o cliente `www`, que nasceria
    // inalcançável porque o endereço dele já pertence à plataforma.
    const escaparam = RESERVED_SUBDOMAINS.filter((s) => planejar(s).ok);
    assert.deepEqual(escaparam, [], 'estes virariam clientes que não abrem');
  });

  it('e a recusa explica o porquê', () => {
    const plan = planejar('www');
    assert.equal(plan.ok, false);
    const problema = (plan as { ok: false; problems: { path: string; message: string }[] })
      .problems[0];
    assert.equal(problema?.path, 'slug');
    assert.match(problema?.message ?? '', /plataforma/);
  });

  it('todo slug provisionável é legível de volta pelo endereço', () => {
    // O caminho completo: se dá para criar, tem que dar para chegar.
    for (const slug of ['acme', 'cafe-do-centro', 'clinica-2', 'ab']) {
      assert.equal(planejar(slug).ok, true, `${slug} deveria ser provisionável`);
      assert.equal(
        tenantSlugFromHost(`${slug}.tivexy.com.br`),
        slug,
        `${slug} foi criado mas o endereço dele não leva a ele`,
      );
    }
  });
});
