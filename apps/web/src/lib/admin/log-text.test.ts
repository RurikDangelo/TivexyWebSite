/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detalheDoRegistro } from './log-text.ts';

const nome = (c: string) => ({ erp: 'ERP', inventory: 'Estoque' })[c] ?? c;

describe('detalheDoRegistro', () => {
  it('troca de plano diz de onde, para onde, e o que ligou', () => {
    assert.equal(
      detalheDoRegistro(
        'tenant.plan_changed',
        { de: 'essencial', para: 'profissional', ligados: ['erp', 'inventory'], desligados: [] },
        nome,
      ),
      'essencial → profissional · ligou ERP, Estoque',
    );
  });

  it('edição diz só o que mudou, com o documento formatado', () => {
    assert.equal(
      detalheDoRegistro(
        'tenant.updated',
        {
          antes: { nome: 'Café', razao_social: null, documento: null },
          depois: { nome: 'Café', razao_social: null, documento: '12345678000195' },
        },
        nome,
      ),
      'documento: vazio → 12.345.678/0001-95',
    );
  });

  it('suspensão mostra o motivo; ação sem detalhe devolve null', () => {
    assert.equal(
      detalheDoRegistro('tenant.suspended', { motivo: 'Pagamento' }, nome),
      'Motivo: Pagamento',
    );
    assert.equal(detalheDoRegistro('tenant.reactivated', {}, nome), null);
  });
});
