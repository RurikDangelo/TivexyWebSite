/**
 * O plano de provisionamento: do blueprint para uma lista de operações.
 *
 * Existe para tirar a decisão de dentro do backend. Sem isto, "o que acontece
 * ao criar um cliente do nicho X" fica espalhado por uma função que fala com o
 * banco — e aí a única forma de testar a regra é subindo um banco.
 *
 * Aqui a regra é pura: entra blueprint e dados do cliente, sai a lista ordenada
 * do que fazer. O backend vira um executor que não decide nada, e o mesmo plano
 * pode ser mostrado ao Super Admin **antes** de executar — "este cliente vai
 * nascer com estes módulos, estes papéis, estes dados".
 *
 * A ordem das operações é contrato, e é a mesma de `PROVISIONING_STEPS`. Nada
 * aqui pode depender de algo que ainda não aconteceu: papel antes de
 * administrador, porque o administrador recebe um papel; módulo antes de papel,
 * porque a permissão do papel pertence a um módulo.
 */

import type { ModuleCode, PermissionCode, PlanCode, SystemRoleCode } from './catalog.ts';
import type { Blueprint, BlueprintProblem } from './blueprint.ts';
import { PROVISIONING_STEPS, type ProvisioningStep } from './provisioning.ts';
import { isReservedSubdomain } from './tenant-host.ts';

/* ── As operações ─────────────────────────────────────────────────────── */

export type ProvisioningOperation =
  | {
      kind: 'create_tenant';
      slug: string;
      name: string;
      plan: PlanCode;
      settings: Readonly<Record<string, unknown>>;
      /**
       * O vocabulário do nicho, como o Blueprint declara.
       *
       * Vai junto do tenant em vez de virar operação própria porque não é
       * escrita separada: são duas colunas da mesma linha, e separar criaria
       * uma etapa que pode falhar depois de o tenant já existir — deixando um
       * cliente com módulos e sem vocabulário, que é pior do que nenhum dos
       * dois.
       */
      terms: Readonly<Record<string, { singular: string; plural: string }>>;
    }
  | { kind: 'enable_module'; module: ModuleCode }
  | { kind: 'create_role'; code: string; name: string; permissions: readonly PermissionCode[] }
  | { kind: 'create_admin'; email: string; fullName: string; role: SystemRoleCode }
  /** Registro de negócio. Hoje fica pendente: os módulos não têm tabela. */
  | { kind: 'seed'; entity: string; values: Readonly<Record<string, unknown>> }
  | { kind: 'invite'; email: string };

export type ProvisioningPlan =
  | { ok: true; operations: readonly ProvisioningOperation[] }
  | { ok: false; problems: readonly BlueprintProblem[] };

/**
 * A que etapa cada operação pertence.
 *
 * Existe para o executor **não adivinhar**. Sem isto, ele agruparia operações
 * por conta própria — uma segunda regra, em outro lugar, que pode discordar
 * desta sem ninguém notar. Com o mapa aqui, quem falha numa operação sabe
 * exatamente qual etapa marcar como falha, e quem retoma sabe o que pular.
 *
 * `apply_plan` não tem operação própria: o plano entra junto com o tenant, numa
 * escrita só. A etapa existe mesmo assim porque o fluxo documentado a tem, e
 * porque separar "criar a empresa" de "aplicar o pacote contratado" é o que
 * permitirá trocar um sem refazer o outro.
 */
const STEP_OF: Record<ProvisioningOperation['kind'], ProvisioningStep> = {
  create_tenant: 'create_tenant',
  enable_module: 'enable_modules',
  create_role: 'create_roles',
  create_admin: 'create_admin',
  seed: 'seed_defaults',
  invite: 'send_invite',
};

export function stepOf(operation: ProvisioningOperation): ProvisioningStep {
  return STEP_OF[operation.kind];
}

/** A posição de uma etapa na ordem oficial. */
export function stepPosition(step: ProvisioningStep): number {
  return PROVISIONING_STEPS.indexOf(step) + 1;
}

export interface ProvisioningInput {
  blueprint: Blueprint;
  /**
   * Os módulos que o plano contratado inclui — vem do banco (`plan_modules`).
   *
   * É parâmetro em vez de constante porque a relação plano→módulos é dado, não
   * código: mudar o que o plano `profissional` oferece não pode exigir deploy.
   */
  planModules: readonly ModuleCode[];
  slug: string;
  name: string;
  admin: { email: string; fullName: string };
}

/* ── Validação ────────────────────────────────────────────────────────── */

/**
 * Espelha `tenants_slug_format` e `tenants_slug_length` do banco.
 *
 * Duplicar a regra aqui não é redundância inútil: o banco recusaria de todo
 * jeito, mas com uma violação de constraint que chega ao Super Admin como
 * falha genérica depois de meia dúzia de operações. Validar antes devolve
 * "este endereço não serve" antes de qualquer escrita.
 *
 * Um teste compara esta expressão com a constraint real.
 */
