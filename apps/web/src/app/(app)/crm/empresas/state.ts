/**
 * O estado do formulário de empresa.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

/** Os campos que a conferência sabe apontar. */
export type CampoEmpresa = 'name' | 'document' | 'email' | 'phone' | 'website';

export interface EmpresaFormState {
  erro: string | null;
  /** Problemas por campo, para marcar o input em vez de só avisar em cima. */
  campos: Readonly<Partial<Record<CampoEmpresa, string>>>;
  /** Nome de quem acabou de entrar, para a confirmação. */
  criado: string | null;
}

export const EMPRESA_INICIAL: EmpresaFormState = { erro: null, campos: {}, criado: null };

/** Uma empresa na listagem. */
export interface EmpresaListada {
  id: string;
  name: string;
  legalName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
}
