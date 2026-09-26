/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TenantOption } from './active-tenant.ts';
import { acceptErrorMessage, invitationsOf } from './invitations.ts';

const empresa = (
  id: string,
  membership: TenantOption['membership'],
  status: TenantOption['status'] = 'active',
): TenantOption => ({ id, slug: id, name: id.toUpperCase(), status, membership });

describe('invitationsOf', () => {
  it('separa convite de suspensão — um tem botão, o outro não', () => {
    const v = invitationsOf(
      [empresa('a', 'invited'), empresa('b', 'suspended'), empresa('c', 'active')],
      null,
    );
    assert.deepEqual(
      v.pendentes.map((o) => o.id),
      ['a'],
    );
    assert.deepEqual(
      v.suspensos.map((o) => o.id),
      ['b'],
    );
  });

  it('a empresa que a pessoa tentou abrir vem primeiro', () => {
    const v = invitationsOf(
      [empresa('acme', 'invited'), empresa('bravo', 'invited'), empresa('delta', 'invited')],
      'delta',
    );
    assert.deepEqual(
      v.pendentes.map((o) => o.id),
      ['delta', 'acme', 'bravo'],
    );
  });

  it('empresa cancelada não oferece aceitar — a função do banco recusaria', () => {
    const v = invitationsOf([empresa('fechada', 'invited', 'cancelled')], null);
    assert.deepEqual(v.pendentes, []);
  });

  it('empresa ainda em preparo oferece: a pessoa aceita e espera como membro', () => {
    const v = invitationsOf([empresa('nova', 'invited', 'provisioning')], null);
    assert.equal(v.pendentes.length, 1);
  });

  it('sem nada pendente, as duas listas vêm vazias', () => {
    assert.deepEqual(invitationsOf([empresa('x', 'active')], 'x'), {
      pendentes: [],
      suspensos: [],
    });
  });
});

describe('acceptErrorMessage', () => {
  it('repassa o que o banco escreveu para gente, como frase', () => {
    assert.equal(acceptErrorMessage('convite não encontrado'), 'Convite não encontrado.');
    assert.equal(
      acceptErrorMessage('Acme não está mais ativa na Tivexy'),
      'Acme não está mais ativa na Tivexy.',
    );
  });

  it('erro de infraestrutura não chega na tela', () => {
    for (const bruto of [
      'fetch failed',
      'relation "public.tenant_users" does not exist',
      '',
      null,
      undefined,
    ]) {
      assert.equal(
        acceptErrorMessage(bruto),
        'Não consegui aceitar agora. Tente de novo em instantes.',
        String(bruto),
      );
    }
  });
});
