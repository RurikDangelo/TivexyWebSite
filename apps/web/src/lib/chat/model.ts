/**
 * O que a tela do chat interno manipula.
 *
 * Tipos de apresentação, não linhas do banco. A tradução de `chat_channels`,
 * `chat_messages` e companhia acontece uma vez, em `read.ts`, e daí para baixo
 * ninguém mais precisa lembrar que `is_private` é `restrito` nem que
 * `deleted_at` nulo é o normal. Quando o esquema mudar, muda o mapeamento —
 * não as vinte telas.
 *
 * Este arquivo é importado por componente de cliente, então não pode carregar
 * `server-only`, acesso a banco nem nada de Node: só tipos e constantes.
 *
 * ## Isto é chat INTERNO da equipe
 *
 * Nada aqui fala com cliente. Conversa com cliente por WhatsApp depende de
 * conta Meta, número aprovado e credencial — é `BLOCKED — EXTERNAL`, está
 * escrito na tela, e não se improvisa a partir destes tipos.
 */

/**
 * Quantas mensagens a conversa carrega de uma vez.
 *
 * Um número só, e grande o bastante para que a maioria dos canais caiba
 * inteira: paginar para trás em conversa é a interação mais difícil de acertar
 * sem tempo real, e a primeira versão não a tem. Quando o canal passa disso, a
 * tela **diz** que está mostrando as últimas — ver `ConversaLida.truncada`.
 */
export const MENSAGENS_POR_PAGINA = 80;

/**
 * De quanto em quanto tempo a tela busca o que chegou.
 *
 * **Não há tempo real neste projeto** — nem WebSocket, nem Supabase Realtime.
 * O que existe é isto: um `router.refresh()` no relógio, que é uma escolha
 * honesta desde que a interface diga que é assim e mostre de quando é o que
 * está na tela. Ver `components/refresh.tsx`.
 *
 * 20 segundos é o meio-termo entre parecer parado e transformar cada aba
 * aberta num cliente que consulta o banco três vezes por minuto para sempre.
 */
export const INTERVALO_DE_ATUALIZACAO_MS = 20_000;

/** Um canal na barra lateral. */
export interface CanalNaLista {
  id: string;
  nome: string;
  descricao: string | null;
  /** `is_private`: só quem participa enxerga. Imutável depois de criado. */
  restrito: boolean;
  /**
   * Tem linha em `chat_channel_members`.
   *
   * Em canal restrito é o que dá o acesso. Em canal público é só o marcador de
   * leitura — e a ausência dele significa **nunca lido**, não "lido tudo".
   */
  participo: boolean;
  /**
   * `null` quando a contagem falhou. Zero é zero de verdade.
   *
   * A distinção importa: um badge apagado porque o banco não respondeu é a
   * mesma tela de "não há nada novo", e as duas coisas são opostas.
   */
  naoLidas: number | null;
  mencoesNaoLidas: number | null;
  ultimaMensagemEm: string | null;
}

/** O canal aberto, com o que só a conversa precisa saber. */
export interface CanalAberto {
  id: string;
  nome: string;
  descricao: string | null;
  restrito: boolean;
  /** `null` quando quem criou saiu da empresa. O canal é da empresa. */
  criadoPor: string | null;
  participo: boolean;
  /** Marcador de leitura desta pessoa. `null` = nunca abriu. */
  lidoAte: string | null;
}

/** A mensagem citada por uma resposta, do jeito que aparece acima dela. */
export interface TrechoCitado {
  id: string;
  /** `null` quando quem escreveu saiu da empresa. */
  autorNome: string | null;
  /** Recortado — a citação é referência, não a mensagem de novo. */
  trecho: string;
  apagada: boolean;
}

/** Uma mensagem, pronta para desenhar. */
export interface MensagemNaTela {
  id: string;
  autorId: string | null;
  /** `null` quando quem escreveu não está mais na equipe. */
  autorNome: string | null;
  souEuQuemEscreveu: boolean;
  /** Vazio quando apagada — o banco esvazia a coluna, não só a tela. */
  corpo: string;
  criadaEm: string;
  editadaEm: string | null;
  apagadaEm: string | null;
  respondeA: TrechoCitado | null;
  mencionaVoce: boolean;
  /** `editBlock`/`canDeleteMessage` do Core, resolvidos no servidor. */
  possoEditar: boolean;
  possoApagar: boolean;
}

/** Quem participa do canal. */
export interface ParticipanteDoCanal {
  userId: string;
  nome: string;
  entrouEm: string;
  souEu: boolean;
}

/** O resultado de ler a conversa de um canal. */
export interface ConversaLida {
  mensagens: readonly MensagemNaTela[];
  /** Havia mais do que `MENSAGENS_POR_PAGINA`: a tela mostra só o fim. */
  truncada: boolean;
  /** A leitura falhou. Difere de "canal sem mensagem" e a tela também difere. */
  falhou: boolean;
  /** Id da primeira não lida, para a régua "novas mensagens". */
  primeiraNaoLida: string | null;
}

/**
 * Quem está olhando, do ponto de vista do chat.
 *
 * `moderador` é `core.users.write` — a mesma permissão que
 * `chat_is_moderator()` consulta no banco. Não existe permissão própria de
 * chat, e isso é decisão do esquema, não esquecimento: falar com os colegas é
 * do vínculo, moderar é de quem já administra pessoas.
 */
export interface QuemOlha {
  userId: string;
  moderador: boolean;
}
