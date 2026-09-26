'use server';

/**
 * As duas saídas de um provisionamento que falhou: retomar ou desfazer.
 *
 * Sem elas, uma falha no meio é um beco. O cliente fica em `provisioning` —
 * existe e não opera —, e a única forma de sair seria SQL à mão. Um fluxo que
 * só tem caminho feliz na tela não está pronto, por mais que o caminho feliz
 * funcione.
 *
 * **A escolha entre as duas é de quem administra, não do código.** Depois de
 * uma falha, o executor não compensa sozinho: um erro de rede pede retomada, um
 * e-mail digitado errado pede desfazer, e adivinhar qual é o caso pelo texto do
 * erro seria adivinhar.
 *
 * O plano é **recalculado** na retomada, de `planProvisioning`, com o blueprint
 * de hoje. O que vem guardado é a entrada — slug, nome, administrador —, que
 * não há como derivar de tabela nenhuma enquanto `create_admin` não concluir.
 */

import { planProvisioning, type ModuleCode } from '@tivexy/core';
import { blueprintByCode } from '@tivexy/core/blueprints';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { sqlClient } from '@/server/db';
import { compensateProvisioning, resumeProvisioning } from '@/server/provisioning/execute';
import { identityPort } from '@/server/provisioning/identity';

import type { RecoveryState } from './state.ts';

/** O que ficou guardado da execução, o bastante para refazer o plano. */
interface Registro {
  idempotencyKey: string;
  blueprintCode: string;
  slug: string;
  name: string;
  admin: { email: string; fullName: string };
}

async function lerRegistro(runId: string): Promise<Registro | null> {
  const db = sqlClient();
  const { rows } = await db.query(
    `select r.idempotency_key,
            r.payload -> 'blueprint' ->> 'code' as blueprint_code,
            r.payload -> 'request'             as request,
            t.slug, t.name
       from public.provisioning_runs r
       join public.tenants t on t.id = r.tenant_id
      where r.id = $1::uuid
      limit 1`,
    [runId],
  );

  const linha = rows[0];
  if (linha === undefined) return null;

  const pedido = linha.request as { admin?: { email?: string; fullName?: string } } | null;
  const email = pedido?.admin?.email;
  const fullName = pedido?.admin?.fullName;
  if (typeof email !== 'string' || typeof fullName !== 'string') return null;

  return {
    idempotencyKey: String(linha.idempotency_key),
    blueprintCode: String(linha.blueprint_code ?? ''),
    slug: String(linha.slug),
    name: String(linha.name),
    admin: { email, fullName },
  };
}

async function modulosDoPlano(plan: string): Promise<ModuleCode[]> {
  const db = sqlClient();
  const { rows } = await db.query(
    `select m.code
       from public.plan_modules pm
       join public.plans p   on p.id = pm.plan_id
       join public.modules m on m.id = pm.module_id
      where p.code = $1`,
    [plan],
  );
  return rows.map((r) => String(r.code) as ModuleCode);
}

export async function retomarProvisionamento(form: FormData): Promise<RecoveryState> {
  const { viewer } = await requireAccess('/admin');
  const runId = String(form.get('runId') ?? '');

  const registro = await lerRegistro(runId);
  if (registro === null) {
    return {
      erro:
        'Esta execução é anterior ao registro da entrada e não tem como ser retomada — ' +
        'o e-mail de quem administraria não foi guardado. Desfaça e crie de novo.',
      aviso: null,
    };
  }

  const blueprint = blueprintByCode(registro.blueprintCode);
  if (blueprint === null) {
    return {
      erro: `O nicho "${registro.blueprintCode}" não existe mais no repositório.`,
      aviso: null,
    };
  }

  const plano = planProvisioning({
    blueprint,
    planModules: await modulosDoPlano(blueprint.plan),
    slug: registro.slug,
    name: registro.name,
    admin: registro.admin,
  });

  if (!plano.ok) {
    return { erro: `O plano não é mais válido: ${plano.problems[0]?.message ?? ''}`, aviso: null };
  }

  const db = sqlClient();
  const resultado = await resumeProvisioning(db, identityPort(db), {
    operations: plano.operations,
    blueprint: { code: blueprint.code, version: blueprint.version },
    idempotencyKey: registro.idempotencyKey,
    requestedBy: viewer.userId,
    request: { slug: registro.slug, name: registro.name, admin: registro.admin },
  });

  revalidatePath('/admin');

  return resultado.ok
    ? { erro: null, aviso: `${registro.name} foi provisionado.` }
    : { erro: `Parou de novo em "${resultado.failedStep}": ${resultado.error}`, aviso: null };
}

export async function desfazerProvisionamento(form: FormData): Promise<RecoveryState> {
  await requireAccess('/admin');
  const runId = String(form.get('runId') ?? '');

  const db = sqlClient();
  const { rows } = await db.query(
    'select idempotency_key from public.provisioning_runs where id = $1::uuid limit 1',
    [runId],
  );
  const chave = rows[0]?.idempotency_key;
  if (typeof chave !== 'string') return { erro: 'Execução não encontrada.', aviso: null };

  const resultado = await compensateProvisioning(db, identityPort(db), { idempotencyKey: chave });

  revalidatePath('/admin');

  return resultado.ok
    ? {
        erro: null,
        /*
         * "Cancelado", não "apagado": a compensação cancela o tenant e mantém
         * o histórico. Dizer "removido" na tela contradiria o que o banco tem.
         */
        aviso: `Desfeito. O cliente ficou cancelado e o histórico da execução foi preservado. Etapas desfeitas: ${resultado.undone.join(', ')}.`,
      }
    : { erro: `Não consegui desfazer: ${resultado.error}`, aviso: null };
}
