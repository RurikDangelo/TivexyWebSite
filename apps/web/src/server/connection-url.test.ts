/**
 * Testes da normalização da string de conexão.
 *
 * Cada caso aqui corresponde a um erro que já aconteceu de verdade, e todos
 * chegam com a **mesma** mensagem do servidor — `password authentication
 * failed` —, que aponta para a senha e nunca para a causa. É por isso que a
 * normalização precisa de teste e não de confiança.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConnectionUrlError, normalizeConnectionUrl } from './connection-url.ts';

const VAR = 'DATABASE_URL';
const base = (senha: string) =>
  `postgresql://postgres.abcdefgh:${senha}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

/** A senha que a URL normalizada carrega, decodificada de volta. */
function senhaDe(url: string): string {
  const bruta = url.match(/^postgres(?:ql)?:\/\/[^:]+:([^@]*)@/)?.[1] ?? '';
  return decodeURIComponent(bruta);
}

describe('o colchete que sobra', () => {
  it('tira o `]` deixado pela substituição do marcador', () => {
    const url = normalizeConnectionUrl(base('Torre3d*x]'), VAR);
    assert.equal(senhaDe(url), 'Torre3d*x');
  });

  it('tira também o `[` da frente, quando sobra o outro lado', () => {
    assert.equal(senhaDe(normalizeConnectionUrl(base('[Torre3d*x'), VAR)), 'Torre3d*x');
  });

  it('não tira colchete do meio da senha', () => {
    // `a]b` é senha legítima. Tirar o do meio produziria uma senha diferente,
    // e o erro seria idêntico ao de não tirar nada.
    assert.equal(senhaDe(normalizeConnectionUrl(base('a]b'), VAR)), 'a]b');
  });
});

describe('caractere reservado', () => {
  it('codifica os que truncariam a URL', () => {
    for (const senha of ['a#b', 'a?b', 'a/b', 'a*b', 'a b', 'a@b']) {
      const url = normalizeConnectionUrl(base(senha), VAR);
      assert.equal(senhaDe(url), senha, senha);
    }
  });

  it('senha com @ dentro não é cortada no primeiro', () => {
    // O host não pode conter @, então o último é o separador. Parar no
    // primeiro deixaria metade da senha virar nome de host, e o servidor
    // responderia "senha incorreta" para uma senha correta.
    const url = normalizeConnectionUrl(base('pa@ss'), VAR);
    assert.equal(senhaDe(url), 'pa@ss');
    assert.ok(url.endsWith('@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'));
  });

  it('senha já codificada à mão é codificada de novo — e isso é o contrato', () => {
    // Não dá para adivinhar: `Ab%3Fxy` é senha legítima, indistinguível de
    // `Ab?xy` já codificado. A regra documentada em .env.example é colar a
    // senha crua; este teste existe para que ela não mude sem querer.
    assert.equal(senhaDe(normalizeConnectionUrl(base('Torre%23d'), VAR)), 'Torre%23d');
  });
});

describe('recusa em vez de adiar o erro', () => {
  it('marcador intacto', () => {
    assert.throws(() => normalizeConnectionUrl(base('[YOUR-PASSWORD]'), VAR), ConnectionUrlError);
  });

  it('senha vazia', () => {
    assert.throws(() => normalizeConnectionUrl(base(''), VAR), ConnectionUrlError);
  });

  it('não é uma URL de Postgres', () => {
    assert.throws(() => normalizeConnectionUrl('https://exemplo.com', VAR), ConnectionUrlError);
  });

  it('a mensagem nomeia a variável — quem lê está num deploy, não no editor', () => {
    try {
      normalizeConnectionUrl('lixo', 'DIRECT_URL');
      assert.fail('deveria ter lançado');
    } catch (erro) {
      assert.ok(erro instanceof Error && erro.message.includes('DIRECT_URL'));
    }
  });
});

describe('o que não pode mudar', () => {
  it('preserva usuário, host, porta, banco e query', () => {
    const url = normalizeConnectionUrl(
      'postgresql://postgres.abcdefgh:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
      VAR,
    );
    assert.ok(url.startsWith('postgresql://postgres.abcdefgh:'));
    assert.ok(url.endsWith('@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true'));
  });

  it('aceita o esquema curto postgres://', () => {
    const url = normalizeConnectionUrl('postgres://u:s@h:5432/d', VAR);
    assert.equal(url, 'postgres://u:s@h:5432/d');
  });

  it('aspas em volta do valor, como o .env às vezes traz', () => {
    assert.equal(
      normalizeConnectionUrl('"postgres://u:s@h:5432/d"', VAR),
      'postgres://u:s@h:5432/d',
    );
  });
});
