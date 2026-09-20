/**
 * O executor do provisionamento: transforma o plano em escritas no banco.
 *
 * É a outra metade do movimento que `planProvisioning` começou. A **decisão**
 * já saiu daqui — o que fazer, em que ordem, e o que recusar é do Core, puro e
 * testado sem banco. O que sobrou aqui é só **fazer**, e fazer não decide nada:
 * não há um `if` de regra de negócio neste arquivo.
 *
 * Três caminhos, e os três escrevem no mesmo registro:
 *
 *   executeProvisioning     a primeira tentativa
 *   resumeProvisioning      continuar de onde parou, sem repetir o concluído
 *   compensateProvisioning  desfazer o que teve efeito, na ordem inversa
 *
 * Roda no servidor, com `service_role`, porque provisionar é operação de
 * plataforma: cria tenant, cria usuário, atribui papel. Nenhuma dessas escritas
 * passa pelo RLS — e é por isso que as constraints do esquema importam tanto
 * (ver `docs/12-SECURITY/MULTI_TENANCY.md`, "E vale para o service_role").
 *
 * ## `$n::text::jsonb`, e não `$n`
 *
 * Todo parâmetro que carrega JSON é descrito como texto e convertido pelo
 * servidor. Sem o `::text`, cada driver decide sozinho como serializar uma
 * string destinada a coluna `jsonb`: o PGlite dos testes a **analisa** e
 * grava um objeto; o driver de produção a **serializa de novo** e grava uma
 * string de JSON dentro do jsonb.
 *
 * O estrago não era um erro, era silêncio. `result` virava a string
 * `"{\"effects\":[…]}"`, a leitura não achava `effects`, a compensação
 * desfazia zero efeitos — e marcava cada etapa como `compensated`. Módulos e
 * papéis continuavam lá, e a tela dizia que tinha desfeito.
 *
 * Nenhum teste pegava: em PGlite os dois caminhos dão no mesmo. Só apareceu
 * contra o Postgres de verdade.
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
 * Como nasce — e como se desfaz — uma identidade.
 *
 * **Não dá para criar usuário por SQL**, e isso não é limitação do executor: a
 * identidade vive em `auth.users`, que é do Supabase, e criá-la envolve senha,
 * confirmação de e-mail e convite. Em produção isto é a Auth Admin API.
 * `public.users` é espelho, preenchido pelo gatilho `mirror_auth_user`.
 *
 * `ensureUser` devolve `created` porque a compensação depende dessa distinção.
 * Quem administra dois clientes é a mesma pessoa: se o segundo provisionamento
 * falhar e a compensação apagar a identidade dela, ela perde o acesso ao
 * primeiro — um cliente que nada tinha a ver com a falha. **Só se desfaz o que
 * esta execução criou.**
 */
export interface IdentityPort {
  ensureUser(input: { email: string; fullName: string }): Promise<{ id: string; created: boolean }>;

  /**
   * Remove uma identidade. Chamado **apenas** para quem esta execução criou.
   *
   * Existe porque a alternativa é pior: deixar uma conta órfã que consegue
   * entrar e não encontra empresa nenhuma, sem que ninguém saiba por quê.
   */
  deleteUser(id: string): Promise<void>;
}

/* ── O que cada etapa criou ───────────────────────────────────────────── */

/**
 * O rastro de uma escrita, guardado em `provisioning_steps.result`.
 *
 * É o que a compensação lê para saber o que desfazer. Sem isto ela teria que
 * deduzir — "apague os módulos deste tenant" — e deduzir apagaria também o que
 * um administrador tivesse habilitado à mão depois, que não é efeito desta
 * execução.
 */
export type Efeito =
  | { kind: 'tenant'; id: string }
  | { kind: 'module'; code: string }
  | { kind: 'role'; id: string; code: string }
  | { kind: 'membership'; id: string; userId: string; userCreated: boolean }
  | { kind: 'audit'; id: string }
  /** Semente declarada e não aplicada. Não há o que desfazer. */
  | { kind: 'seedPending'; entity: string };

