import type { ContactField } from '@/lib/crm/contact-input';

/** Estado dos formulários de pessoa. Fora de `actions.ts`: ver a regra do Next. */
export interface ContatoFormState {
  erro: string | null;
  campos: Partial<Record<ContactField, string>>;
  salvo: string | null;
}

export const CONTATO_INICIAL: ContatoFormState = { erro: null, campos: {}, salvo: null };

export interface Opcao {
  id: string;
  nome: string;
}

/** Quantas pessoas por página. Lista maior que isso é trabalho para a busca. */
export const POR_PAGINA = 50;
