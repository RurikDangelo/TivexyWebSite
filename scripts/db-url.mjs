/**
 * A URL de conexão do `.env`, em forma que o CLI do Supabase aceita.
 *
 * Existe porque a string que o painel do Supabase entrega quase nunca funciona
 * colada como está, e as duas razões produzem **o mesmo erro**:
 *
 *   FATAL: password authentication failed for user "postgres"
 *
 * Que parece senha errada, e não é. As duas razões:
 *
 * **1. O colchete que sobra.** O painel mostra `[YOUR-PASSWORD]` como marcador.
 * Quem substitui só o miolo deixa o `]` grudado no fim da senha.
 *
 * **2. Caractere reservado.** A senha gerada costuma ter `]`, `*`, `#` ou `?`,
 * que têm significado dentro de uma URL. Sem percent-encoding o servidor
 * recebe a senha truncada no primeiro deles.
 *
 * Nada aqui é impresso em log: a URL vai para stdout e o chamador a passa
 * adiante. Tratar esta saída como segredo é responsabilidade de quem chama.
 *
 *   node scripts/db-url.mjs [DIRECT_URL|DATABASE_URL]
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));

/**
 * @param {'DIRECT_URL' | 'DATABASE_URL'} chave
 * @returns {string}
 */
export function connectionUrl(chave = 'DIRECT_URL') {
  if (!existsSync(ENV)) {
    throw new Error(
      'Não há .env na raiz. A conexão com o banco vem dele, e ele não entra no ' +
        'git — copie os valores do painel do Supabase (Project Settings → Database).',
    );
  }

  const linha = readFileSync(ENV, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${chave}=`));

  if (linha === undefined) {
    throw new Error(`${chave} não está no .env da raiz.`);
  }

  const bruta = linha
    .slice(chave.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');

  // A senha vai até o último `@`: o host não pode conter um, e parar no
  // primeiro cortaria uma senha que tivesse `@` dentro. Mesma regra de
  // apps/web/src/server/connection-url.ts, que tem os testes.
  const partes = bruta.match(/^(postgres(?:ql)?:\/\/[^:@]+:)(.*)(@[^@]+)$/);
  if (partes === null) {
    throw new Error(`${chave} não tem a forma postgresql://usuario:senha@host/banco`);
  }

  const [, inicio, senhaBruta, fim] = partes;

  // O marcador do painel, quando a substituição pegou só o miolo.
  const senha = senhaBruta.replace(/^\[/, '').replace(/\]$/, '');

  if (senha === '' || /^YOUR[-_]?PASSWORD$/i.test(senha)) {
    throw new Error(
      `${chave} ainda tem o marcador de senha do painel. Troque [YOUR-PASSWORD] ` +
        'pela senha real do banco (Project Settings → Database → Reset password).',
    );
  }

  return `${inicio}${encodeURIComponent(senha)}${fim}`;
}

/*
 * Rodar como comando imprime; importar não faz nada.
 *
 * Compara o caminho executado com o deste módulo. A versão ingênua —
 * `import.meta.url.endsWith('db-url.mjs')` — dá verdadeiro também quando o
 * arquivo é importado, e aí `scripts/db.mjs push` tentava ler uma variável de
 * ambiente chamada "push".
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(connectionUrl(process.argv[2]));
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  }
}
