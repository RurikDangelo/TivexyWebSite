/**
 * O executor do provisionamento: transforma o plano em escritas no banco.
 *
 * É a outra metade do movimento que `planProvisioning` começou. A **decisão**
 * já saiu daqui — o que fazer, em que ordem, e o que recusar é do Core, puro e
 * testado sem banco. O que sobrou aqui é só **fazer**, e fazer não decide nada:
 * não há um `if` de regra de negócio neste arquivo.
 *
 * Roda no servidor, com `service_role`, porque provisionar é operação de
 * plataforma: cria tenant, cria usuário, atribui papel. Nenhuma dessas escritas
 * passa pelo RLS — e é por isso que as constraints do esquema importam tanto
 * (ver `docs/12-SECURITY/MULTI_TENANCY.md`, "E vale para o service_role").
 *
 * Recebe o cliente de banco por parâmetro em vez de criá-lo. Dois motivos, e o
 * segundo é o que decidiu: o teste executa este mesmo arquivo contra um
 * Postgres de verdade (PGlite), sem Supabase e sem credencial. O que é provado
 * é o código que vai rodar, não um modelo parecido com ele.
 */

import {
  PROVISIONING_STEPS,
  type ProvisioningOperation,
  type ProvisioningStep,
  type SeedRecord,
  stepOf,
  stepPosition,
} from '@tivexy/core';

/**
 * O mínimo que este módulo precisa de um cliente de banco.
 *
 * Estreito de propósito: quanto menos ele exige, mais coisas podem satisfazê-lo
 * — o cliente do Supabase, uma conexão direta, ou o Postgres em WASM do teste.
 */
