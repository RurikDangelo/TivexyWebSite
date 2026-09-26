/**
 * Testes da decisão do middleware.
 *
 * Duas propriedades, e a segunda é a que importa: **o middleware nunca nega por
 * um motivo que ele não tem como conhecer.** Um administrador com todas as
 * permissões chega aqui como "tem sessão" e mais nada; se esta camada agisse
 * sobre a falta aparente de empresa, ela o mandaria para o onboarding — numa
 * conta que funciona.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { routeRules } from '../../config/routes.ts';
import { RETURN_PARAM } from './guard.ts';
import { edgeOutcome } from './edge.ts';

const semSessao = (p: string) => edgeOutcome(p, false, routeRules);
const comSessao = (p: string) => edgeOutcome(p, true, routeRules);

describe('sem sessão', () => {
  it('rota pública passa', () => {
    assert.equal(semSessao('/entrar').kind, 'allow');
    assert.equal(semSessao('/recuperar').kind, 'allow');
  });

  it('rota protegida vai para o login', () => {
    const r = semSessao('/painel');
    assert.equal(r.kind, 'redirect');
    assert.equal(
      r.kind === 'redirect' && r.location,
      `/entrar?${RETURN_PARAM}=${encodeURIComponent('/painel')}`,
    );
  });

  it('a área da plataforma também exige sessão', () => {
    assert.equal(semSessao('/admin/clientes').kind, 'redirect');
  });

  it('rota não declarada é protegida — fechada por padrão', () => {
    assert.equal(semSessao('/rota-que-ninguem-declarou').kind, 'redirect');
  });
});

describe('com sessão', () => {
  it('passa tudo adiante, inclusive o que será negado depois', () => {
    // Nenhuma destas é liberação: `requireAccess()` decide com o Viewer real.
    for (const caminho of ['/painel', '/admin', '/crm/leads', '/configuracoes']) {
      assert.equal(comSessao(caminho).kind, 'allow', caminho);
    }
  });

  it('não manda ninguém para o onboarding', () => {
    // O `Viewer` do middleware não tem empresa por construção. Agir sobre isso
    // seria decidir com informação que não existe.
    const caminhos = routeRules.map((r) => r.prefix).concat(['/', '/qualquer']);
    for (const caminho of caminhos) {
      const r = comSessao(caminho);
      assert.notEqual(
        r.kind === 'redirect' && r.location,
        '/onboarding',
        `${caminho} foi mandado para o onboarding`,
      );
    }
  });
});

describe('invariante', () => {
  it('só redireciona para /entrar, e só por falta de sessão', () => {
    const caminhos = routeRules.map((r) => r.prefix).concat(['/', '/nova', '/admin/x']);
    for (const caminho of caminhos) {
      for (const sessao of [true, false]) {
        const r = edgeOutcome(caminho, sessao, routeRules);
        if (r.kind !== 'redirect') continue;
        assert.equal(r.reason, 'unauthenticated', caminho);
        assert.ok(r.location.startsWith('/entrar'), `${caminho} → ${r.location}`);
      }
    }
  });

  it('nunca devolve "deny" — negar sem redirecionar é decisão da renderização', () => {
    for (const caminho of routeRules.map((r) => r.prefix)) {
      for (const sessao of [true, false]) {
        assert.notEqual(edgeOutcome(caminho, sessao, routeRules).kind, 'deny', caminho);
      }
    }
  });
});
