import type { CompanyField } from '@/lib/crm/company-input';

/** Estado dos formulários de conta. Fora de `actions.ts`: ver a regra do Next. */
export interface ContaFormState {
  erro: string | null;
  campos: Partial<Record<CompanyField, string>>;
  salvo: string | null;
}

export const CONTA_INICIAL: ContaFormState = { erro: null, campos: {}, salvo: null };

export interface Opcao {
  id: string;
  nome: string;
}

export const POR_PAGINA = 50;
