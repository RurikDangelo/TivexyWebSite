'use server';

/**
 * Criar cliente — o provisionamento, acionado por gente.
 *
 * O caminho inteiro já existia e estava provado contra Postgres; o que faltava
 * era esta ponta. Nada de decisão mora aqui: `planProvisioning` decide,
 * `executeProvisioning` escreve, e esta função só liga o formulário aos dois e
 * confere quem está pedindo.
 *
 * ## A conferência que não pode faltar
 *
 * `requireAccess('/admin')` de novo, dentro da ação. O layout já guardou a
 * página, e isso não basta: **Server Action é um endpoint**. Quem descobrir o
 * identificador dela pode chamá-la sem nunca abrir a página — e a guarda do
 * layout não roda em chamada de ação. Autorizar na tela e não na ação é o
 * engano clássico desta camada.
 *
 * ## A chave de idempotência
 *
 * Vem do formulário, gerada quando a página abriu. É o que faz um duplo clique,
 * um F5 no meio, ou um retry da rede resultarem em **um** cliente. A unicidade
 * é do banco — índice em `provisioning_runs` —, não de um `if` daqui.
 */

import { planProvisioning, type ModuleCode } from '@tivexy/core';
import { blueprintByCode } from '@tivexy/core/blueprints';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { embeddedCode } from '@/lib/supabase/embedded';
import { supabaseServer } from '@/lib/supabase/server';
import { sqlClient } from '@/server/db';
import { executeProvisioning } from '@/server/provisioning/execute';
import { identityPort } from '@/server/provisioning/identity';

import { CRIAR_INICIAL, type CriarClienteState } from './state.ts';

function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Os módulos que o plano contratado inclui.
 *
 * Vem do banco, não de constante: `planProvisioning` recebe isso por parâmetro
 * exatamente para que mudar o que um plano oferece seja dado, não deploy.
 */
async function modulosDoPlano(plan: string): Promise<ModuleCode[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('plan_modules')
    .select('modules(code), plans!inner(code)')
    .eq('plans.code', plan);

  if (error !== null) throw new Error(`não consegui ler os módulos do plano ${plan}`);

  return (data ?? [])
    .map((linha) => embeddedCode(linha.modules))
    .filter((code): code is ModuleCode => code !== null);
}

export async function criarCliente(
  _anterior: CriarClienteState,
  form: FormData,
): Promise<CriarClienteState> {
  const { viewer } = await requireAccess('/admin');

  const blueprint = blueprintByCode(texto(form, 'blueprint'));
  if (blueprint === null) {
    return { ...CRIAR_INICIAL, erro: 'Escolha um nicho da lista.' };
  }

  const chave = texto(form, 'chave');
  if (chave.length < 8) {
    return { ...CRIAR_INICIAL, erro: 'A chave de idempotência não veio. Recarregue a página.' };
  }

  let planModules: ModuleCode[];
  try {
    planModules = await modulosDoPlano(blueprint.plan);
  } catch (erro) {
    return {
      ...CRIAR_INICIAL,
      erro: erro instanceof Error ? erro.message : 'Falha ao ler o plano.',
    };
  }

  const plano = planProvisioning({
    blueprint,
    planModules,
    slug: texto(form, 'slug'),
    name: texto(form, 'nome'),
    admin: { email: texto(form, 'email'), fullName: texto(form, 'responsavel') },
  });

  if (!plano.ok) {
    return { ...CRIAR_INICIAL, problemas: plano.problems };
  }

  let resultado: Awaited<ReturnType<typeof executeProvisioning>>;
  try {
    const db = sqlClient();
    resultado = await executeProvisioning(db, identityPort(db), {
      operations: plano.operations,
      blueprint: { code: blueprint.code, version: blueprint.version },
      idempotencyKey: chave,
      requestedBy: viewer.userId,
      /*
       * A entrada vai junto para o registro da execução. É o que permite
       * retomar sem pedir de novo o e-mail de quem vai administrar — dado que
       * não está em tabela nenhuma enquanto `create_admin` não concluir.
       */
      request: {
        slug: texto(form, 'slug'),
        name: texto(form, 'nome'),
        admin: { email: texto(form, 'email'), fullName: texto(form, 'responsavel') },
      },
    });
  } catch (erro) {
    return {
      ...CRIAR_INICIAL,
      erro: erro instanceof Error ? erro.message : 'Falha ao falar com o banco.',
    };
  }

  if (!resultado.ok) {
    /*
     * Falha no meio. O cliente fica em `provisioning` — existe e não opera, que
     * é honesto. O que **não** acontece aqui é compensar sozinho: desfazer é
     * decisão de quem administra, com a tela na frente, e há caminho para as
     * duas saídas (retomar ou desfazer).
     */
    return {
      ...CRIAR_INICIAL,
      erro: `Parou na etapa "${resultado.failedStep}": ${resultado.error}`,
    };
  }

  revalidatePath('/admin');

  return {
    erro: null,
    problemas: [],
    sucesso: {
      tenantId: resultado.tenantId,
      slug: texto(form, 'slug').toLowerCase(),
      runId: resultado.runId,
      adminEmail: texto(form, 'email').toLowerCase(),
      reaproveitado: resultado.reused,
      /*
       * As que **ficaram** pendentes, não todas as declaradas.
       * `previewOf().seeds` conta o total do plano, e enquanto nenhuma
       * semente executava os dois números eram iguais — a tela acertava por
       * acidente. Com o CRM semeando de verdade, ela passou a avisar sobre
       * nove pendências que não existiam.
       */
      sementesPendentes: resultado.pendingSeeds.length,
    },
  };
}