export interface ExecuteInput {
  operations: readonly ProvisioningOperation[];
  /** De qual documento este tenant nasceu. Fica no registro da execução. */
  blueprint: { code: string; version: number };
  /**
   * A entrada que gerou o plano — slug, nome e administrador.
   *
   * Guardada no `payload` porque a retomada precisa dela e **não tem como
   * derivá-la**: o e-mail de quem vai administrar não está em nenhuma tabela
   * enquanto a etapa `create_admin' não concluir, que é justamente a etapa
   * que costuma falhar.
   *
   * Note a diferença para as **operações**, que continuam fora daqui de
   * propósito: o plano é recalculado de `planProvisioning` a cada retomada, com
   * o blueprint de hoje. Guardar a entrada não cria segunda fonte de verdade;
   * guardar o plano criaria, e ele envelheceria.
   *
   * Não há senha aqui. Identidade nasce por convite.
   */
  request?: { slug: string; name: string; admin: { email: string; fullName: string } };
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

export type CompensateResult =
  | { ok: true; tenantId: string; runId: string; undone: readonly ProvisioningStep[] }
  | { ok: false; runId: string | null; error: string };

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

/**
 * As operações agrupadas pela etapa a que pertencem.
 *
 * O plano já sai em ordem de etapa — há um invariante no Core que prova isso —,
 * então basta dobrar a lista. Agrupar antes de executar é o que permite marcar
 * a etapa como concluída **uma vez**, com tudo que ela criou junto, em vez de
 * reescrever o resultado a cada operação.
 */
function agruparPorEtapa(
  operations: readonly ProvisioningOperation[],
): { step: ProvisioningStep; operations: ProvisioningOperation[] }[] {
  const grupos: { step: ProvisioningStep; operations: ProvisioningOperation[] }[] = [];
  for (const op of operations) {
    const step = stepOf(op);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo !== undefined && ultimo.step === step) ultimo.operations.push(op);
    else grupos.push({ step, operations: [op] });
  }
  return grupos;
}

interface Execucao {
  id: string;
  tenantId: string;
  status: string;
}

async function buscarExecucao(db: SqlClient, idempotencyKey: string): Promise<Execucao | null> {
  const { rows } = await db.query(
    `select id, tenant_id, status::text as status
     from public.provisioning_runs where idempotency_key = $1`,
    [idempotencyKey],
  );
  const linha = rows[0];
  if (linha === undefined) return null;
  return { id: texto(linha.id), tenantId: texto(linha.tenant_id), status: texto(linha.status) };
}

/** As etapas de uma execução, com o que cada uma criou. */
async function etapasDa(
  db: SqlClient,
  runId: string,
): Promise<{ step: ProvisioningStep; status: string; efeitos: Efeito[] | null }[]> {
  const { rows } = await db.query(
    `select step, status::text as status, result
     from public.provisioning_steps where run_id = $1 order by position`,
    [runId],
  );
  return rows.map((r) => ({
    step: texto(r.step) as ProvisioningStep,
    status: texto(r.status),
    efeitos: lerEfeitos(r.result),
  }));
}

/**
 * Lê os efeitos gravados numa etapa.
 *
 * Devolve `null` quando **não dá para saber** o que a etapa fez, e lista vazia
 * quando ela genuinamente não fez nada. A diferença é a que faltava: um
 * `result` ilegível lido como "zero efeitos" fazia a compensação percorrer as
 * etapas, não desfazer coisa alguma e marcar tudo como `compensated`. Os
 * módulos e os papéis continuavam no banco, e a tela dizia que tinham saído.
 *
 * Quem chama decide o que fazer com `null` — e a compensação recusa, em vez de
 * fingir. Ver o cabeçalho deste arquivo, em `$n::text::jsonb`.
 */
