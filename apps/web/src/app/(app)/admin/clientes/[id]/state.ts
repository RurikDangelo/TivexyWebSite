import type { ModuleCode } from '@tivexy/core';

import type { TenantField } from '@/lib/admin/tenant-input';

/** Estado dos formulários do cliente no Admin. Fora de `actions.ts`: ver a regra do Next. */
export interface ClienteState {
  erro: string | null;
  ok: string | null;
  campos: Partial<Record<TenantField, string>>;
  /** Quantas vezes deu certo — a `key` que limpa o formulário que precisa ser limpo. */
  rodada: number;
}

export const CLIENTE_INICIAL: ClienteState = { erro: null, ok: null, campos: {}, rodada: 0 };

export interface PlanoNaTela {
  codigo: string;
  nome: string;
  modulos: ModuleCode[];
}

export interface ModuloNaTela {
  codigo: ModuleCode;
  nome: string;
  ligado: boolean;
}
