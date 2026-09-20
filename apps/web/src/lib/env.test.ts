/**
 * Testes da leitura de ambiente.
 *
 * Passam um objeto de ambiente explícito em vez de mexer em `process.env`:
 * teste que altera estado global falha diferente dependendo da ordem em que
 * roda, e essa é a pior categoria de teste instável.
 *
 *   npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPABASE_KEY_VAR,
  SUPABASE_URL_VAR,
  isSupabaseConfigured,
  readSupabaseConfig,
  requireSupabaseConfig,
} from './env.ts';

const completo = {
  [SUPABASE_URL_VAR]: 'https://lddpqizqjvtimxmorxux.supabase.co',
  [SUPABASE_KEY_VAR]: 'sb_publishable_exemplo',
};

describe('configuração completa', () => {
  it('devolve a URL e a chave', () => {
    const estado = readSupabaseConfig(completo);
    assert.equal(estado.configured, true);
    assert.deepEqual(estado.configured && estado.config, {
      url: 'https://lddpqizqjvtimxmorxux.supabase.co',
      publishableKey: 'sb_publishable_exemplo',
    });
  });

  it('apara espaço em volta — colar valor do painel traz espaço junto', () => {
    const estado = readSupabaseConfig({
      [SUPABASE_URL_VAR]: '  https://x.supabase.co  ',
      [SUPABASE_KEY_VAR]: '\tchave\n',
    });
    assert.deepEqual(estado.configured && estado.config, {
      url: 'https://x.supabase.co',
      publishableKey: 'chave',
    });
  });

  it('aceita o stack local, que não tem TLS', () => {
    for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321']) {
      assert.equal(readSupabaseConfig({ ...completo, [SUPABASE_URL_VAR]: url }).configured, true);
    }
  });
});

describe('configuração faltando', () => {
  it('ambiente vazio nomeia as duas variáveis', () => {
    const estado = readSupabaseConfig({});
    assert.equal(estado.configured, false);
    assert.deepEqual(estado.configured === false && estado.missing, [
      SUPABASE_URL_VAR,
      SUPABASE_KEY_VAR,
    ]);
  });

  it('variável criada e não preenchida conta como ausente', () => {
    // É o caso mais comum na prática: alguém cadastra na Vercel e deixa vazio.
    for (const vazio of ['', '   ', '\t', '\n']) {
      const estado = readSupabaseConfig({ ...completo, [SUPABASE_KEY_VAR]: vazio });
      assert.equal(estado.configured, false, `${JSON.stringify(vazio)} deveria contar como vazio`);
      assert.deepEqual(estado.configured === false && estado.missing, [SUPABASE_KEY_VAR]);
    }
  });

  it('URL torta é ausência, não configuração ruim', () => {
    for (const torta of [
      'lddpqizqjvtimxmorxux.supabase.co', // sem esquema
      '/api/supabase', // relativa: apontaria para o próprio app
      'http://producao.example', // texto claro fora de localhost
      'ftp://x.supabase.co',
      'javascript:alert(1)',
      'https://',
    ]) {
      const estado = readSupabaseConfig({ ...completo, [SUPABASE_URL_VAR]: torta });
      assert.equal(estado.configured, false, `${torta} deveria ser recusada`);
      assert.deepEqual(estado.configured === false && estado.missing, [SUPABASE_URL_VAR]);
    }
  });
});

describe('exigir configuração', () => {
  it('devolve quando existe', () => {
    assert.equal(requireSupabaseConfig(completo).url, completo[SUPABASE_URL_VAR]);
  });

  it('o erro nomeia o que falta e diz o que fazer', () => {
    assert.throws(() => requireSupabaseConfig({}), {
      message: new RegExp(`${SUPABASE_URL_VAR}.*${SUPABASE_KEY_VAR}.*\\.env\\.example`, 's'),
    });
  });

  it('a mensagem não vaza o valor das variáveis presentes', () => {
    // Erro de configuração costuma ir parar em log agregado.
    try {
      requireSupabaseConfig({ ...completo, [SUPABASE_KEY_VAR]: '' });
      assert.fail('deveria ter lançado');
    } catch (erro) {
      assert.equal((erro as Error).message.includes(completo[SUPABASE_URL_VAR]), false);
    }
  });
});

describe('atalho', () => {
  it('responde sim e não sem lançar', () => {
    assert.equal(isSupabaseConfigured(completo), true);
    assert.equal(isSupabaseConfigured({}), false);
  });
});
