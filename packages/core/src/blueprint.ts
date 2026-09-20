/**
 * Blueprint de nicho — o que muda de uma clínica para uma cafeteria.
 *
 * É o diferencial do Tivexy, e o que impede que ele vire uma coleção de forks:
 * um nicho novo é um **documento**, não um deploy.
 *
 * A fronteira está em `docs/16-DECISIONS/ADR-003-blueprint-como-configuracao.md`
 * e vale a pena repetir aqui, porque é o que impede este arquivo de crescer sem
 * limite:
 *
 * > **Blueprint escolhe entre opções que o Core já oferece.** Se uma escolha
 * > exige código novo no Core para funcionar, ela não é Blueprint — é
 * > funcionalidade.
 *
 * Então: quais módulos ligar, sim; que tabelas existem, não. Como uma coisa se
 * chama para aquele nicho, sim; o que ela é, não. Que papel criar e com que
 * permissões, sim; que permissões existem, não — isso é catálogo.
 *
 * Tudo aqui é **dado validado**, não código executável. Um blueprint chega de
 * arquivo hoje e pode chegar do banco amanhã sem que nada desta validação mude.
 */

import {
  MODULE_CODES,
  type ModuleCode,
  PERMISSION_CODES,
  type PermissionCode,
  PLAN_CODES,
  type PlanCode,
  TERM_KEYS,
  moduleOfTerm,
} from './catalog.ts';
import { checkSettingValue, settingDefinition } from './settings.ts';

/* ── O documento ──────────────────────────────────────────────────────── */

/**
 * Como uma entidade do Core se chama neste nicho.
 *
 * Numa clínica, `crm.contacts` é "paciente"; numa escola, "aluno"; numa
 * cafeteria, "cliente". A **entidade é a mesma** — muda o rótulo, não o
 * conceito. É exatamente por isso que isto é Blueprint e não funcionalidade.
 *
 * Singular e plural separados porque português não pluraliza por regra única
 * ("cliente/clientes", mas "cliente final/clientes finais"), e concatenar "s"
 * produz erro que a pessoa vê todo dia na interface.
 */
export interface Term {
  singular: string;
  plural: string;
}

/** Um papel criado pelo blueprint, além dos três papéis de sistema. */
export interface BlueprintRole {
  /** `snake_case`, único dentro do blueprint. Vira `roles.code` do tenant. */
  code: string;
  name: string;
  permissions: readonly PermissionCode[];
}

/**
 * Um registro semeado no provisionamento.
 *
 * Deliberadamente frouxo no formato dos campos e rígido no alvo: `entity`
 * precisa ser algo que o Core conhece. Semear é "criar linhas que o cliente
 * teria criado à mão no primeiro dia" — um funil de vendas com as etapas do
 * nicho, categorias de produto, formas de pagamento.
 */
export interface SeedRecord {
  entity: string;
  values: Readonly<Record<string, unknown>>;
}

export interface Blueprint {
  /** `kebab-case`. Identifica o nicho: `clinica-odontologica`, `cafeteria`. */
  code: string;
  /** Como aparece para o Super Admin ao criar um cliente. */
  name: string;
  /** Uma linha sobre para quem serve. */
  description: string;
  /**
   * Versão do documento, não do formato. Sobe quando o conteúdo muda de um
   * jeito que importa para quem já foi provisionado por ele — é o que permite
   * responder "este tenant nasceu com qual configuração?" depois.
   */
  version: number;
  /** O plano sugerido. O Super Admin ainda pode escolher outro. */
  plan: PlanCode;
  /**
   * Módulos que o tenant nasce com.
   *
   * Podem ser menos que o plano oferece: uma cafeteria não precisa de CRM só
   * porque o plano inclui. `tenant_modules` é a verdade sobre acesso a módulo,
   * e é isto que a preenche.
   */
  modules: readonly ModuleCode[];
  /** Rótulos por chave do Core. Chave ausente usa o rótulo padrão. */
  terms: Readonly<Record<string, Term>>;
  roles: readonly BlueprintRole[];
  seeds: readonly SeedRecord[];
  /** Valores iniciais das configurações do tenant. */
  settings: Readonly<Record<string, unknown>>;
}

/* ── Validação ────────────────────────────────────────────────────────── */

export interface BlueprintProblem {
  /** Caminho dentro do documento: `roles[1].permissions[3]`. */
  path: string;
  message: string;
}

export type BlueprintCheck =
  { valid: true; blueprint: Blueprint } | { valid: false; problems: readonly BlueprintProblem[] };

const CODE_FORMAT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ROLE_CODE_FORMAT = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

