/**
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeWebsite, parseCompanyInput } from './company-input.ts';

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe('normalizeWebsite', () => {
  it('põe o esquema que faltava — sem ele o link seria relativo ao Tivexy', () => {
    assert.equal(normalizeWebsite('exemplo.com.br'), 'https://exemplo.com.br');
    assert.equal(normalizeWebsite('http://exemplo.com.br/'), 'http://exemplo.com.br');
    assert.equal(
      normalizeWebsite('https://loja.exemplo.com/contato'),
      'https://loja.exemplo.com/contato',
    );
  });

  it('recusa o que não é site — `javascript:` num link clicável é a porta clássica', () => {
    for (const torto of ['javascript:alert(1)', 'ftp://exemplo.com', 'localhost', 'não é site']) {
      assert.equal(normalizeWebsite(torto), null, torto);
    }
  });
});

describe('parseCompanyInput', () => {
  it('só o nome basta', () => {
    const r = parseCompanyInput(form({ nome: 'Padaria do Bairro' }));
    assert.ok(r.ok);
    assert.equal(r.valor.documento, null);
    assert.equal(r.valor.site, null);
  });

  it('CNPJ alfanumérico entra limpo', () => {
    const r = parseCompanyInput(form({ nome: 'Nova', documento: '12.ABC.345/01DE-35' }));
    assert.ok(r.ok);
    assert.equal(r.valor.documento, '12ABC34501DE35');
  });

  it('todos os problemas de uma vez', () => {
    const r = parseCompanyInput(
      form({ nome: '', documento: '11.222.333/0001-82', site: 'javascript:x', email: 'y' }),
    );
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.campos).sort(), ['documento', 'email', 'nome', 'site']);
  });
});
