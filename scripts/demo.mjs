/**
 * Monta um cenário de demonstração no projeto real, para olhar o sistema.
 *
 * Existe porque não dá para "ver como está ficando" sem cliente e sem dado: a
 * tela de leads vazia e a lista de clientes vazia mostram os estados vazios, e
 * mais nada. Isto cria um cliente provisionado pelo Blueprint da clínica —
 * que é o que torna visível o vocabulário do nicho — e alguns leads.
 *
 *   node scripts/demo.mjs seu@email.com     monta e imprime o link de acesso
 *   node scripts/demo.mjs --limpar          remove tudo que ele criou
 *
 * ## O que ele NÃO faz
 *
 * Não inventa número de faturamento, não cria oportunidade fechada, não
 * preenche gráfico. Os nomes carregam "Demo" e os e-mails usam `.invalid`,
 * que é um TLD reservado justamente para nunca resolver — nenhum e-mail sai
 * daqui por acidente.
 *
 * Tudo o que ele cria sai com `--limpar`. Nada disto é dado de produção, e
 * nenhuma tela deve tratá-lo como tal.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { connectionUrl } from './db-url.mjs';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));
const SLUG = 'demo-sorriso';
const ADMIN_DEMO = 'responsavel@demo-sorriso.invalid';

/** Onde o app está rodando. O link de acesso precisa voltar para cá. */
const APP = process.env.TIVEXY_APP_URL ?? 'http://localhost:4390';

function doEnv(chave) {
  if (process.env[chave]) return process.env[chave];
  const linha = readFileSync(ENV, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${chave}=`));
  return linha
    ?.slice(chave.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
}

const URL_SUPABASE = doEnv('SUPABASE_URL');
const CHAVE = doEnv('SUPABASE_SECRET_KEY');
const CABECALHOS = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
  'Content-Type': 'application/json',
};

async function auth(caminho, opcoes = {}) {
  const resposta = await fetch(`${URL_SUPABASE}/auth/v1${caminho}`, {
    ...opcoes,
    headers: { ...CABECALHOS, ...opcoes.headers },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${caminho}: ${resposta.status} ${corpo.msg ?? ''}`);
  return corpo;
}

