/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dbErrorMessage } from './db-errors.ts';

describe('dbErrorMessage', () => {
  it('a frase escrita pelo esquema chega, com maiúscula e ponto', () => {
    assert.equal(
      dbErrorMessage({ code: 'P0001', message: 'a venda nº 3 já está cancelada' }),
      'A venda nº 3 já está cancelada.',
    );
  });

  it('as mensagens do ERP chegam como foram escritas', () => {
    for (const mensagem of [
      '"Café coado" se vende por un, sem fração',
      '"Sacola" está desativado e não entra em venda',
      '"Pix" está desativada e não recebe venda',
      '"Sacola" não controla estoque',
      'produto não encontrado',
      'forma de pagamento não encontrada',
      'esta empresa exige cliente identificado em toda venda',
      'os pagamentos somam 1000 centavos, e a venda é de 1100',
      'o desconto precisa ficar entre zero e o valor dos itens',
      'diga o motivo do cancelamento',
      'lançamento pago não se cancela; desfaça a baixa antes',
      'este lançamento veio da venda nº 1; para cancelar, cancele a venda',
      'a data do pagamento não pode estar no futuro',
      'a contagem precisa ser zero ou mais',
    ]) {
      const traduzida = dbErrorMessage({ code: '23514', message: mensagem });
      assert.equal(traduzida.toLowerCase().replace(/\.$/, ''), mensagem.toLowerCase(), mensagem);
    }
  });

  it('infraestrutura não vaza: nome de constraint vira frase genérica', () => {
    const r = dbErrorMessage({
      code: '23514',
      message:
        'new row for relation "erp_products" violates check constraint "erp_products_unit_known"',
    });
    assert.doesNotMatch(r, /erp_products/);
  });

  it('chave estrangeira e unicidade têm resposta própria', () => {
    assert.match(dbErrorMessage({ code: '23503', message: 'x' }), /ligados/);
    assert.equal(dbErrorMessage({ code: '23505', message: 'x' }, 'Repetido.'), 'Repetido.');
  });
});
