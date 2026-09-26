/**
 * Navegação × regras de rota.
 *
 * Duas listas que precisam concordar: `navigation.ts` diz o que aparece no
 * menu, `routes.ts` diz o que cada rota exige. Se um item do menu apontar para
 * um caminho sem regra declarada, ele cai no padrão — e o sintoma é silencioso:
 * a rota passa a exigir menos do que deveria, e ninguém percebe até alguém ver
 * o que não devia.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MODULE_CODES, matchRule } from '@tivexy/core';
import { navItems } from './navigation.ts';
import { routeRules } from './routes.ts';

const hrefs: readonly string[] = navItems.map((item) => item.href);

/** Casou por uma regra declarada, ou caiu no padrão? */
function temRegraDeclarada(pathname: string): boolean {
  return routeRules.some(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

describe('regras de rota', () => {
  it('não declara o mesmo prefixo duas vezes', () => {
    const prefixos = routeRules.map((r) => r.prefix);
    const repetidos = prefixos.filter((p, i) => prefixos.indexOf(p) !== i);
    assert.deepEqual(repetidos, [], 'prefixo repetido torna a regra vencedora imprevisível');
  });

  it('todo prefixo é um caminho absoluto, sem barra final', () => {
    for (const { prefix } of routeRules) {
      assert.ok(prefix.startsWith('/'), `${prefix} deveria começar com /`);
      assert.ok(prefix === '/' || !prefix.endsWith('/'), `${prefix} não deveria terminar com /`);
    }
  });

  it('toda permissão citada pertence a um módulo real', () => {
    const modulos = new Set<string>(MODULE_CODES);
    for (const { prefix, rule } of routeRules) {
      if (rule.kind !== 'permission') continue;
      const modulo = rule.permission.split('.')[0];
      assert.ok(modulo && modulos.has(modulo), `${prefix}: módulo de ${rule.permission}`);
    }
  });
});

describe('navegação × rotas', () => {
  it('todo item do menu tem regra declarada', () => {
    const semRegra = hrefs.filter((href) => !temRegraDeclarada(href));
    assert.deepEqual(
      semRegra,
      [],
      'item de menu sem regra cai no padrão e exige menos do que deveria',
    );
  });

  it('nenhum item do menu é público por acidente', () => {
    // O menu só existe dentro da área autenticada. Um item público ali seria
    // engano de digitação, não decisão.
    const publicos = hrefs.filter((href) => matchRule(routeRules, href).kind === 'public');
    assert.deepEqual(publicos, []);
  });

  it('o item de Super Admin exige escopo de plataforma', () => {
    assert.equal(matchRule(routeRules, '/admin').kind, 'superAdmin');
  });

  it('as rotas de saída do limbo não estão no menu', () => {
    // /convite, /onboarding e /preparando recebem quem ainda não é membro
    // ativo. Aparecer no menu não faria sentido: quem as vê não tem menu.
    for (const rota of ['/convite', '/onboarding', '/preparando']) {
      assert.ok(!hrefs.includes(rota), `${rota} não deveria estar no menu`);
      assert.equal(matchRule(routeRules, rota).kind, 'authenticated');
    }
  });
});