function lerEfeitos(result: unknown): Efeito[] | null {
  if (result === null || typeof result !== 'object') return null;
  const efeitos = (result as { effects?: unknown }).effects;
  return Array.isArray(efeitos) ? (efeitos as Efeito[]) : null;
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
): Promise<Efeito[]> {
  switch (op.kind) {
    case 'create_tenant': {
      const { rows } = await db.query(
        `insert into public.tenants (slug, name, status, plan_id, settings)
         values ($1, $2, 'provisioning', (select id from public.plans where code = $3), $4::text::jsonb)
         returning id`,
        [op.slug, op.name, op.plan, JSON.stringify(op.settings)],
      );
      ctx.tenantId = texto(rows[0]?.id);
      return [{ kind: 'tenant', id: ctx.tenantId }];
    }

    case 'enable_module':
      await db.query(
        `insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
         select $1, m.id, true, now() from public.modules m where m.code = $2
         on conflict (tenant_id, module_id) do nothing`,
        [ctx.tenantId, op.module],
      );
      return [{ kind: 'module', code: op.module }];

    case 'create_role': {
      const { rows } = await db.query(
        `insert into public.roles (tenant_id, code, name, is_system)
         values ($1, $2, $3, false)
         returning id`,
        [ctx.tenantId, op.code, op.name],
      );
      const roleId = texto(rows[0]?.id);
      await db.query(
        `insert into public.role_permissions (role_id, permission_id)
         select $1, p.id from public.permissions p where p.code = any($2::text[])
         on conflict do nothing`,
        [roleId, [...op.permissions]],
      );
      return [{ kind: 'role', id: roleId, code: op.code }];
    }

    case 'create_admin': {
      // A identidade vem de fora: ver `IdentityPort`. O que é escrito aqui é
      // só o vínculo — e o vínculo nasce `invited`, porque convite não é
      // acesso: ele só vira `active` no primeiro login.
      const { id: userId, created } = await identity.ensureUser({
        email: op.email,
        fullName: op.fullName,
      });
      const { rows } = await db.query(
        `insert into public.tenant_users (tenant_id, user_id, role_id, status)
         values ($1, $2, (select id from public.roles where code = $3 and tenant_id is null), 'invited')
         returning id`,
        [ctx.tenantId, userId, op.role],
      );
      return [{ kind: 'membership', id: texto(rows[0]?.id), userId, userCreated: created }];
    }

    case 'seed':
      if (!SEED_TARGETS_DISPONIVEIS.has(op.entity)) {
        ctx.pendentes.push({ entity: op.entity, values: op.values });
        return [{ kind: 'seedPending', entity: op.entity }];
      }
      throw new Error(`semente para "${op.entity}" declarada como disponível, mas sem execução`);

    case 'invite': {
      /*
       * Em produção isto dispara o convite por e-mail. O registro de auditoria
       * fica de todo jeito: quem foi convidado, para qual empresa, sob qual
       * blueprint. É o que permite responder depois "quem abriu esta conta?".
       */
      const { rows } = await db.query(
        `insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
         values ($1, $2, 'tenant.provisioned', 'tenant', $3, $4::text::jsonb)
         returning id`,
        [ctx.tenantId, null, ctx.tenantId, JSON.stringify({ email: op.email })],
      );
      return [{ kind: 'audit', id: texto(rows[0]?.id) }];
    }
  }
}

/* ── O que desfaz cada efeito ─────────────────────────────────────────── */

async function desfazer(
  db: SqlClient,
  identity: IdentityPort,
  efeito: Efeito,
  tenantId: string,
): Promise<void> {
  switch (efeito.kind) {
    case 'tenant':
      // O tenant é **cancelado**, não apagado, e isso acontece no fim da
      // compensação. `provisioning_runs.tenant_id` é `on delete cascade`:
      // apagar levaria junto a execução e as etapas — a evidência da falha.
      return;

    case 'module':
      await db.query(
        `delete from public.tenant_modules
         where tenant_id = $1
           and module_id = (select id from public.modules where code = $2)`,
        [tenantId, efeito.code],
      );
      return;

    case 'role':
      // `role_permissions` sai por cascata. Um vínculo que apontasse para este
      // papel impediria a exclusão — e impedir é o certo: significaria que
      // alguém já está usando o papel, e não é efeito só desta execução.
      await db.query('delete from public.roles where id = $1 and tenant_id = $2', [
        efeito.id,
        tenantId,
      ]);
      return;

    case 'membership':
      await db.query('delete from public.tenant_users where id = $1', [efeito.id]);
      // Só quem esta execução criou. Quem já existia administra outro cliente,
      // e apagá-la tiraria o acesso dela a algo que nada tem a ver com a falha.
      if (efeito.userCreated) await identity.deleteUser(efeito.userId);
      return;

    case 'audit':
      // **Auditoria não se desfaz.** `audit_logs` não tem política de DELETE, e
      // isso é de propósito: log editável não é auditoria. O registro de que a
      // empresa foi provisionada fica; o desfazer acrescenta o próprio.
      return;

    case 'seedPending':
      // Nada foi aplicado. Não há o que desfazer.
      return;
  }
}

