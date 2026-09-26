/**
 * O estado do formulário de criar cliente.
 *
 * Fora de `actions.ts` pela mesma regra: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

export interface CriarClienteState {
  erro: string | null;
  /** Problemas por campo, no formato de `checkBlueprint`. */
  problemas: readonly { path: string; message: string }[];
  sucesso: {
    tenantId: string;
    slug: string;
    runId: string;
    adminEmail: string;
    reaproveitado: boolean;
    sementesPendentes: number;
  } | null;
}

export const CRIAR_INICIAL: CriarClienteState = { erro: null, problemas: [], sucesso: null };

/**
 * O resultado de retomar ou desfazer.
 *
 * Um campo para cada desfecho em vez de um booleano: a mensagem de sucesso
 * precisa dizer **o que** foi desfeito, e a de erro **onde** parou de novo.
 */
export interface RecoveryState {
  erro: string | null;
  aviso: string | null;
}

export const RECUPERACAO_INICIAL: RecoveryState = { erro: null, aviso: null };

/** O link de acesso gerado para repassar a quem foi convidado. */
export interface AccessLinkState {
  erro: string | null;
  link: string | null;
  email: string | null;
}

export const LINK_INICIAL: AccessLinkState = { erro: null, link: null, email: null };