async function contaPorEmail(email) {
  const lista = await auth(`/admin/users?filter=${encodeURIComponent(email)}`);
  return (lista.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

const sql = postgres(connectionUrl('DIRECT_URL'), { prepare: false, max: 2 });
const db = {
  async query(texto, params = []) {
    return { rows: await sql.unsafe(texto, params) };
  },
};

async function limpar() {
  const [t] = await sql`select id from public.tenants where slug = ${SLUG}`;
  if (t !== undefined) {
    // O cascade do tenant leva o CRM junto; estas três não têm cascade.
    await sql`delete from public.tenant_users where tenant_id = ${t.id}`;
    await sql`delete from public.audit_logs where tenant_id = ${t.id}`;
    await sql`delete from public.tenants where id = ${t.id}`;
    console.log('removido o cliente de demonstração');
  }
  const conta = await contaPorEmail(ADMIN_DEMO);
  if (conta !== null) {
    await fetch(`${URL_SUPABASE}/auth/v1/admin/users/${conta.id}`, {
      method: 'DELETE',
      headers: CABECALHOS,
    });
    console.log('removida a conta de demonstração');
  }
  console.log('\nSua conta de Super Admin não foi tocada — ela não é dado de demonstração.');
}

async function montar(email) {
  const { blueprintByCode } = await import('../packages/core/src/blueprint-registry.ts');
  const { planProvisioning } = await import('../packages/core/src/provisioning-plan.ts');
  const { executeProvisioning } = await import('../apps/web/src/server/provisioning/execute.ts');

  /* 1. Você, como Super Admin. Sem senha: o acesso é por link de uso único. */
  let voce = await contaPorEmail(email);
  if (voce === null) {
    voce = await auth('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, email_confirm: true }),
    });
    console.log(`conta criada para ${email}`);
  }
  await sql`update public.users set is_super_admin = true where id = ${voce.id}`;

  /* 2. Um cliente provisionado pelo Blueprint, com o executor de produção. */
  const [existente] = await sql`select id from public.tenants where slug = ${SLUG}`;
  let tenantId = existente?.id;

  if (tenantId === undefined) {
    const bp = blueprintByCode('clinica-odontologica');
    const { rows: modulos } = await db.query(
      `select m.code from public.plan_modules pm
       join public.plans p   on p.id = pm.plan_id
       join public.modules m on m.id = pm.module_id
       where p.code = $1`,
      [bp.plan],
    );

    const entrada = {
      slug: SLUG,
      name: 'Clínica Sorriso (Demo)',
      admin: { email: ADMIN_DEMO, fullName: 'Responsável Demo' },
    };
    const plano = planProvisioning({
      blueprint: bp,
      planModules: modulos.map((r) => r.code),
      ...entrada,
    });
    if (!plano.ok) throw new Error(JSON.stringify(plano.problems));

    const identidade = {
      async ensureUser({ email: e, fullName }) {
        const achado = await contaPorEmail(e);
        if (achado !== null) return { id: achado.id, created: false };
        const nova = await auth('/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            email: e,
            email_confirm: false,
            user_metadata: { full_name: fullName },
          }),
        });
        return { id: nova.id, created: true };
      },
      async deleteUser(id) {
        await fetch(`${URL_SUPABASE}/auth/v1/admin/users/${id}`, {
          method: 'DELETE',
          headers: CABECALHOS,
        });
      },
    };

    const r = await executeProvisioning(db, identidade, {
      operations: plano.operations,
      blueprint: { code: bp.code, version: bp.version },
      idempotencyKey: `demo-${SLUG}`,
      requestedBy: voce.id,
      request: entrada,
    });
    if (!r.ok) throw new Error(`provisionamento parou em ${r.failedStep}: ${r.error}`);
    tenantId = r.tenantId;
    console.log('cliente provisionado pelo Blueprint da clínica odontológica');
  }

  /* 3. Você entra nesse cliente, para ver as duas visões com um login só. */
  const [papel] = await sql`
    select id from public.roles where tenant_id is null and code = 'tenant_admin'`;
  await sql`
    insert into public.tenant_users (tenant_id, user_id, role_id, status, joined_at)
    values (${tenantId}, ${voce.id}, ${papel.id}, 'active', now())
    on conflict (tenant_id, user_id) do update set status = 'active', joined_at = now()`;

  /* 4. Alguns interessados, em estados diferentes, para a fila não estar vazia. */
  const [{ n }] = await sql`
    select count(*)::int as n from public.crm_leads where tenant_id = ${tenantId}`;
  if (n === 0) {
    await sql`
      insert into public.crm_leads (tenant_id, name, email, phone, company_name, source, status)
      values
        (${tenantId}, 'Joana Ribeiro', 'joana@demo.invalid', '11988887777',
         'Convênio Bom Dente', 'Indicação', 'qualified'),
        (${tenantId}, 'Carlos Menezes', 'carlos@demo.invalid', '11977776666',
         null, 'Instagram', 'contacted'),
        (${tenantId}, 'Beatriz Alves', 'beatriz@demo.invalid', null,
         'Metalúrgica Alves', 'Feira', 'new'),
        (${tenantId}, 'Rogério Pinto', null, '11966665555',
         null, 'Passou na frente', 'new')`;
    console.log('quatro interessados na fila, em estados diferentes');
  }

  const link = await auth('/admin/generate_link', {
    method: 'POST',
    /*
     * O destino precisa ser dito. Sem `redirect_to`, o Supabase manda para o
     * Site URL do projeto — que não é esta máquina —, e o link abriria em
     * outro lugar ou em lugar nenhum.
     */
    body: JSON.stringify({
      type: 'magiclink',
      email,
      redirect_to: `${APP}/auth/callback`,
    }),
  });

  console.log(
    [
      '',
      '─────────────────────────────────────────────────────────────',
      `  Abra: ${link.action_link ?? '(não consegui gerar o link)'}`,
      '─────────────────────────────────────────────────────────────',
      '',
      '  Vale uma vez e vence. É credencial — não cole em lugar nenhum.',
      '',
      '  Depois de entrar, o sistema está em http://localhost:4390',
      '',
      '    /admin        a lista de clientes da plataforma',
      '    /crm/leads    a fila do cliente — repare que ela diz "Interessados"',
      '    /painel       o estado da plataforma',
      '',
      '  Para apagar tudo isto:  node scripts/demo.mjs --limpar',
      '',
    ].join('\n'),
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  try {
    if (arg === '--limpar') await limpar();
    else if (arg === undefined || arg.startsWith('--')) {
      console.error('Uso: node scripts/demo.mjs <seu-email>   |   node scripts/demo.mjs --limpar');
      process.exitCode = 1;
    } else await montar(arg.trim().toLowerCase());
  } finally {
    await sql.end({ timeout: 5 });
  }
}