const SLUG_FORMAT = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_MIN = 2;
const SLUG_MAX = 63;

/** Endereço de e-mail, no mínimo indispensável: tem `@` e algo dos dois lados. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Monta o plano, ou diz tudo que impede.
 *
 * Como em `checkBlueprint`, devolve **todos** os problemas: quem está criando
 * um cliente não deveria descobrir um erro por vez.
 */
export function planProvisioning(input: ProvisioningInput): ProvisioningPlan {
  const problems: BlueprintProblem[] = [];
  const erro = (path: string, message: string) => problems.push({ path, message });

  const { blueprint, planModules, slug, name, admin } = input;

  const endereco = slug.trim().toLowerCase();
  if (endereco.length < SLUG_MIN || endereco.length > SLUG_MAX) {
    erro('slug', `precisa ter entre ${SLUG_MIN} e ${SLUG_MAX} caracteres`);
  } else if (!SLUG_FORMAT.test(endereco)) {
    erro('slug', `"${endereco}" vira subdomínio: só minúsculas, números e hífen no meio`);
  } else if (isReservedSubdomain(endereco)) {
    /*
     * Um tenant chamado `www` ou `api` nasceria **inalcançável**: o endereço
     * dele já pertence à plataforma, e `tenantSlugFromHost` nunca o
     * devolveria. O cliente seria criado, cobrado, e simplesmente não abriria.
     *
     * A lista precisa valer nos dois sentidos. Reservar só na leitura deixaria
     * a armadilha armada exatamente aqui, do lado da escrita.
     */
    erro('slug', `"${endereco}" é um endereço da plataforma e não pode ser de um cliente`);
  }

  if (name.trim().length === 0) erro('name', 'obrigatório');

  const email = admin.email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) erro('admin.email', `"${admin.email}" não parece um e-mail`);
  if (admin.fullName.trim().length === 0) erro('admin.fullName', 'obrigatório');

  /*
   * O blueprint não pode habilitar módulo fora do plano.
   *
   * O esquema permite um tenant ter módulo além do plano — cortesia, piloto,
   * migração — e isso é de propósito. Mas cortesia é decisão comercial
   * explícita e auditada, não algo que um documento de nicho concede em
   * silêncio para todo cliente daquele nicho. Se um blueprint precisa de um
   * módulo, o plano dele é outro.
   */
  const doPlano = new Set<string>(planModules);
  blueprint.modules.forEach((m, i) => {
    if (!doPlano.has(m)) {
      erro(`blueprint.modules[${i}]`, `"${m}" não está no plano "${blueprint.plan}"`);
    }
  });

  if (problems.length > 0) return { ok: false, problems };

  /* ── A ordem é contrato ─────────────────────────────────────────────── */

  const operations: ProvisioningOperation[] = [
    {
      kind: 'create_tenant',
      slug: endereco,
      name: name.trim(),
      plan: blueprint.plan,
      settings: blueprint.settings,
      terms: blueprint.terms,
    },
  ];

  for (const module of blueprint.modules) {
    operations.push({ kind: 'enable_module', module });
  }

  // Papéis antes do administrador: o vínculo dele aponta para um papel.
  for (const papel of blueprint.roles) {
    operations.push({
      kind: 'create_role',
      code: papel.code,
      name: papel.name,
      permissions: papel.permissions,
    });
  }

  operations.push({
    kind: 'create_admin',
    email,
    fullName: admin.fullName.trim(),
    // Sempre `tenant_admin`, nunca um papel do blueprint: quem recebe a empresa
    // precisa poder administrar tudo dentro dela, inclusive criar outros papéis.
    role: 'tenant_admin',
  });

  for (const semente of blueprint.seeds) {
    operations.push({ kind: 'seed', entity: semente.entity, values: semente.values });
  }

  // Convite por último: só se tudo antes deu certo é que faz sentido chamar
  // alguém para entrar.
  operations.push({ kind: 'invite', email });

  return { ok: true, operations };
}

/** O que um plano vai produzir, para mostrar antes de executar. */
export interface ProvisioningPreview {
  modules: readonly ModuleCode[];
  roles: readonly string[];
  seeds: number;
  adminEmail: string;
}

/**
 * Resume um plano em linguagem de tela.
 *
 * É o que permite o Super Admin conferir antes de confirmar — e o que torna
 * "criar cliente" uma ação com resultado previsível em vez de uma surpresa.
 */
export function previewOf(operations: readonly ProvisioningOperation[]): ProvisioningPreview {
  const modules: ModuleCode[] = [];
  const roles: string[] = [];
  let seeds = 0;
  let adminEmail = '';

  for (const op of operations) {
    if (op.kind === 'enable_module') modules.push(op.module);
    else if (op.kind === 'create_role') roles.push(op.code);
    else if (op.kind === 'seed') seeds += 1;
    else if (op.kind === 'create_admin') adminEmail = op.email;
  }

  return { modules, roles, seeds, adminEmail };
}
