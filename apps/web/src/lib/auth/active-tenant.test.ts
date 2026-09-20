/**
 * Testes da resolução de empresa ativa.
 *
 * O caso que dá nome a este arquivo é o `foreign`: o endereço nomeia uma
 * empresa que a pessoa não alcança. A implementação "óbvia" cai para a empresa
 * dela, o que funciona na tela e mente no conteúdo. Há um teste para isso e há
 * um invariante — nenhuma entrada faz a função devolver uma empresa cujo slug
 * contradiga o endereço.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type TenantOption, chooseTenant } from './active-tenant.ts';

function empresa(slug: string, over: Partial<TenantOption> = {}): TenantOption {
  return {
    id: `id-${slug}`,
    slug,
    name: slug.toUpperCase(),
    status: 'active',
    membership: 'active',
    ...over,
  };
}

const acme = empresa('acme');
const bravo = empresa('bravo');

describe('chooseTenant — o endereço decide', () => {
  it('o subdomínio escolhe a empresa', () => {
    const r = chooseTenant([acme, bravo], 'acme', null);
    assert.equal(r.kind, 'resolved');
    assert.equal(r.kind === 'resolved' && r.tenant.slug, 'acme');
    assert.equal(r.kind === 'resolved' && r.source, 'host');
  });

  it('o endereço ganha do cookie', () => {
    const r = chooseTenant([acme, bravo], 'acme', 'bravo');
    assert.equal(r.kind === 'resolved' && r.tenant.slug, 'acme');
  });

  it('ignora a caixa do subdomínio', () => {
    const r = chooseTenant([acme], 'ACME', null);
    assert.equal(r.kind === 'resolved' && r.tenant.slug, 'acme');
  });

  it('empresa do endereço fora do alcance não cai para a da pessoa', () => {
    const r = chooseTenant([bravo], 'acme', null);
    assert.equal(r.kind, 'foreign');
    assert.equal(r.kind === 'foreign' && r.slug, 'acme');
  });

  it('endereço reservado não é empresa — cai para as outras fontes', () => {
    // `app.tivexy.com.br` é a plataforma, não um tenant chamado "app".
    const r = chooseTenant([acme], 'app', null);
    assert.equal(r.kind === 'resolved' && r.source, 'only');
  });
});

describe('chooseTenant — sem endereço', () => {
  it('sem vínculo nenhum', () => {
    assert.equal(chooseTenant([], null, null).kind, 'none');
  });

  it('um vínculo só dispensa escolher', () => {
    const r = chooseTenant([acme], null, null);
    assert.equal(r.kind === 'resolved' && r.source, 'only');
  });

  it('o cookie decide quando há várias', () => {
    const r = chooseTenant([acme, bravo], null, 'bravo');
    assert.equal(r.kind === 'resolved' && r.tenant.slug, 'bravo');
    assert.equal(r.kind === 'resolved' && r.source, 'cookie');
  });

  it('cookie apontando para empresa fora do alcance é ignorado', () => {
    // Diferente do endereço: o cookie não é o que a pessoa vê nem compartilha,
    // então ignorá-lo não engana ninguém — só pede que escolha de novo.
    const r = chooseTenant([acme, bravo], null, 'charlie');
    assert.equal(r.kind, 'choose');
  });

  it('várias e nenhuma escolhida pede a tela de escolha', () => {
    const r = chooseTenant([acme, bravo], null, null);
    assert.equal(r.kind, 'choose');
    assert.equal(r.kind === 'choose' && r.options.length, 2);
  });
});

describe('invariantes', () => {
  /*
   * O que esta propriedade protege: qualquer edição futura que reintroduza um
   * fallback silencioso quando o endereço nomeia outra empresa. O sintoma em
   * produção seria dado da empresa errada numa tela que parece certa — o tipo
   * de defeito que ninguém reporta como defeito.
   */
  it('quando o endereço nomeia uma empresa, o resultado nunca é outra', () => {
    const conjuntos: readonly (readonly TenantOption[])[] = [
      [],
      [acme],
      [bravo],
      [acme, bravo],
      [acme, bravo, empresa('charlie')],
    ];
    const enderecos = [null, 'acme', 'bravo', 'charlie', 'delta', 'app', 'www'];
    const cookies = [null, 'acme', 'bravo', 'charlie', 'inexistente', ''];

    for (const options of conjuntos) {
      for (const host of enderecos) {
        for (const cookie of cookies) {
          const r = chooseTenant(options, host, cookie);
          if (r.kind !== 'resolved' || host === null) continue;
          const doEndereco = host.toLowerCase();
          // `app` e `www` são reservados: não nomeiam empresa nenhuma, então
          // resolver para outra coisa ali é correto.
          if (['app', 'www'].includes(doEndereco)) continue;
          assert.equal(
            r.tenant.slug.toLowerCase(),
            doEndereco,
            `endereço ${host} resolveu para ${r.tenant.slug}`,
          );
        }
      }
    }
  });

  it('nunca devolve uma empresa fora da lista recebida', () => {
    const entradas = [null, 'acme', 'bravo', 'zulu'];
    for (const host of entradas) {
      for (const cookie of entradas) {
        const r = chooseTenant([acme], host, cookie);
        if (r.kind === 'resolved') assert.equal(r.tenant.id, acme.id);
        if (r.kind === 'choose') {
          for (const o of r.options) assert.equal(o.id, acme.id);
        }
      }
    }
  });
});
