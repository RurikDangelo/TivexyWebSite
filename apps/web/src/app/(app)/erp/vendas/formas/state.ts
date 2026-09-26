import type { PaymentMethodField } from '@/lib/erp/payment-method-input';

/** Estado dos formulários de forma de pagamento. Fora de `actions.ts`: ver a regra do Next. */
export interface FormaState {
  erro: string | null;
  campos: Partial<Record<PaymentMethodField, string>>;
  ok: string | null;
  /** Quantas vezes deu certo — a `key` que limpa o formulário de cadastro. */
  rodada: number;
}

export const FORMA_INICIAL: FormaState = { erro: null, campos: {}, ok: null, rodada: 0 };

export interface FormaNaTela {
  id: string;
  nome: string;
  codigo: string | null;
  prazoEmDias: number;
  ativa: boolean;
  /** Quantas vendas usaram — é o que impede apagar, e o que a tela explica. */
  usos: number;
}
