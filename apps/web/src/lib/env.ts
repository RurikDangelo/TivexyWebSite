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
 * Prefixos do formato novo de chave do Supabase.
 *
 * O formato antigo era JWT dos dois lados — `anon` e `service_role` eram
 * indistinguíveis a olho nu, e a única forma de saber qual era qual era
 * decodificar. O novo diz no prefixo, e é isso que torna possível recusar uma
 * chave que está na variável errada.
 */
const PREFIXO_PUBLICAVEL = 'sb_publishable_';
const PREFIXO_SECRETO = 'sb_secret_';

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
  /*
   * Uma chave secreta aqui não é "configuração incompleta", é vazamento: esta
   * variável carrega o prefixo NEXT_PUBLIC_, então o valor vai inteiro para o
   * pacote do navegador. Tratá-la como ausente é o que impede o app de subir
   * servindo a chave que abre todos os tenants de uma vez.
   */
  if (publishableKey === null || publishableKey.startsWith(PREFIXO_SECRETO)) {
    missing.push(SUPABASE_KEY_VAR);
  }

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

/* ── A chave secreta ──────────────────────────────────────────────────── */

export const SUPABASE_SECRET_VAR = 'SUPABASE_SECRET_KEY';

/**
 * A chave secreta, para o que precisa ignorar o RLS.
 *
 * **Dois enganos trocam de lugar com facilidade, e os dois são silenciosos.**
 * Esta função existe para transformar os dois em erro na inicialização:
 *
 * **1. A publicável no lugar da secreta.** O cliente administrativo nasceria
 * sujeito ao RLS. Provisionar falharia com "linha não encontrada" em vez de
 * "sem permissão", e a causa não estaria em lugar nenhum da mensagem.
 *
 * **2. A secreta no lugar da publicável.** Esta é a grave: a chave iria para o
 * pacote do navegador com o prefixo `NEXT_PUBLIC_`, e qualquer visitante
 * leria o banco inteiro — todos os tenants, todos os clientes. Por isso
 * `readSupabaseConfig()` também recusa uma chave secreta, logo abaixo.
 *
 * Nenhuma das mensagens repete o valor lido. Erro de inicialização vai parar
 * em log de build, e log de build é lido por gente que não deveria ver a chave.
 */
export function requireSecretKey(env: Env = process.env): string {
  const valor = ler(env, SUPABASE_SECRET_VAR);

  if (valor === null) {
    throw new Error(
      `${SUPABASE_SECRET_VAR} não está definida. Ela ignora o RLS e só existe no ` +
        'servidor — em desenvolvimento vem do .env.local; em produção, das ' +
        'variáveis da Vercel, sem o prefixo NEXT_PUBLIC_.',
    );
  }

  if (valor.startsWith(PREFIXO_PUBLICAVEL)) {
    throw new Error(
      `${SUPABASE_SECRET_VAR} contém a chave publicável (${PREFIXO_PUBLICAVEL}…). ` +
        `Ela é sujeita ao RLS e não serve para provisionar. A secreta começa com ` +
        `${PREFIXO_SECRETO} e está em Project Settings → API.`,
    );
  }

  return valor;
}

/** A chave secreta está configurada? Para painel de diagnóstico, não para fluxo. */
export function hasSecretKey(env: Env = process.env): boolean {
  try {
    requireSecretKey(env);
    return true;
  } catch {
    return false;
  }
}
