/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { campoRepetido, parseProductInput } from './product-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const minimo = { nome: 'Café coado', unidade: 'un', preco: '5,50' };

describe('parseProductInput', () => {
  it('nome, unidade e preço bastam', () => {
    const r = parseProductInput(form(minimo));
    assert.ok(r.ok);
    assert.equal(r.valor.precoCentavos, 550);
    assert.equal(r.valor.custoCentavos, null);
    assert.equal(r.valor.controlaEstoque, null, 'sem o interruptor na tela, não mexe');
  });

  it('preço é obrigatório, mas zero vale — brinde existe', () => {
    const vazio = parseProductInput(form({ ...minimo, preco: '' }));
    assert.ok(!vazio.ok);
    assert.match(vazio.campos.preco ?? '', /0,00/);

    const zero = parseProductInput(form({ ...minimo, preco: '0' }));
    assert.ok(zero.ok);
    assert.equal(zero.valor.precoCentavos, 0);
  });

  it('dinheiro no formato brasileiro; o resto é recusado, não zerado', () => {
    const r = parseProductInput(form({ ...minimo, preco: '1.234,56', custo: '800' }));
    assert.ok(r.ok);
    assert.equal(r.valor.precoCentavos, 123456);
    assert.equal(r.valor.custoCentavos, 80000);

    const torto = parseProductInput(form({ ...minimo, custo: 'R$ oito' }));
    assert.ok(!torto.ok);
    assert.match(torto.campos.custo ?? '', /1\.234,56/);
  });

  it('unidade fora da lista é recusada', () => {
    const r = parseProductInput(form({ ...minimo, unidade: 'caixa' }));
    assert.ok(!r.ok);
    assert.ok(r.campos.unidade !== undefined);
  });

  it('o interruptor de estoque só vale quando estava na tela', () => {
    const ligado = parseProductInput(
      form({ ...minimo, controlaEstoqueNaTela: '1', controlaEstoque: 'on' }),
    );
    assert.ok(ligado.ok);
    assert.equal(ligado.valor.controlaEstoque, true);

    const desligado = parseProductInput(form({ ...minimo, controlaEstoqueNaTela: '1' }));
    assert.ok(desligado.ok);
    assert.equal(desligado.valor.controlaEstoque, false);
  });

  it('mínimo de estoque respeita a unidade; zero é "sem mínimo"', () => {
    const fracao = parseProductInput(form({ ...minimo, estoqueMinimo: '1,5' }));
    assert.ok(!fracao.ok);
    assert.match(fracao.campos.estoqueMinimo ?? '', /fração/);

    const kg = parseProductInput(form({ ...minimo, unidade: 'kg', estoqueMinimo: '1,5' }));
    assert.ok(kg.ok);
    assert.equal(kg.valor.estoqueMinimo, 1.5);

    const zero = parseProductInput(form({ ...minimo, estoqueMinimo: '0' }));
    assert.ok(zero.ok);
    assert.equal(zero.valor.estoqueMinimo, null);
  });

  it('produto que não controla estoque não guarda mínimo', () => {
    const r = parseProductInput(
      form({ ...minimo, controlaEstoqueNaTela: '1', estoqueMinimo: '10' }),
    );
    assert.ok(r.ok);
    assert.equal(r.valor.estoqueMinimo, null);
  });

  it('código de barras sai sem espaços; com símbolo é recusado', () => {
    const r = parseProductInput(form({ ...minimo, codigoDeBarras: '789 1234 567890' }));
    assert.ok(r.ok);
    assert.equal(r.valor.codigoDeBarras, '7891234567890');

    const torto = parseProductInput(form({ ...minimo, codigoDeBarras: '789/12' }));
    assert.ok(!torto.ok);
  });

  it('categoria com formato torto vira "sem categoria", não erro de banco', () => {
    const r = parseProductInput(form({ ...minimo, categoria: 'não-é-uuid' }));
    assert.ok(r.ok);
    assert.equal(r.valor.categoriaId, null);
  });
});

describe('campoRepetido', () => {
  it('lê o índice na mensagem do banco', () => {
    assert.equal(
      campoRepetido('duplicate key value violates unique constraint "erp_products_sku_per_tenant"'),
      'sku',
    );
    assert.equal(
      campoRepetido('... unique constraint "erp_products_barcode_per_tenant"'),
      'codigoDeBarras',
    );
    assert.equal(campoRepetido('outra coisa'), null);
    assert.equal(campoRepetido(null), null);
  });
});
