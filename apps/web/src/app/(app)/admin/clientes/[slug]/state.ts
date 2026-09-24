import type { MembershipStatus, PlanCode, SystemRoleCode, TenantStatus } from '@tivexy/core';

/**
 * Os estados dos formulários da ficha do cliente.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

export interface EdicaoState {
  erro: string | null;
  campos: Readonly<Partial<Record<'name' | 'document' | 'timezone', string>>>;
  salvo: boolean;
}

export const EDICAO_INICIAL: EdicaoState = { erro: null, campos: {}, salvo: false };

export interface CicloState {
  erro: string | null;
  /** O estado que passou a valer, para a confirmação dizer o que houve. */
  agora: TenantStatus | null;
}

export const CICLO_INICIAL: CicloState = { erro: null, agora: null };

export interface PlanoState {
  erro: string | null;
  resultado: { plano: PlanCode; habilitados: number; desabilitados: number } | null;
}

export const PLANO_INICIAL: PlanoState = { erro: null, resultado: null };

export interface ConviteState {
  erro: string | null;
  campos: Readonly<Partial<Record<'email' | 'nome' | 'papel', string>>>;
  /**
   * O convite criado. `link` é credencial: aparece uma vez, não é gravado e
   * não entra em log. Ver `admin/access-link.ts`.
   */
  criado: { email: string; link: string | null; jaExistia: boolean } | null;
}

export const CONVITE_ADMIN_INICIAL: ConviteState = { erro: null, campos: {}, criado: null };

/** Um membro da equipe do cliente, na listagem. */
export interface MembroListado {
  userId: string;
  nome: string | null;
  email: string;
  papel: string;
  status: MembershipStatus;
  entrouEm: string | null;
}

/** Uma execução de provisionamento, no histórico. */
export interface ExecucaoListada {
  id: string;
  status: string;
  etapa: string | null;
  erro: string | null;
  criadaEm: string;
  terminadaEm: string | null;
  etapas: { nome: string; status: string }[];
}

/** Como cada estado de vínculo se chama na tela. */
export const MEMBRO_LABEL: Record<MembershipStatus, string> = {
  invited: 'Convidado',
  active: 'Ativo',
  suspended: 'Suspenso',
};

export const MEMBRO_TOM: Record<MembershipStatus, 'neutral' | 'success' | 'warning'> = {
  invited: 'warning',
  active: 'success',
  suspended: 'neutral',
};

/** Como cada papel de sistema se chama na tela. */
export const PAPEL_LABEL: Record<SystemRoleCode, string> = {
  tenant_admin: 'Administrador',
  manager: 'Gestor',
  collaborator: 'Colaborador',
};
