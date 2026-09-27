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
  /**
   * A mesma data, crua. Ordenar por texto `dd/mm/aaaa` põe 01/2025 antes de
   * 31/2024 — a coluna pareceria ordenada e não estaria.
   */
  desdeIso: string | null;
  voce: boolean;
}

export interface Papel {
  id: string;
  nome: string;
  sistema: boolean;
}

export interface DescricaoDaSituacao {
  /** Frase, não enum: é o que a pessoa lê no selo, no filtro e no KPI. */
  rotulo: string;
  tom: 'success' | 'warning' | 'neutral';
}

/**
 * As três situações do vínculo, escritas uma vez só.
 *
 * Mora aqui, e não no componente de linha, porque a página (Server Component)
 * precisa dos mesmos rótulos para a faixa de indicadores e para o filtro —
 * e duas listas de rótulos para a mesma coluna é como um "Suspenso" vira
 * "Acesso suspenso" só num canto da tela.
 *
 * Sem ícone de propósito: `actions.ts` (`'use server'`) importa deste módulo,
 * e trazer `lucide-react` para dentro do grafo das Server Actions é peso que
 * nenhuma delas usa. Quem desenha o selo escolhe o símbolo.
 */
export const SITUACAO: Record<MembershipStatus, DescricaoDaSituacao> = {
  active: { rotulo: 'Com acesso', tom: 'success' },
  invited: { rotulo: 'Convite pendente', tom: 'warning' },
  suspended: { rotulo: 'Acesso suspenso', tom: 'neutral' },
};

/** Quem aparece primeiro quando ninguém pediu ordem: quem já trabalha. */
export const ORDEM_DA_SITUACAO: Record<MembershipStatus, number> = {
  active: 0,
  invited: 1,
  suspended: 2,
};