/* ── Primeira tentativa ───────────────────────────────────────────────── */

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
  const existente = await buscarExecucao(db, input.idempotencyKey);
  if (existente !== null) {
    return {
      ok: true,
      tenantId: existente.tenantId,
      runId: existente.id,
      reused: true,
      pendingSeeds: [],
    };
  }

  const grupos = agruparPorEtapa(input.operations);
  const primeiro = grupos[0];
  if (primeiro === undefined || primeiro.step !== 'create_tenant') {
    throw new Error('o plano precisa começar criando o tenant');
  }

  const ctx: Contexto = { tenantId: null, pendentes: [] };
  let runId: string | null = null;
  let etapaAtual: ProvisioningStep = primeiro.step;

  try {
    /*
     * A primeira etapa é especial: a execução aponta para o tenant, e
     * `provisioning_runs.tenant_id` é `not null`. Ou seja, o registro só pode
     * nascer depois que o tenant existe. Se falhar antes disso, não há
     * execução para marcar como falha — e não há nada a compensar tampouco.
     */
    const efeitosDoTenant = await aplicarGrupo(db, identity, primeiro, ctx);
    runId = await abrirExecucao(db, ctx.tenantId as string, input);
    await concluirEtapa(db, runId, primeiro.step, efeitosDoTenant);

    for (const grupo of grupos.slice(1)) {
      etapaAtual = grupo.step;
      await marcarRodando(db, runId, grupo.step);
      const efeitos = await aplicarGrupo(db, identity, grupo, ctx);
      await concluirEtapa(db, runId, grupo.step, efeitos);
    }

    await concluir(db, runId, ctx);
    return {
      ok: true,
      tenantId: ctx.tenantId as string,
      runId,
      reused: false,
      pendingSeeds: ctx.pendentes,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (runId !== null) await falhar(db, runId, etapaAtual, mensagem);
    return { ok: false, tenantId: ctx.tenantId, runId, failedStep: etapaAtual, error: mensagem };
  }
}

/* ── Retomada ─────────────────────────────────────────────────────────── */

/**
 * Continua uma execução que falhou, sem repetir o que já concluiu.
 *
 * Recebe o plano de novo em vez de guardá-lo: `planProvisioning` é
 * determinístico, e o mesmo blueprint com a mesma entrada produz a mesma lista.
 * Guardar as operações no `payload` seria uma segunda fonte de verdade que
 * envelhece — e a retomada de um mês depois executaria um plano velho, com as
 * regras de antes.
 *
 * O que ela **não** pode fazer é reexecutar uma etapa concluída: habilitar
 * módulo de novo é inócuo, mas criar papel de novo viola unicidade, e criar
 * vínculo de novo viola `tenant_users_unique`. Por isso pula por etapa, não
 * por operação.
 */
