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
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { MODULE_CODES, matchRule } from '@tivexy/core';
import { navigation } from './navigation.ts';
import { routeRules } from './routes.ts';

const hrefs = navigation.flatMap((grupo) => grupo.items.map((item) => item.href));

/**
 * Os caminhos que o App Router de fato serve.
 *
 * Lidos do disco, não declarados numa lista — uma segunda lista escrita à mão
 * seria mais uma coisa a esquecer de atualizar, que é justamente o defeito que
 * o teste abaixo existe para pegar.
 *
 * Segmento entre parênteses é grupo de rotas: `(app)` e `(auth)` organizam
 * arquivos e não aparecem na URL.
 */
function rotasServidas(): Set<string> {
  const raiz = path.join(import.meta.dirname, '..', 'app');
  const encontradas = new Set<string>();

  function percorrer(diretorio: string, rota: string): void {
    for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        const grupo = /^\(.*\)$/.test(entrada.name);
        percorrer(path.join(diretorio, entrada.name), grupo ? rota : `${rota}/${entrada.name}`);
      } else if (entrada.name === 'page.tsx') {
        encontradas.add(rota === '' ? '/' : rota);
      }
    }
  }

  percorrer(raiz, '');
  return encontradas;
}

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

  it('todo item marcado como pronto tem página', () => {
    /*
     * `status: 'ready'` é uma promessa: o item vira link clicável no menu. Um
     * link para uma rota sem `page.tsx` dá 404 — e o 404 não aparece em
     * typecheck, nem em lint, nem no build. Aparece para quem clicou.
     *
     * A promessa é só esta. O contrário **não** se afirma aqui: uma página
     * existir não quer dizer que a funcionalidade está pronta, e marcar uma
     * tela pela metade como "em construção" é decisão honesta, não erro. Ver
     * CLAUDE.md.
     */
    const servidas = rotasServidas();
    const prometidas = navigation
      .flatMap((grupo) => grupo.items)
      .filter((item) => item.status === 'ready')
      .map((item) => item.href);

    const semPagina = prometidas.filter((href) => !servidas.has(href));
    assert.deepEqual(
      semPagina,
      [],
      'item do menu marcado como pronto aponta para rota que não existe',
    );
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