export interface SqlClient {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Como nasce uma identidade.
 *
 * **Não dá para criar usuário por SQL**, e isso não é limitação do executor: a
 * identidade vive em `auth.users`, que é do Supabase, e criá-la envolve senha,
 * confirmação de e-mail e convite. Em produção isto é a Auth Admin API.
 * `public.users` é espelho, preenchido pelo gatilho `mirror_auth_user`.
 *
 * Fingir que uma escrita em SQL cria uma conta seria o tipo de atalho que passa
 * no teste e falha na primeira pessoa real. Melhor a fronteira estar nomeada.
 *
 * Devolve o id de uma pessoa que **já pode existir**: quem administra dois
 * clientes é a mesma pessoa, e criar um segundo usuário com o mesmo e-mail
 * partiria a identidade dela em duas.
 */
export interface IdentityPort {
  ensureUser(input: { email: string; fullName: string }): Promise<string>;
}

export interface ExecuteInput {
  operations: readonly ProvisioningOperation[];
  /** De qual documento este tenant nasceu. Fica no registro da execução. */
  blueprint: { code: string; version: number };
  /**
   * A chave do chamador. É o que impede um duplo clique ou um retry de rede de
   * criar dois clientes — e a unicidade é do banco, não deste código.
   */
  idempotencyKey: string;
  /** Quem pediu. Super Admin, ou nulo quando for automação. */
  requestedBy: string | null;
}

export type ExecuteResult =
  | {
      ok: true;
      tenantId: string;
      runId: string;
      /** Já existia com esta chave: nada foi executado de novo. */
      reused: boolean;
      /** Sementes que não puderam ser aplicadas, com o motivo. */
      pendingSeeds: readonly SeedRecord[];
    }
  | {
      ok: false;
      tenantId: string | null;
      runId: string | null;
      failedStep: ProvisioningStep;
      error: string;
    };

/**
 * Entidades de negócio ainda não têm tabela.
 *
 * `crm.pipelines` e `erp.product_categories` não existem — os módulos não
 * foram construídos. As sementes ficam **registradas como pendentes**, com o
 * motivo, em vez de aplicadas. Fingir que semeou é exatamente o que este
 * projeto proíbe, e apagar a semente perderia a especificação do nicho.
 *
 * Quando as tabelas existirem, este conjunto encolhe e a etapa passa a
 * executar. Nada mais no fluxo muda.
 */
const SEED_TARGETS_DISPONIVEIS: ReadonlySet<string> = new Set();

const MOTIVO_SEMENTE_PENDENTE =
  'módulos de negócio ainda não têm tabela — ver docs/PROJECT_STATE.md';

/* ── Auxiliares ───────────────────────────────────────────────────────── */

function texto(valor: unknown): string {
  if (typeof valor !== 'string') throw new Error(`esperava texto do banco, veio ${typeof valor}`);
  return valor;
}

/** A execução já aberta com esta chave, se houver. */
async function execucaoExistente(db: SqlClient, idempotencyKey: string) {
  const { rows } = await db.query(
    `select id, tenant_id, status::text as status
     from public.provisioning_runs where idempotency_key = $1`,
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

/* ── As escritas de cada operação ─────────────────────────────────────── */

interface Contexto {
  tenantId: string | null;
  pendentes: SeedRecord[];
}

async function aplicar(
  db: SqlClient,
  identity: IdentityPort,
  op: ProvisioningOperation,
  ctx: Contexto,
): Promise<void> {
  switch (op.kind) {
    case 'create_tenant': {
      const { rows } = await db.query(
        `insert into public.tenants (slug, name, status, plan_id, settings)
         values ($1, $2, 'provisioning', (select id from public.plans where code = $3), $4)
         returning id`,
        [op.slug, op.name, op.plan, JSON.stringify(op.settings)],
      );
      ctx.tenantId = texto(rows[0]?.id);
      return;
    }

    case 'enable_module':
      await db.query(
        `insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
         select $1, m.id, true, now() from public.modules m where m.code = $2
         on conflict (tenant_id, module_id) do nothing`,
        [ctx.tenantId, op.module],
      );
      return;

    case 'create_role': {
      const { rows } = await db.query(
        `insert into public.roles (tenant_id, code, name, is_system)
         values ($1, $2, $3, false)
         returning id`,
        [ctx.tenantId, op.code, op.name],
      );
      await db.query(
        `insert into public.role_permissions (role_id, permission_id)
         select $1, p.id from public.permissions p where p.code = any($2::text[])
         on conflict do nothing`,
        [texto(rows[0]?.id), [...op.permissions]],
      );
      return;
    }

    case 'create_admin': {
      // A identidade vem de fora: ver `IdentityPort`. O que é escrito aqui é
      // só o vínculo — e o vínculo nasce `invited`, porque convite não é
      // acesso: ele só vira `active` no primeiro login.
      const userId = await identity.ensureUser({ email: op.email, fullName: op.fullName });
      await db.query(
        `insert into public.tenant_users (tenant_id, user_id, role_id, status)
         values ($1, $2, (select id from public.roles where code = $3 and tenant_id is null), 'invited')`,
        [ctx.tenantId, userId, op.role],
      );
      return;
    }

    case 'seed':
      if (!SEED_TARGETS_DISPONIVEIS.has(op.entity)) {
        ctx.pendentes.push({ entity: op.entity, values: op.values });
        return;
      }
      throw new Error(`semente para "${op.entity}" declarada como disponível, mas sem execução`);

    case 'invite':
      /*
       * Em produção isto dispara o convite por e-mail. O registro de auditoria
       * fica de todo jeito: quem foi convidado, para qual empresa, sob qual
       * blueprint. É o que permite responder depois "quem abriu esta conta?".
       */
      await db.query(
        `insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
         values ($1, $2, 'tenant.provisioned', 'tenant', $3, $4)`,
        [ctx.tenantId, null, ctx.tenantId, JSON.stringify({ email: op.email })],
      );
      return;
  }
}

/* ── O fluxo ──────────────────────────────────────────────────────────── */

/**
 * Executa um plano já validado.
 *
 * As garantias que o esquema sustenta e que este código não pode quebrar:
 *
 * - **Idempotência.** Mesma chave devolve a execução existente, sem tocar em
 *   nada. Quem garante é o UNIQUE em `idempotency_key`; aqui só se consulta
 *   antes para devolver uma resposta útil em vez de uma violação.
 * - **O tenant só vira `active` no fim.** Uma falha no meio deixa um cliente
 *   em `provisioning`, que é honesto: ele existe e não opera.
 * - **Toda etapa fica registrada**, inclusive a que falhou e as que nem
 *   chegaram a rodar. É o que permite retomar do ponto certo, e o que responde
 *   "onde parou?" sem ler log.
 */
export async function executeProvisioning(
  db: SqlClient,
  identity: IdentityPort,
  input: ExecuteInput,
): Promise<ExecuteResult> {
  const existente = await execucaoExistente(db, input.idempotencyKey);
  if (existente !== null) {
    return {
      ok: true,
      tenantId: texto(existente.tenant_id),
      runId: texto(existente.id),
      reused: true,
      pendingSeeds: [],
    };
  }

  const ctx: Contexto = { tenantId: null, pendentes: [] };
  let runId: string | null = null;
  let etapaAtual: ProvisioningStep = PROVISIONING_STEPS[0];

  try {
    for (const op of input.operations) {
      const etapa = stepOf(op);

      // A execução só pode ser aberta depois que o tenant existe: ela aponta
      // para ele. Por isso o registro nasce logo após a primeira operação.
      if (ctx.tenantId === null) {
        await aplicar(db, identity, op, ctx);
        runId = await abrirExecucao(db, ctx.tenantId, input);
        await marcarEtapa(db, runId, etapa, 'succeeded');
        etapaAtual = etapa;
        continue;
      }

      if (etapa !== etapaAtual) {
        await marcarEtapa(db, runId as string, etapa, 'running');
        etapaAtual = etapa;
      }

      await aplicar(db, identity, op, ctx);
      await marcarEtapa(db, runId as string, etapa, 'succeeded');
    }

    await concluir(db, runId as string, ctx);
    return {
      ok: true,
      tenantId: ctx.tenantId as string,
      runId: runId as string,
      reused: false,
      pendingSeeds: ctx.pendentes,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (runId !== null) await falhar(db, runId, etapaAtual, mensagem);
    return { ok: false, tenantId: ctx.tenantId, runId, failedStep: etapaAtual, error: mensagem };
  }
}

/** Abre o registro da execução e cria uma linha por etapa do fluxo. */
async function abrirExecucao(
  db: SqlClient,
  tenantId: string | null,
  input: ExecuteInput,
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.provisioning_runs
       (tenant_id, idempotency_key, payload, requested_by, status, started_at, attempts)
     values ($1, $2, $3, $4, 'running', now(), 1)
     returning id`,
    [
      tenantId,
      input.idempotencyKey,
      JSON.stringify({ blueprint: input.blueprint }),
      input.requestedBy,
    ],
  );
  const runId = texto(rows[0]?.id);

  // Uma linha por etapa, desde já: é o que permite ver "onde parou" sem
  // adivinhar, e o que a retomada consulta para saber o que pular.
  await db.query(
    `insert into public.provisioning_steps (run_id, step, position)
     select $1, s.step, s.position
     from unnest($2::text[]) with ordinality as s(step, position)`,
    [runId, [...PROVISIONING_STEPS]],
  );

  return runId;
}

async function marcarEtapa(
  db: SqlClient,
  runId: string,
  step: ProvisioningStep,
  status: 'running' | 'succeeded',
): Promise<void> {
  /*
   * `$3::text` nas comparações e `$3::enum` na atribuição.
   *
   * Sem os casts o Postgres recusa: "inconsistent types deduced for parameter
   * $3". Ele precisa de um tipo só por parâmetro, e aqui o mesmo valor é
   * atribuído a uma coluna enum e comparado com literais de texto.
   */
  await db.query(
    `update public.provisioning_steps
     set status = $3::public.provisioning_step_status,
         started_at = coalesce(started_at, now()),
         finished_at = case when $3::text = 'succeeded' then now() else null end,
         attempts = case when $3::text = 'running' then attempts + 1 else attempts end
     where run_id = $1 and step = $2`,
    [runId, step, status],
  );
  await db.query('update public.provisioning_runs set current_step = $2 where id = $1', [
    runId,
    step,
  ]);
}

/** Fecha a execução com sucesso e, só então, coloca o tenant em operação. */
async function concluir(db: SqlClient, runId: string, ctx: Contexto): Promise<void> {
  // As etapas sem operação própria — `apply_plan` hoje — ficariam `pending`
  // para sempre. `skipped` é o estado honesto: não rodou, e não era para rodar.
  await db.query(
    `update public.provisioning_steps
     set status = 'skipped', finished_at = now()
     where run_id = $1 and status = 'pending'`,
    [runId],
  );

  if (ctx.pendentes.length > 0) {
    await db.query(
      `update public.provisioning_steps
       set status = 'skipped', result = $2, finished_at = now()
       where run_id = $1 and step = 'seed_defaults'`,
      [runId, JSON.stringify({ pending: ctx.pendentes, reason: MOTIVO_SEMENTE_PENDENTE })],
    );
  }

  await db.query(
    `update public.provisioning_runs
     set status = 'succeeded', current_step = null, finished_at = now()
     where id = $1`,
    [runId],
  );
  await db.query(`update public.tenants set status = 'active' where id = $1`, [ctx.tenantId]);
}

/** Registra a falha sem ativar o tenant. Ele fica em `provisioning`. */
async function falhar(
  db: SqlClient,
  runId: string,
  step: ProvisioningStep,
  erro: string,
): Promise<void> {
  await db.query(
    `update public.provisioning_steps
     set status = 'failed', error = $3, finished_at = now()
     where run_id = $1 and step = $2`,
    [runId, step, erro],
  );
  await db.query(
    `update public.provisioning_runs
     set status = 'failed', last_error = $2, current_step = $3, finished_at = now()
     where id = $1`,
    [runId, erro, step],
  );
}

/** A posição de uma etapa, reexportada para quem monta relatório de progresso. */
export { stepPosition };
