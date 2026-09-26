import type { MembershipStatus } from '@tivexy/core';

/** Estado e tipos da tela de equipe. Fora de `actions.ts`: ver a regra do Next. */

export interface EquipeState {
  erro: string | null;
  campos: Readonly<Partial<Record<'email' | 'nome' | 'papel', string>>>;
  ok: string | null;
  /**
   * O link de acesso, quando pode sair — ver `lib/team/link-policy.ts`. É
   * credencial: aparece uma vez, na tela de quem convidou, e não é guardado.
   */
  link: string | null;
}

export const EQUIPE_INICIAL: EquipeState = { erro: null, campos: {}, ok: null, link: null };

export interface MembroNaTela {
  vinculoId: string;
  nome: string;
  email: string | null;
  papelId: string;
  papel: string;
  status: MembershipStatus;
  /** Desde quando entrou, já formatado. `null` para convite pendente. */
  desde: string | null;
  voce: boolean;
}

export interface Papel {
  id: string;
  nome: string;
  sistema: boolean;
}
