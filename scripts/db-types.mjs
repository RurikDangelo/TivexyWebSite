/**
 * Gera `apps/web/src/lib/database.types.ts` a partir do projeto real.
 *
 * Usa `--project-id`, que fala com a API do Supabase. **Sem Docker** — o
 * caminho `--db-url` sobe um contêiner para inspecionar o esquema, e este
 * projeto não usa contêiner para nada.
 *
 * Duas coisas que o comando cru não faz, e que justificam o script:
 *
 * **1. Não escreve por cima quando falha.** `comando > arquivo` cria o arquivo
 * antes de o comando rodar: se o CLI falhar, o erro em JSON vai parar dentro do
 * `database.types.ts` e o typecheck quebra com uma mensagem sobre sintaxe que
 * não tem nada a ver com a causa. Aconteceu. Aqui a saída é conferida antes de
 * tocar o disco.
 *
 * **2. Diz o que fazer quando falta credencial.** `gen types` precisa de um
 * token de acesso, e o erro do CLI não é óbvio para quem nunca fez login.
 *
 *   npm run db:types
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));
const DESTINO = fileURLToPath(new URL('../apps/web/src/lib/database.types.ts', import.meta.url));

/** O ref do projeto, lido da URL — não fixo no código. */
function projectRef() {
  if (!existsSync(ENV)) {
    throw new Error('Não há .env na raiz. Veja .env.example.');
  }

  const linha = readFileSync(ENV, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('SUPABASE_URL='));

  const url = linha
    ?.slice('SUPABASE_URL='.length)
    .trim()
    .replace(/^["']|["']$/g, '');
  const ref = url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

  if (ref === undefined) {
    throw new Error('SUPABASE_URL do .env não tem a forma https://<ref>.supabase.co');
  }
  return ref;
}

/** O token de acesso, se estiver no ambiente ou no `.env`. */
function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  if (!existsSync(ENV)) return undefined;

  const linha = readFileSync(ENV, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='));

  const valor = linha
    ?.slice('SUPABASE_ACCESS_TOKEN='.length)
    .trim()
    .replace(/^["']|["']$/g, '');
  return valor === '' ? undefined : valor;
}

const ref = projectRef();
const token = accessToken();

const resultado = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--project-id', ref, '--schema', 'public'],
  {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: token === undefined ? process.env : { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  },
);

const saida = resultado.stdout ?? '';

/*
 * O CLI devolve erro em JSON pelo stdout e ainda assim sai com status zero em
 * alguns casos. Confiar no código de saída deixaria o erro virar o arquivo —
 * então o que decide é o conteúdo parecer TypeScript.
 */
const pareceTypeScript =
  saida.includes('export type Database') || saida.includes('export type Json');

if (!pareceTypeScript) {
  const erro = (resultado.stderr || saida || '').trim();

  if (/access token|not logged in|Unauthorized|401/i.test(erro)) {
    console.error(
      'Falta credencial para falar com a API do Supabase.\n\n' +
        '  npx supabase login\n\n' +
        'Ou, para rodar sem interação (CI, por exemplo), gere um token em\n' +
        'https://supabase.com/dashboard/account/tokens e coloque no .env:\n\n' +
        '  SUPABASE_ACCESS_TOKEN=sbp_...\n',
    );
  } else {
    console.error(`Não consegui gerar os tipos do projeto ${ref}:\n\n${erro}\n`);
  }

  console.error('O arquivo existente não foi alterado.');
  process.exit(1);
}

writeFileSync(DESTINO, saida);

const linhas = saida.split('\n').length;
const tabelas = [...saida.matchAll(/^ {6}([a-z_]+): \{$/gm)].length;
console.log(
  `database.types.ts gerado do projeto ${ref} — ${linhas} linhas, ${tabelas} definições.`,
);
