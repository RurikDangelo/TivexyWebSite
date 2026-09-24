/**
 * Testes da leitura e da conferência dos formulários do CRM.
 *
 * Estas funções não guardam nenhuma garantia — o banco guarda todas. O que
 * elas produzem é a **mensagem**, e mensagem errada tem sintoma silencioso:
 * o campo certo fica sem marca, a pessoa corrige o campo errado, e o
 * formulário recusa de novo sem explicar.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  conferirEmail,
  conferirSite,
  conferirTelefone,
  mensagemDeErro,
  opcional,
  texto,
} from './form.ts';

/** Um `FormData` como o navegador manda. */
function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.append(chave, valor);
  return form;
}

describe('texto', () => {
  it('tira espaço das pontas', () => {
    assert.equal(texto(formulario({ nome: '  Maria  ' }), 'nome'), 'Maria');
  });

  it('campo ausente é string vazia, não undefined', () => {
    /* Quem chama compara com `''`; `undefined` passaria batido por essa comparação. */
    assert.equal(texto(formulario({}), 'nome'), '');
  });
});

describe('opcional', () => {
  it('vazio vira null, não string vazia', () => {
    /*
     * A distinção que importa: `''` é um valor, conta como preenchido e entra
     * em índice. `null` é ausência, e é o que a coluna opcional espera.
     */
    assert.equal(opcional(formulario({ email: '' }), 'email'), null);
    assert.equal(opcional(formulario({ email: '   ' }), 'email'), null);
    assert.equal(opcional(formulario({}), 'email'), null);
  });

  it('preenchido volta sem espaço', () => {
    assert.equal(opcional(formulario({ email: ' a@b.com ' }), 'email'), 'a@b.com');
  });
});

describe('conferirEmail', () => {
  it('vazio serve — o campo é opcional', () => {
    assert.equal(conferirEmail(''), null);
  });

  it('aceita o que uma pessoa real usa', () => {
    for (const bom of [
      'maria@exemplo.com.br',
      'maria+cobranca@exemplo.com',
      "o'brien@exemplo.com",
      'maria.souza@sub.exemplo.com.br',
    ]) {
      assert.equal(conferirEmail(bom), null, `${bom} deveria passar`);
    }
  });

  it('recusa o erro de digitação óbvio', () => {
    for (const torto of ['maria', 'maria@', '@exemplo.com', 'maria@exemplo', 'a b@c.com']) {
      assert.notEqual(conferirEmail(torto), null, `${torto} deveria ser recusado`);
    }
  });
});

describe('conferirTelefone', () => {
  it('vazio serve', () => {
    assert.equal(conferirTelefone(''), null);
  });

  it('aceita o celular pontuado, que é como as pessoas digitam', () => {
    assert.equal(conferirTelefone('(11) 90000-0000'), null);
    assert.equal(conferirTelefone('+55 11 90000-0000'), null);
    assert.equal(conferirTelefone('3000-0000'), null);
  });

  it('recusa o que é curto demais para ser telefone', () => {
    assert.notEqual(conferirTelefone('1234'), null);
    assert.notEqual(conferirTelefone('abc'), null);
  });
});

describe('conferirSite', () => {
  it('vazio serve', () => {
    assert.equal(conferirSite(''), null);
  });

  it('não exige https — quem digita o domínio está certo', () => {
    for (const bom of [
      'tivexy.com.br',
      'https://tivexy.com.br',
      'http://tivexy.com.br/precos',
      'sub.tivexy.com.br',
    ]) {
      assert.equal(conferirSite(bom), null, `${bom} deveria passar`);
    }
  });

  it('recusa o que não tem ponto nenhum', () => {
    assert.notEqual(conferirSite('tivexy'), null);
    assert.notEqual(conferirSite('https://tivexy'), null);
  });
});

describe('mensagemDeErro', () => {
  it('42501 é negação do RLS e vira texto de permissão', () => {
    const texto = mensagemDeErro(
      { code: '42501', message: 'new row violates row-level security policy' },
      'Você não tem permissão para cadastrar aqui.',
    );
    assert.equal(texto, 'Você não tem permissão para cadastrar aqui.');
  });

  it('o resto chega como veio, e isso é de propósito', () => {
    /*
     * Erro de constraint ou de infraestrutura é defeito nosso. Trocar por
     * texto amigável esconderia do log e do relato de quem usa justamente a
     * informação que permitiria consertar.
     */
    const texto = mensagemDeErro({ code: '23514', message: 'crm_companies_document_digits' }, 'x');
    assert.match(texto, /crm_companies_document_digits/);
  });

  it('erro sem código não é confundido com negação', () => {
    const texto = mensagemDeErro({ message: 'fetch failed' }, 'sem permissão');
    assert.notEqual(texto, 'sem permissão');
  });
});
