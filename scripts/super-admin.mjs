/**
 * Cria — ou promove — um Super Admin da plataforma.
 *
 * É o problema do primeiro usuário. `is_super_admin` só pode ser escrito por
 * quem já é Super Admin: a política existe para impedir que qualquer pessoa
 * autenticada se promova, e ela não abre exceção para a primeira. Então a
 * primeira precisa nascer de fora, com a chave de serviço, uma vez.
 *
 *   node scripts/super-admin.mjs voce@empresa.com.br "Seu Nome"
 *
 * ## Por que imprime um link em vez de mandar e-mail
 *
 * `inviteUserByEmail` depende de SMTP configurado no projeto. O SMTP embutido
 * do Supabase entrega só para membros da equipe e tem limite de poucas
 * mensagens por hora — serve para testar, não para clientes, e é uma pendência
 * externa que não bloqueia isto aqui.
 *
 * `generateLink` produz o mesmo link **sem enviar nada**. O script o imprime no
 * seu terminal, na sua máquina.
 *
 * > O link é credencial: quem o abrir entra como esta conta. Ele vence, e vale
 * > uma vez só. Não cole em chat, em issue nem em log de CI.
 *
 * ## O que ele escreve
 *
 *   auth.users          a identidade, se ainda não existir
 *   public.users        o espelho — criado pelo gatilho `mirror_auth_user`
 *   is_super_admin      posto em `true`, por SQL, com a chave de serviço
 *
 * O gatilho de espelho **não** copia `is_super_admin`, de propósito: o
 * metadado vem do cliente, e copiá-lo inteiro deixaria qualquer pessoa se
 * promover no cadastro. Por isso a promoção é um `update` explícito aqui.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));

/** Uma variável do `.env` da raiz, sem depender de biblioteca. */
function doEnv(chave) {
  if (process.env[chave]) return process.env[chave];
  if (!existsSync(ENV)) return undefined;

  const linha = readFileSync(ENV, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${chave}=`));

  const valor = linha
    ?.slice(chave.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
  return valor === '' ? undefined : valor;
}

function exigir(chave) {
  const valor = doEnv(chave);
  if (valor === undefined) {
    console.error(`${chave} não está no .env da raiz. Ver .env.example.`);
    process.exit(1);
  }
  return valor;
}

const [, , emailBruto, nomeBruto] = process.argv;

if (emailBruto === undefined) {
  console.error(
    'Uso: node scripts/super-admin.mjs <email> [nome]\n\n' +
      'Cria a conta se não existir, marca como Super Admin e imprime um link de acesso.',
  );
  process.exit(1);
}

const email = emailBruto.trim().toLowerCase();
const nome = nomeBruto?.trim() ?? email.split('@')[0];

const url = exigir('SUPABASE_URL');
const chaveSecreta = exigir('SUPABASE_SECRET_KEY');

/**
 * Uma chamada à Auth Admin API.
 *
 * `fetch` cru em vez do SDK: este script roda fora do app, e puxar o
 * `@supabase/supabase-js` de dentro de `apps/web` para um script da raiz
 * acoplaria os dois por um caminho relativo que quebra na primeira mudança de
 * estrutura.
 */
async function auth(caminho, opcoes = {}) {
  const resposta = await fetch(`${url}/auth/v1${caminho}`, {
    ...opcoes,
    headers: {
      apikey: chaveSecreta,
      Authorization: `Bearer ${chaveSecreta}`,
      'Content-Type': 'application/json',
      ...opcoes.headers,
    },
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(`${caminho} respondeu ${resposta.status}: ${corpo.msg ?? corpo.error ?? ''}`);
  }
  return corpo;
}

/** A identidade, criando-a se preciso. */
async function garantirConta() {
  const lista = await auth(`/admin/users?filter=${encodeURIComponent(email)}`);
  const existente = (lista.users ?? []).find((u) => u.email?.toLowerCase() === email);
  if (existente !== undefined) return { id: existente.id, criada: false };

  const nova = await auth('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      /*
       * Confirmado na criação: sem isto a conta nasce pendente e o login
       * responde `email_not_confirmed`, que aqui só produziria um segundo
       * e-mail que também não seria enviado.
       */
      email_confirm: true,
      user_metadata: { full_name: nome },
    }),
  });

  return { id: nova.id, criada: true };
}

/**
 * A promoção, por SQL.
 *
 * Não há endpoint para isto: `is_super_admin` é coluna de `public.users`, que é
 * tabela da aplicação. `scripts/db-url.mjs` já resolve as duas armadilhas da
 * string de conexão do painel.
 */
async function promover(id) {
  const { connectionUrl } = await import('./db-url.mjs');
  /* Içado para a raiz pelo workspace — o caminho de apps/web quebraria se deixasse de ser. */
  const postgres = (await import('postgres')).default;

  const sql = postgres(connectionUrl('DIRECT_URL'), { prepare: false, max: 1 });
  try {
    const linhas = await sql`
      update public.users set is_super_admin = true where id = ${id}
      returning id, email, is_super_admin
    `;
    if (linhas.length === 0) {
      throw new Error(
        'a identidade existe em auth.users e não há linha em public.users. ' +
          'O gatilho mirror_auth_user pode não estar aplicado — rode npm run db:push.',
      );
    }
    return linhas[0];
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** O link de acesso, gerado sem enviar e-mail. */
async function linkDeAcesso() {
  const corpo = await auth('/admin/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  return corpo.action_link ?? null;
}

const conta = await garantirConta();
const perfil = await promover(conta.id);
const link = await linkDeAcesso();

console.log(
  [
    '',
    `${conta.criada ? 'Conta criada' : 'Conta já existia'}: ${perfil.email}`,
    `Super Admin: ${perfil.is_super_admin === true ? 'sim' : 'NÃO — a atualização não pegou'}`,
    '',
    'Link de acesso — vale uma vez e vence. É credencial: não compartilhe.',
    '',
    `  ${link ?? '(não consegui gerar; use "Esqueci a senha" em /entrar)'}`,
    '',
    'Depois de entrar, defina uma senha em /definir-senha.',
    '',
  ].join('\n'),
);
