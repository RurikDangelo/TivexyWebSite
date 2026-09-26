/**
 * O estado que as Server Actions do chat devolvem.
 *
 * Fora de `actions.ts` porque um arquivo `'use server'` só pode exportar
 * função assíncrona — constante e tipo exportados de lá quebram a compilação.
 * É a mesma separação que `erp/financeiro/state.ts` faz.
 *
 * Todos convergem em `{ erro, ok }`, que é o formato que `<FormFeedback>`
 * consome — estruturalmente, sem importar o componente: `lib` não depende de
 * `components`, e um tipo de dado não precisa saber quem o desenha.
 *
 * `rodada` é o contador de sucessos: é ele que serve de `key` para limpar um
 * formulário sem `useEffect`, e é ele que o cliente compara para saber que
 * **esta** submissão deu certo — reagir a `ok !== null` dispararia também numa
 * renderização qualquer que carregue o mesmo estado.
 */

/** Uma ação sem formulário: entrar no canal, sair, remover alguém. */
export interface AcaoDoChat {
  erro: string | null;
  ok: string | null;
}

export const ACAO_INICIAL: AcaoDoChat = { erro: null, ok: null };

/** Criar e editar canal. */
export interface CanalFormState {
  erro: string | null;
  ok: string | null;
  rodada: number;
  /**
   * O id do canal recém-criado, para o cliente navegar até ele.
   *
   * Por que não um `redirect()` dentro da ação: o diálogo de criar mora no
   * `layout.tsx`, que **sobrevive** à navegação entre canais. Um redirect
   * trocaria a conversa ao lado e deixaria o diálogo aberto por cima, com o
   * formulário ainda preenchido — parecendo que não salvou. Devolvendo o id, o
   * cliente fecha o diálogo e navega, nessa ordem.
   */
  criado: string | null;
}

export const CANAL_INICIAL: CanalFormState = { erro: null, ok: null, rodada: 0, criado: null };

/**
 * Enviar e editar mensagem.
 *
 * Não carrega o texto digitado, de propósito: quem guarda o que a pessoa
 * escreveu é o `useState` do campo, no cliente. Devolver o texto pelo estado
 * do servidor faria o campo ser reescrito a cada resposta — inclusive por cima
 * do que ela digitou enquanto a anterior ainda estava em voo. É essa a
 * diferença entre "deu erro" e "deu erro e perdi o que escrevi".
 */
export interface MensagemFormState {
  erro: string | null;
  ok: string | null;
  rodada: number;
}

export const MENSAGEM_INICIAL: MensagemFormState = { erro: null, ok: null, rodada: 0 };
