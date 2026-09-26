/**
 * O estado dos formulários de entrada.
 *
 * Vive fora de `actions.ts` por uma regra do Next que não aparece em tempo de
 * compilação: **um arquivo `'use server'` só pode exportar função assíncrona.**
 * Tudo que ele exporta vira um endpoint com identificador próprio, e um objeto
 * não tem como ser chamado — então a exportação é recusada.
 *
 * O erro só aparece quando o formulário é enviado de verdade, como
 * `A "use server" file can only export async functions, found object`, e a
 * pilha aponta para a página, não para a exportação. `tsc` e `next build`
 * passam sem reclamar.
 *
 * Tipo puro pode ficar lá — some na compilação. Valor, não.
 */

export interface FormState {
  /** Mensagem de erro para quem preencheu. `null` quando ainda não houve envio. */
  erro: string | null;
  /** Confirmação, para os fluxos que não redirecionam. */
  aviso?: string;
}

export const ESTADO_INICIAL: FormState = { erro: null };
