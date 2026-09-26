import type { AutomationAction, AutomationCondition, AutomationTrigger } from '@tivexy/core';

/** Estado do editor de automação. Fora de `actions.ts`: ver a regra do Next. */
export interface RegraState {
  erro: string | null;
  /** Por campo, com as chaves de `checkAutomationRule`: `nome`, `condicoes.0`, `destino`… */
  problemas: Record<string, string>;
  ok: string | null;
  /** Quantas vezes deu certo — a `key` que limpa o editor de cadastro. */
  rodada: number;
}

export const REGRA_INICIAL: RegraState = { erro: null, problemas: {}, ok: null, rodada: 0 };

/** Retorno de ligar, desligar e excluir. */
export interface AcaoState {
  erro: string | null;
}

export const ACAO_INICIAL: AcaoState = { erro: null };

export interface RegraNaTela {
  id: string;
  nome: string;
  gatilho: AutomationTrigger;
  condicoes: AutomationCondition[];
  acao: AutomationAction;
  params: Record<string, string | number>;
  ativa: boolean;
}

export interface ExecucaoNaTela {
  id: string;
  regraId: string;
  gatilho: string;
  deuCerto: boolean;
  detalhe: string | null;
  payload: Record<string, unknown>;
  quando: string;
}
