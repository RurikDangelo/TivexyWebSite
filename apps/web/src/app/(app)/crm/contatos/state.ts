/**
 * O estado do formulário de contato.
 *
 * Fora de `actions.ts` pela regra do Next: arquivo `'use server'` só exporta
 * função assíncrona. Ver `app/(auth)/form-state.ts`.
 */

/** Os campos que a conferência sabe apontar. */
export type CampoContato = 'name' | 'email' | 'phone' | 'company_id';

export interface ContatoFormState {
  erro: string | null;
  /** Problemas por campo, para marcar o input em vez de só avisar em cima. */
  campos: Readonly<Partial<Record<CampoContato, string>>>;
  /** Nome de quem acabou de entrar, para a confirmação. */
  criado: string | null;
}

export const CONTATO_INICIAL: ContatoFormState = { erro: null, campos: {}, criado: null };

/** Uma pessoa na listagem. */
export interface ContatoListado {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  /** O nome da conta, já resolvido — a tela não faz uma consulta por linha. */
  empresa: string | null;
  createdAt: string;
}

/** Uma conta oferecida na escolha. */
export interface EmpresaOferecida {
  id: string;
  nome: string;
}