const MODULES = new Set<string>(MODULE_CODES);
const PERMISSIONS = new Set<string>(PERMISSION_CODES);
const PLANS = new Set<string>(PLAN_CODES);
const TERMOS = new Set<string>(TERM_KEYS);

/**
 * O módulo a que uma permissão pertence, lido do próprio código.
 *
 * O `??` não é cerimônia do compilador: aqui a entrada vem de fora, e uma
 * string sem ponto — `"leads"` — devolveria `undefined` com
 * `noUncheckedIndexedAccess`. Cair na própria string faz a comparação com os
 * módulos habilitados falhar, que é o resultado certo para uma permissão
 * malformada.
 */
function moduleOf(permission: string): string {
  return permission.split('.')[0] ?? permission;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function texto(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const limpo = value.trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * Valida um documento vindo de fora e devolve **todos** os problemas.
 *
 * Todos, e não o primeiro: quem escreve um blueprint costuma errar várias
 * coisas do mesmo tipo — três permissões que não existem, dois módulos
 * escritos errado. Devolver um por vez transforma a escrita num jogo de
 * tentativa e erro, com um ciclo de validação por engano.
 *
 * A regra de ouro do ADR-003 vira duas checagens concretas aqui:
 *
 *   1. Toda permissão de papel precisa existir no catálogo
 *   2. Toda permissão precisa pertencer a um módulo que o blueprint habilita
 *
 * A segunda é a que pega o erro silencioso: um papel com `crm.leads.write` num
 * blueprint que não habilita `crm` cria gente que tem permissão para uma tela
 * que não existe. O RLS negaria por módulo, e a pessoa veria "módulo não
 * contratado" com uma permissão no bolso.
 */
export function checkBlueprint(raw: unknown): BlueprintCheck {
  const problems: BlueprintProblem[] = [];
  const erro = (path: string, message: string) => problems.push({ path, message });

  if (!isRecord(raw)) {
    return { valid: false, problems: [{ path: '', message: 'blueprint precisa ser um objeto' }] };
  }

  const code = texto(raw.code);
  if (code === null) erro('code', 'obrigatório');
  else if (!CODE_FORMAT.test(code)) erro('code', `"${code}" não é kebab-case`);

  const name = texto(raw.name);
  if (name === null) erro('name', 'obrigatório');

  const description = texto(raw.description);
  if (description === null) erro('description', 'obrigatório');

  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    erro('version', 'precisa ser inteiro a partir de 1');
  }

  const plan = texto(raw.plan);
  if (plan === null) erro('plan', 'obrigatório');
  else if (!PLANS.has(plan)) erro('plan', `plano "${plan}" não existe no catálogo`);

  /* Módulos */
  const modules: ModuleCode[] = [];
  if (!Array.isArray(raw.modules)) {
    erro('modules', 'precisa ser uma lista');
  } else if (raw.modules.length === 0) {
    erro('modules', 'um tenant sem módulo nenhum não opera');
  } else {
    raw.modules.forEach((m, i) => {
      if (typeof m !== 'string' || !MODULES.has(m)) {
        erro(`modules[${i}]`, `módulo "${String(m)}" não existe no catálogo`);
        return;
      }
      if (modules.includes(m as ModuleCode)) erro(`modules[${i}]`, `"${m}" repetido`);
      else modules.push(m as ModuleCode);
    });

    // `core` não é opcional: é onde vivem tenant, usuários e permissões.
    if (modules.length > 0 && !modules.includes('core')) {
      erro('modules', 'o módulo "core" é obrigatório — sem ele não há usuários nem permissões');
    }
  }
  const habilitados = new Set<string>(modules);

  /* Rótulos */
  if (raw.terms !== undefined) {
    if (!isRecord(raw.terms)) {
      erro('terms', 'precisa ser um objeto');
    } else {
      for (const [chave, valor] of Object.entries(raw.terms)) {
        /*
         * A chave precisa ser um recurso que o Core conhece.
         *
         * Sem isto, `erp.produtos` em vez de `erp.products` não dá erro: o
         * rótulo simplesmente nunca é aplicado, e a tela mostra o nome
         * genérico como se estivesse tudo certo. É o defeito que ninguém
         * encontra, porque não há sintoma — só ausência de efeito.
         */
        if (!TERMOS.has(chave)) {
          erro(`terms.${chave}`, `"${chave}" não é um recurso do Core`);
          continue;
        }
        if (habilitados.size > 0 && !habilitados.has(moduleOfTerm(chave))) {
          erro(
            `terms.${chave}`,
            `pertence ao módulo "${moduleOfTerm(chave)}", que este blueprint não habilita`,
          );
          continue;
        }

        if (!isRecord(valor)) {
          erro(`terms.${chave}`, 'precisa ter singular e plural');
          continue;
        }
        if (texto(valor.singular) === null) erro(`terms.${chave}.singular`, 'obrigatório');
        if (texto(valor.plural) === null) erro(`terms.${chave}.plural`, 'obrigatório');
      }
    }
  }

  /* Papéis */
  const codigosDePapel = new Set<string>();
  if (raw.roles !== undefined) {
    if (!Array.isArray(raw.roles)) {
      erro('roles', 'precisa ser uma lista');
    } else {
      raw.roles.forEach((papel, i) => {
        if (!isRecord(papel)) {
          erro(`roles[${i}]`, 'precisa ser um objeto');
          return;
        }

        const codigo = texto(papel.code);
        if (codigo === null) erro(`roles[${i}].code`, 'obrigatório');
        else if (!ROLE_CODE_FORMAT.test(codigo)) erro(`roles[${i}].code`, 'não é snake_case');
        else if (codigosDePapel.has(codigo)) erro(`roles[${i}].code`, `"${codigo}" repetido`);
        else codigosDePapel.add(codigo);

        if (texto(papel.name) === null) erro(`roles[${i}].name`, 'obrigatório');

        if (!Array.isArray(papel.permissions)) {
          erro(`roles[${i}].permissions`, 'precisa ser uma lista');
          return;
        }
        if (papel.permissions.length === 0) {
          erro(`roles[${i}].permissions`, 'papel sem permissão nenhuma não serve para nada');
        }

        papel.permissions.forEach((p, j) => {
          const caminho = `roles[${i}].permissions[${j}]`;
          if (typeof p !== 'string' || !PERMISSIONS.has(p)) {
            erro(caminho, `permissão "${String(p)}" não existe no catálogo`);
            return;
          }
          if (habilitados.size > 0 && !habilitados.has(moduleOf(p))) {
            erro(
              caminho,
              `"${p}" pertence ao módulo "${moduleOf(p)}", que este blueprint não habilita`,
            );
          }
        });
      });
    }
  }

  /* Sementes */
  if (raw.seeds !== undefined) {
    if (!Array.isArray(raw.seeds)) {
      erro('seeds', 'precisa ser uma lista');
    } else {
      raw.seeds.forEach((semente, i) => {
        if (!isRecord(semente)) {
          erro(`seeds[${i}]`, 'precisa ser um objeto');
          return;
        }
        if (texto(semente.entity) === null) erro(`seeds[${i}].entity`, 'obrigatório');
        if (!isRecord(semente.values)) erro(`seeds[${i}].values`, 'precisa ser um objeto');
      });
    }
  }

  /* Configurações */
  if (raw.settings !== undefined) {
    if (!isRecord(raw.settings)) {
      erro('settings', 'precisa ser um objeto');
    } else {
      for (const [chave, valor] of Object.entries(raw.settings)) {
        const def = settingDefinition(chave);
        if (def === null) {
          // Mesma armadilha dos rótulos: chave errada não dá erro, só não
          // tem efeito. O Blueprint escolhe o valor de uma configuração; ele
          // não decide que configurações existem (ADR-003).
          erro(`settings.${chave}`, `"${chave}" não é uma configuração do Core`);
          continue;
        }
        if (habilitados.size > 0 && !habilitados.has(def.module)) {
          erro(
            `settings.${chave}`,
            `pertence ao módulo "${def.module}", que este blueprint não habilita`,
          );
          continue;
        }
        const problema = checkSettingValue(def, valor);
        if (problema !== null) erro(`settings.${chave}`, problema);
      }
    }
  }

  if (problems.length > 0) return { valid: false, problems };

  return {
    valid: true,
    blueprint: {
      code: code as string,
      name: name as string,
      description: description as string,
      version: version as number,
      plan: plan as PlanCode,
      modules,
      terms: (raw.terms ?? {}) as Record<string, Term>,
      roles: (raw.roles ?? []) as BlueprintRole[],
      seeds: (raw.seeds ?? []) as SeedRecord[],
      settings: (raw.settings ?? {}) as Record<string, unknown>,
    },
  };
}

/**
 * O rótulo de uma chave neste nicho, ou o padrão quando o blueprint não diz.
 *
 * Cair no padrão é o comportamento certo: um blueprint que não traduz tudo
 * ainda funciona, e a interface mostra o nome genérico em vez de um espaço em
 * branco ou a própria chave.
 */
export function termFor(blueprint: Blueprint, key: string, fallback: Term): Term {
  return blueprint.terms[key] ?? fallback;
}

/** O blueprint habilita este módulo? */
export function enables(blueprint: Blueprint, module: ModuleCode): boolean {
  return blueprint.modules.includes(module);
}
