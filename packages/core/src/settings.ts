/**
 * As configurações que um tenant tem, e o que cada uma aceita.
 *
 * Existe por causa da fronteira do ADR-003: **o Blueprint escolhe o valor de
 * uma configuração; ele não decide que configurações existem.** Sem este
 * catálogo, `settings` é um `jsonb` livre — um blueprint pode escrever
 * `{ "moeda": "BRL" }` e nada reclama, porque nada sabe que a chave certa é
 * `core.currency`. O sintoma é o pior possível: silêncio. A configuração
 * simplesmente nunca é aplicada, e a tela mostra o padrão como se estivesse
 * certo.
 *
 * A lista é curta de propósito. Só entra configuração que alguma coisa vai de
 * fato consumir — declarar trinta opções "para o futuro" produz superfície que
 * ninguém mantém e que o Super Admin precisa entender.
 *
 * **Adicionar uma configuração é mudança de Core, não de Blueprint.** É a regra
 * do ADR-003 funcionando: quando um nicho precisa de algo que não está aqui, a
 * resposta é construir no Core, não inventar uma chave nova no documento.
 */

import { type ModuleCode } from './catalog.ts';

export type SettingType = 'string' | 'boolean' | 'number' | 'enum';

export interface SettingDefinition {
  /** `modulo.chave`. O módulo precisa estar habilitado para valer. */
  key: string;
  module: ModuleCode;
  type: SettingType;
  /** O que vale quando o blueprint não diz nada. */
  default: string | number | boolean;
  /** Valores aceitos, só para `enum`. */
  options?: readonly string[];
  /** Como explicar isto para quem vai configurar. */
  description: string;
}

/**
 * Moedas suportadas.
 *
 * Uma só, e isso é honesto: nada no sistema formata, converte ou fecha caixa em
 * outra moeda. Listar `USD` aqui seria oferecer uma opção que não funciona.
 * A lista cresce quando o suporte crescer.
 */
const CURRENCIES = ['BRL'] as const;

export const TENANT_SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'core.currency',
    module: 'core',
    type: 'enum',
    options: CURRENCIES,
    default: 'BRL',
    description: 'Moeda em que os valores são exibidos e registrados.',
  },
  {
    key: 'core.timezone',
    module: 'core',
    type: 'string',
    default: 'America/Sao_Paulo',
    description: 'Fuso horário do tenant. Define o que é "hoje" em relatórios.',
  },
  {
    key: 'crm.contact_requires_document',
    module: 'crm',
    type: 'boolean',
    default: false,
    description: 'Exigir CPF ou CNPJ ao cadastrar contato.',
  },
  {
    key: 'erp.sales_requires_customer',
    module: 'erp',
    type: 'boolean',
    default: true,
    description: 'Exigir cliente identificado na venda. Balcão costuma desligar.',
  },
  {
    key: 'inventory.deduct_on_sale',
    module: 'inventory',
    type: 'boolean',
    default: true,
    description: 'Baixar estoque automaticamente ao registrar venda.',
  },
];

const PORCHAVE = new Map(TENANT_SETTINGS.map((s) => [s.key, s]));

export function settingDefinition(key: string): SettingDefinition | null {
  return PORCHAVE.get(key) ?? null;
}

/**
 * Este fuso existe?
 *
 * Pergunta ao formatador em vez de consultar `Intl.supportedValuesOf`, que
 * devolve só os nomes **canônicos** e por isso recusa apelidos legítimos como
 * `UTC`. E pergunta em vez de manter lista própria: são centenas de zonas IANA,
 * elas mudam, e cópia escrita à mão é divergência garantida.
 *
 * O critério certo é "o runtime consegue formatar uma data neste fuso?" —
 * porque é exatamente isso que o sistema vai fazer com o valor.
 */
function fusoValido(valor: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

/**
 * O valor serve para esta configuração? Devolve o motivo, ou `null` se serve.
 *
 * Devolve texto em vez de booleano porque quem chama precisa dizer **o que**
 * está errado: "esperava verdadeiro ou falso" resolve; "valor inválido" manda
 * a pessoa adivinhar.
 */
export function checkSettingValue(def: SettingDefinition, value: unknown): string | null {
  switch (def.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : 'esperava verdadeiro ou falso';

    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'esperava um número';

    case 'enum':
      if (typeof value !== 'string') return 'esperava texto';
      return def.options?.includes(value)
        ? null
        : `valor não suportado; aceitos: ${def.options?.join(', ')}`;

    case 'string':
      if (typeof value !== 'string' || value.trim().length === 0) return 'esperava texto';
      if (def.key === 'core.timezone' && !fusoValido(value)) return 'fuso horário desconhecido';
      return null;
  }
}

/**
 * As configurações efetivas de um tenant: padrão, com o que o blueprint mudou.
 *
 * **O que fica gravado em `tenants.settings` é só o que foi mudado, não o
 * resultado desta função.** A diferença importa: guardando o efetivo, uma
 * configuração nova nasceria ausente em todo tenant que já existe, e mudar um
 * padrão exigiria migração. Guardando só a diferença, um padrão novo alcança
 * todo mundo no próximo carregamento — e ainda dá para responder "o que este
 * cliente mudou de propósito?", que some quando tudo é gravado junto.
 *
 * Só entram as de módulos habilitados. Um tenant sem estoque não tem
 * `inventory.deduct_on_sale` — nem como `false`, nem como nada: a configuração
 * não existe para ele, e mostrá-la desligada sugeriria que ligar resolveria
 * alguma coisa.
 *
 * Valor desconhecido nos `overrides` é ignorado, não copiado. Este resultado
 * alimenta a interface, e deixar passar uma chave inválida faria a tela
 * exibir configuração que o sistema nunca vai ler.
 */
export function resolveSettings(
  overrides: Readonly<Record<string, unknown>>,
  enabledModules: readonly ModuleCode[],
): Record<string, string | number | boolean> {
  const habilitados = new Set<string>(enabledModules);
  const efetivas: Record<string, string | number | boolean> = {};

  for (const def of TENANT_SETTINGS) {
    if (!habilitados.has(def.module)) continue;

    const informado = overrides[def.key];
    efetivas[def.key] =
      informado !== undefined && checkSettingValue(def, informado) === null
        ? (informado as string | number | boolean)
        : def.default;
  }

  return efetivas;
}
