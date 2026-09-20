/**
 * Leitura das variáveis de ambiente, num lugar só.
 *
 * Existe por um motivo específico: **variável ausente precisa falhar cedo e
 * dizer o nome do que falta.** Espalhar `process.env.X!` pelo código produz o
 * pior tipo de erro — `fetch failed` no meio de uma requisição, ou pior, um
 * cliente apontando para `undefined` que só quebra quando alguém tenta entrar.
 *
 * Duas funções de propósito:
 *
 *   readSupabaseConfig()     diz o estado, sem explodir — para quem precisa
 *                            decidir o que fazer quando não há configuração
 *   requireSupabaseConfig()  exige, e a mensagem de erro nomeia o que falta
 *
 * Nenhuma delas guarda valor em módulo. Em runtime de borda o processo é
 * reaproveitado entre requisições, e ler a cada chamada custa quase nada
 * comparado a servir configuração velha depois de um deploy.
 */

/** Só as públicas. A `service_role` nunca passa por aqui. */
export interface SupabaseConfig {
  url: string;
  /** Vai para o navegador. É pública por desenho; quem protege é o RLS. */
  publishableKey: string;
}

export type SupabaseConfigState =
  { configured: true; config: SupabaseConfig } | { configured: false; missing: readonly string[] };

export const SUPABASE_URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL';
export const SUPABASE_KEY_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

type Env = Record<string, string | undefined>;

/**
 * Valor útil, ou nada.
 *
 * String vazia e espaço em branco contam como ausência: é o que a Vercel grava
 * quando alguém cria a variável e esquece de preencher, e tratá-la como
 * presente esconde exatamente o erro que este módulo existe para expor.
 */
function ler(env: Env, nome: string): string | null {
  const bruto = env[nome];
  if (typeof bruto !== 'string') return null;
  const valor = bruto.trim();
  return valor.length > 0 ? valor : null;
}

/**
 * A URL do projeto precisa ser HTTPS absoluta.
 *
 * Um valor tortuoso aqui não é detalhe de formato: `http://` mandaria a sessão
 * em texto claro, e um endereço relativo faria o cliente apontar para o próprio
 * app — que responderia 404 a uma chamada de autenticação, com uma mensagem que
 * não ajuda ninguém a entender o que houve.
 *
 * `http://127.0.0.1` e `http://localhost` são aceitos: é o stack local do
 * Supabase CLI, que não tem TLS.
 */
function urlValida(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

/** O estado da configuração, sem lançar. */
export function readSupabaseConfig(env: Env = process.env): SupabaseConfigState {
  const url = ler(env, SUPABASE_URL_VAR);
  const publishableKey = ler(env, SUPABASE_KEY_VAR);

  const missing: string[] = [];
  if (url === null || !urlValida(url)) missing.push(SUPABASE_URL_VAR);
  if (publishableKey === null) missing.push(SUPABASE_KEY_VAR);

  if (url === null || publishableKey === null || missing.length > 0) {
    return { configured: false, missing };
  }
  return { configured: true, config: { url, publishableKey } };
}

/** Atalho para quem só quer saber se dá para falar com o banco. */
export function isSupabaseConfigured(env: Env = process.env): boolean {
  return readSupabaseConfig(env).configured;
}

/**
 * A configuração, ou um erro que diz o que fazer.
 *
 * Quem chama isto já decidiu que sem Supabase não há o que servir. A mensagem
 * nomeia as variáveis que faltam e aponta o arquivo de exemplo — quem vai ler
 * esse erro provavelmente está num deploy às onze da noite.
 */
export function requireSupabaseConfig(env: Env = process.env): SupabaseConfig {
  const estado = readSupabaseConfig(env);
  if (estado.configured) return estado.config;

  throw new Error(
    `Supabase não configurado: falta ${estado.missing.join(', ')}. ` +
      'Em desenvolvimento, copie apps/web/.env.example para .env.local. ' +
      'Em produção, cadastre as variáveis no projeto da Vercel.',
  );
}
