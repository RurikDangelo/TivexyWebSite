/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseContactInput } from './contact-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const livre = { exigirDocumento: false };
const clinica = { exigirDocumento: true };

describe('parseContactInput', () => {
  it('só o nome basta quando a empresa não exige documento', () => {
    const r = parseContactInput(form({ nome: 'Maria' }), livre);
    assert.ok(r.ok);
    assert.equal(r.valor.documento, null);
  });

  it('a clínica exige documento — e diz que é regra da empresa', () => {
    const r = parseContactInput(form({ nome: 'Maria' }), clinica);
    assert.ok(!r.ok);
    assert.match(r.campos.documento ?? '', /Obrigatório nesta empresa/);
  });

  it('o documento sai limpo, pronto para a constraint', () => {
    const r = parseContactInput(form({ nome: 'Maria', documento: '529.982.247-25' }), clinica);
    assert.ok(r.ok);
    assert.equal(r.valor.documento, '52998224725');
  });

  it('CNPJ alfanumérico de pessoa jurídica também entra', () => {
    const r = parseContactInput(form({ nome: 'MEI', documento: '12.ABC.345/01DE-35' }), livre);
    assert.ok(r.ok);
    assert.equal(r.valor.documento, '12ABC34501DE35');
  });

  it('dígito errado é erro no campo, com a razão', () => {
    const r = parseContactInput(form({ nome: 'Maria', documento: '529.982.247-26' }), livre);
    assert.ok(!r.ok);
    assert.match(r.campos.documento ?? '', /dígito verificador/);
  });

  it('e-mail vai em minúscula — é o que se compara depois', () => {
    const r = parseContactInput(form({ nome: 'Maria', email: 'Maria@Exemplo.COM' }), livre);
    assert.ok(r.ok);
    assert.equal(r.valor.email, 'maria@exemplo.com');
  });

  it('todos os problemas de uma vez', () => {
    const r = parseContactInput(
      form({ nome: '', email: 'x', telefone: '12', documento: '1' }),
      livre,
    );
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.campos).sort(), ['documento', 'email', 'nome', 'telefone']);
  });
});