export async function resumeProvisioning(
  db: SqlClient,
  identity: IdentityPort,
  input: ExecuteInput,
): Promise<ExecuteResult> {
  const execucao = await buscarExecucao(db, input.idempotencyKey);
  if (execucao === null) {
    return {
      ok: false,
      tenantId: null,
      runId: null,
      failedStep: PROVISIONING_STEPS[0],
      error: `não há execução com a chave "${input.idempotencyKey}"`,
    };
  }

  if (execucao.status !== 'failed') {
    /*
     * Só execução falhada se retoma. Uma `running` está em andamento em outro
     * lugar — continuar seria duas escritas no mesmo tenant ao mesmo tempo. E
     * uma `succeeded` não tem o que continuar.
     */
    return {
      ok: false,
      tenantId: execucao.tenantId,
      runId: execucao.id,
      failedStep: PROVISIONING_STEPS[0],
      error: `execução está em "${execucao.status}"; só se retoma o que falhou`,
    };
  }

  const etapas = await etapasDa(db, execucao.id);
  const concluidas = new Set(etapas.filter((e) => e.status === 'succeeded').map((e) => e.step));

  const ctx: Contexto = { tenantId: execucao.tenantId, pendentes: [] };
  let etapaAtual: ProvisioningStep = PROVISIONING_STEPS[0];

  /*
   * `finished_at` volta a ser nulo, e isto não é detalhe: `running` não é
   * estado terminal, e a constraint `provisioning_runs_finished_consistency`
   * recusa uma execução viva com data de fim. Foi assim que a primeira versão
   * desta função quebrou, antes de existir aplicação.
   */
  await db.query(
    `update public.provisioning_runs
     set status = 'running', attempts = attempts + 1,
         current_step = null, last_error = null, finished_at = null
     where id = $1`,
    [execucao.id],
  );

  try {
    for (const grupo of agruparPorEtapa(input.operations)) {
      if (concluidas.has(grupo.step)) continue;

      etapaAtual = grupo.step;
      await marcarRodando(db, execucao.id, grupo.step);
      const efeitos = await aplicarGrupo(db, identity, grupo, ctx);
      await concluirEtapa(db, execucao.id, grupo.step, efeitos);
    }

    await concluir(db, execucao.id, ctx);
    return {
      ok: true,
      tenantId: execucao.tenantId,
      runId: execucao.id,
      reused: false,
      pendingSeeds: ctx.pendentes,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await falhar(db, execucao.id, etapaAtual, mensagem);
    return {
      ok: false,
      tenantId: execucao.tenantId,
      runId: execucao.id,
      failedStep: etapaAtual,
      error: mensagem,
    };
  }
}

/* ── Compensação ──────────────────────────────────────────────────────── */

/**
 * Desfaz o que teve efeito, na ordem inversa, e cancela o cliente.
 *
 * É o caminho oposto da retomada: retomar avança, compensar recua. A diferença
 * importa para quem vai olhar depois — um tenant parado em `provisioning` para
 * sempre é pior que um cancelado, porque ninguém sabe se ainda vai acontecer
 * alguma coisa.
 *
 * Desfaz só o que **esta execução** criou, lido de `provisioning_steps.result`.
 * Deduzir ("apague os módulos deste tenant") apagaria também o que alguém
 * tivesse habilitado à mão depois.
 */
export async function compensateProvisioning(
  db: SqlClient,
  identity: IdentityPort,
  input: { idempotencyKey: string },
): Promise<CompensateResult> {
  const execucao = await buscarExecucao(db, input.idempotencyKey);
  if (execucao === null) {
    return {
      ok: false,
      runId: null,
      error: `não há execução com a chave "${input.idempotencyKey}"`,
    };
  }

  if (execucao.status !== 'failed') {
    return {
      ok: false,
      runId: execucao.id,
      error: `execução está em "${execucao.status}"; só se compensa o que falhou`,
    };
  }

  // Mesma armadilha da retomada, do outro lado: `compensating` não é terminal.
  await db.query(
    `update public.provisioning_runs
     set status = 'compensating', current_step = null, finished_at = null
     where id = $1`,
    [execucao.id],
  );

  const etapas = await etapasDa(db, execucao.id);
  const concluidas = etapas.filter((e) => e.status === 'succeeded').reverse();
  const desfeitas: ProvisioningStep[] = [];

  try {
    for (const etapa of concluidas) {
      await db.query('update public.provisioning_runs set current_step = $2 where id = $1', [
        execucao.id,
        etapa.step,
      ]);

      /*
       * Etapa concluída cujo registro não diz o que ela criou.
       *
       * Parar é o único desfecho honesto: seguir marcaria como `compensated`
       * uma etapa cujos efeitos continuam no banco, e o próximo a olhar veria
       * "desfeito" sobre um tenant que ainda tem módulos e papéis. A execução
       * fica em `compensating`, que é visível e não é terminal.
       */
      if (etapa.efeitos === null) {
        throw new Error(
          `a etapa "${etapa.step}" está concluída e o registro do que ela criou não ` +
            'pôde ser lido. Nada foi desfeito a partir daqui — o estado precisa ser ' +
            'conferido à mão antes de tentar de novo.',
        );
      }

      // Dentro da etapa também na ordem inversa: o que foi criado por último
      // é o primeiro a sair.
      for (const efeito of [...etapa.efeitos].reverse()) {
        await desfazer(db, identity, efeito, execucao.tenantId);
      }

      // A etapa vira `compensated`, não some. O histórico da falha é a parte
      // que mais interessa depois.
      await db.query(
        `update public.provisioning_steps
         set status = 'compensated', finished_at = now()
         where run_id = $1 and step = $2`,
        [execucao.id, etapa.step],
      );
      desfeitas.push(etapa.step);
    }

    await db.query(
      `update public.provisioning_runs
       set status = 'compensated', current_step = null, finished_at = now()
       where id = $1`,
      [execucao.id],
    );
    await db.query(`update public.tenants set status = 'cancelled' where id = $1`, [
      execucao.tenantId,
    ]);

    // Desfazer é operação de plataforma, e é auditável. Acrescenta — nunca
    // apaga o registro do que foi feito.
    await db.query(
      `insert into public.audit_logs (tenant_id, action, resource_type, resource_id, metadata)
       values ($1, 'tenant.provisioning_compensated', 'tenant', $2, $3::text::jsonb)`,
      [execucao.tenantId, execucao.tenantId, JSON.stringify({ undone: desfeitas })],
    );

    return { ok: true, tenantId: execucao.tenantId, runId: execucao.id, undone: desfeitas };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    /*
     * Compensação que falha no meio é o pior estado possível: parte desfeita,
     * parte não, e a execução em `compensating`, que ocupa o tenant e impede
     * qualquer tentativa nova.
     *
     * Volta para `failed` de propósito. É o único estado a partir do qual dá
     * para tentar de novo — e as etapas já compensadas não serão refeitas,
     * porque só as `succeeded` entram na próxima passada.
     */
    await db.query(
      `update public.provisioning_runs
       set status = 'failed', last_error = $2, finished_at = now()
       where id = $1`,
      [execucao.id, `compensação interrompida: ${mensagem}`],
    );
    return { ok: false, runId: execucao.id, error: mensagem };
  }
}

/* ── Escritas de controle ─────────────────────────────────────────────── */

async function aplicarGrupo(
  db: SqlClient,
  identity: IdentityPort,
  grupo: { step: ProvisioningStep; operations: ProvisioningOperation[] },
  ctx: Contexto,
): Promise<Efeito[]> {
  const efeitos: Efeito[] = [];
  for (const op of grupo.operations) {
    efeitos.push(...(await aplicar(db, identity, op, ctx)));
  }
  return efeitos;
}

/** Abre o registro da execução e cria uma linha por etapa do fluxo. */
async function abrirExecucao(
  db: SqlClient,
  tenantId: string,
  input: ExecuteInput,
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.provisioning_runs
       (tenant_id, idempotency_key, payload, requested_by, status, started_at, attempts)
     values ($1, $2, $3::text::jsonb, $4, 'running', now(), 1)
     returning id`,
    [
      tenantId,
      input.idempotencyKey,
      JSON.stringify({ blueprint: input.blueprint, request: input.request ?? null }),
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

async function marcarRodando(db: SqlClient, runId: string, step: ProvisioningStep): Promise<void> {
  await db.query(
    `update public.provisioning_steps
     set status = 'running',
         started_at = coalesce(started_at, now()),
         finished_at = null,
         attempts = attempts + 1
     where run_id = $1 and step = $2`,
    [runId, step],
  );
  await db.query('update public.provisioning_runs set current_step = $2 where id = $1', [
    runId,
    step,
  ]);
}

/**
 * Fecha uma etapa guardando o que ela criou — o insumo da compensação.
 *
 * **`succeeded` só quando alguma coisa aconteceu.** Uma etapa que rodou e não
 * aplicou nada é `skipped`, não `succeeded`: dizer "deu certo" sobre trabalho
 * que não foi feito é a diferença entre um relatório e uma ficção. É o caso de
 * `seed_defaults` hoje, com as tabelas de negócio ainda inexistentes.
 *
 * A distinção também importa para a compensação, que só percorre o que
 * `succeeded` — e não há por que desfazer o que não foi feito.
 */
async function concluirEtapa(
  db: SqlClient,
  runId: string,
  step: ProvisioningStep,
  efeitos: Efeito[],
): Promise<void> {
  const aconteceuAlgo = efeitos.some((e) => e.kind !== 'seedPending');
  await db.query(
    `update public.provisioning_steps
     set status = $3::public.provisioning_step_status,
         finished_at = now(), error = null, result = $4::text::jsonb
     where run_id = $1 and step = $2`,
    [runId, step, aconteceuAlgo ? 'succeeded' : 'skipped', JSON.stringify({ effects: efeitos })],
  );
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
       set result = result || $2::text::jsonb
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
