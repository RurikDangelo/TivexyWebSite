/**
 * Chat interno da equipe — as regras que não dependem de banco.
 *
 * **Só o chat interno.** Conversa com cliente por WhatsApp depende de conta,
 * número aprovado e credencial da Meta: é `BLOCKED — EXTERNAL`, não existe
 * neste arquivo e não deve ser improvisada a partir dele.
 *
 * O que mora aqui é o que a tela precisa decidir sem perguntar ao servidor:
 * quantas não lidas, como agrupar a sequência de mensagens do mesmo autor,
 * como escrever o "quando", e quem pode editar ou apagar. A mesma regra vive
 * no banco onde ela precisa ser garantida — e `supabase/tests/chat.test.mjs`
 * compara as duas, porque tela que oferece "editar" onde o banco recusa é pior
 * que tela sem botão.
 */

import { addDays, dateIn, daysBetween, timeIn } from './calendar.ts';

/**
 * Por quanto tempo o autor edita a própria mensagem.
 *
 * Existe janela porque editar reescreve, sem aviso, o que os outros já leram —
 * e uma decisão combinada no chat vira outra decisão. Curta o bastante para
 * cobrir o erro de digitação, curta demais para reescrever a história.
 *
 * Espelha `public.chat_edit_window()` no SQL.
 */
export const CHAT_EDIT_WINDOW_MINUTES = 15;

/**
 * A janela que junta mensagens seguidas do mesmo autor num bloco só.
 *
 * É apresentação, não regra de negócio: cinco mensagens em vinte segundos são
 * uma fala, e repetir nome e horário em cada uma transforma a conversa numa
 * planilha.
 */
export const CHAT_GROUP_WINDOW_MINUTES = 5;

/** Espelha `chat_messages_body_size`. */
export const CHAT_MESSAGE_MAX_LENGTH = 4000;

/**
 * O mínimo que as regras daqui precisam de uma mensagem.
 *
 * Deliberadamente menos que a linha do banco: a tela passa o que tiver, e uma
 * assinatura que exigisse a linha inteira obrigaria a inventar campos nos
 * testes e nas listas parciais.
 */
export type ChatMessage = {
  readonly id: string;
  /** Nulo quando quem escreveu saiu da empresa. */
  readonly authorId: string | null;
  readonly createdAt: string;
  readonly editedAt?: string | null;
  readonly deletedAt?: string | null;
  readonly replyToId?: string | null;
};

/** Quem está olhando a conversa. `isModerator` é `core.users.write` no banco. */
export type ChatViewer = {
  readonly id: string;
  readonly isModerator: boolean;
};

/* ── Não lidas ────────────────────────────────────────────────────────── */

/**
 * Quantas mensagens contam como não lidas para quem está olhando.
 *
 * Três exclusões, e cada uma tem motivo:
 *
 *   * a própria mensagem nunca conta — ninguém tem recado de si mesmo;
 *   * apagada não conta — o selo fica na conversa, mas não é aviso;
 *   * `lastReadAt` nulo significa **nunca leu**, e aí tudo conta. Tratar nulo
 *     como "leu tudo" faria o canal novo nascer sem aviso nenhum.
 *
 * A comparação é estrita (`>`): o marcador guarda o instante em que a pessoa
 * leu, e a mensagem que chegou exatamente nele já estava na tela.
 */
export function unreadCount(
  messages: readonly ChatMessage[],
  viewerId: string,
  lastReadAt: string | null,
): number {
  return messages.filter((m) => isUnread(m, viewerId, lastReadAt)).length;
}

/**
 * A primeira não lida — é nela que a tela desenha a linha "novas mensagens".
 *
 * Devolve o id, e não o índice: a lista da tela é paginada por cursor, e um
 * índice deixaria de valer na página seguinte.
 */
export function firstUnreadId(
  messages: readonly ChatMessage[],
  viewerId: string,
  lastReadAt: string | null,
): string | null {
  const ordenadas = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return ordenadas.find((m) => isUnread(m, viewerId, lastReadAt))?.id ?? null;
}

function isUnread(m: ChatMessage, viewerId: string, lastReadAt: string | null): boolean {
  if (m.deletedAt != null) return false;
  if (m.authorId === viewerId) return false;
  if (lastReadAt === null) return true;
  return new Date(m.createdAt).getTime() > new Date(lastReadAt).getTime();
}

/* ── Agrupamento ──────────────────────────────────────────────────────── */

/** Mensagens seguidas do mesmo autor, apresentadas como um bloco. */
export type ChatGroup<T extends ChatMessage> = {
  readonly authorId: string | null;
  readonly startedAt: string;
  readonly messages: readonly T[];
};

/**
 * Agrupa mensagens consecutivas do mesmo autor dentro de uma janela de tempo.
 *
 * Entra em ordem cronológica **crescente** e sai na mesma ordem — a tela que
 * carrega do mais novo para o mais antigo inverte antes de chamar, porque
 * agrupar de trás para a frente inverteria também a ordem dentro do bloco.
 *
 * Quebra o bloco quando:
 *
 *   * o autor muda;
 *   * passou mais que a janela desde a mensagem anterior — pausa longa é outro
 *     momento da conversa, e o horário precisa reaparecer;
 *   * a mensagem é resposta a outra — ela abre o próprio contexto, e engolida
 *     no bloco anterior perderia a citação;
 *   * o autor é nulo (saiu da empresa). Dois ex-membros diferentes viram o
 *     mesmo `null`, e juntá-los atribuiria a fala de um ao outro.
 */
export function groupMessages<T extends ChatMessage>(
  messages: readonly T[],
  windowMinutes: number = CHAT_GROUP_WINDOW_MINUTES,
): ChatGroup<T>[] {
  const janelaMs = windowMinutes * 60_000;
  const grupos: { authorId: string | null; startedAt: string; messages: T[] }[] = [];

  for (const mensagem of messages) {
    const atual = grupos[grupos.length - 1];
    const anterior = atual?.messages[atual.messages.length - 1];

    if (
      atual !== undefined &&
      anterior !== undefined &&
      atual.authorId !== null &&
      mensagem.authorId === atual.authorId &&
      (mensagem.replyToId ?? null) === null &&
      new Date(mensagem.createdAt).getTime() - new Date(anterior.createdAt).getTime() <= janelaMs
    ) {
      atual.messages.push(mensagem);
    } else {
      grupos.push({
        authorId: mensagem.authorId,
        startedAt: mensagem.createdAt,
        messages: [mensagem],
      });
    }
  }

  return grupos;
}

/* ── "Quando" ─────────────────────────────────────────────────────────── */

/**
 * O horário como a conversa escreve: relativo perto, absoluto longe.
 *
 * O fuso é o do tenant, pelo mesmo motivo do resto do sistema: às 22h de São
 * Paulo já é amanhã em UTC, e a mensagem de hoje à noite apareceria como
 * "ontem" para quem a leu dez minutos depois.
 *
 * Instante no futuro (relógio do cliente adiantado) cai em "agora" em vez de
 * "há -3 min", que seria a forma mais boba de parecer quebrado.
 */
export function relativeTime(at: string | Date, now: Date, timeZone: string): string {
  const instante = typeof at === 'string' ? new Date(at) : at;
  const segundos = Math.floor((now.getTime() - instante.getTime()) / 1000);

  if (segundos < 60) return 'agora';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;

  const hoje = dateIn(now, timeZone);
  const dia = dateIn(instante, timeZone);
  const hora = timeIn(instante, timeZone);

  if (dia === hoje) return hora;
  if (dia === addDays(hoje, -1)) return `ontem ${hora}`;

  const [ano, mes, numero] = dia.split('-') as [string, string, string];
  /* Dentro da semana o ano é ruído: ninguém se pergunta de que ano é terça. */
  if (daysBetween(dia, hoje) < 7) return `${numero}/${mes} ${hora}`;
  return `${numero}/${mes}/${ano}`;
}

/* ── Quem pode editar e apagar ────────────────────────────────────────── */

/** Por que a edição está fechada. `null` quando está aberta. */
export type ChatEditBlock = 'not-author' | 'deleted' | 'window-closed';

/**
 * Editar é do autor, dentro da janela, e só enquanto a mensagem existir.
 *
 * Moderador **não** entra aqui de propósito, e é a assimetria central deste
 * arquivo: ele apaga, não reescreve. Texto editado continua assinado por quem
 * escreveu — pôr palavra na boca de alguém é pior que apagar o que ele disse.
 */
export function editBlock(
  message: ChatMessage,
  viewer: ChatViewer,
  now: Date,
): ChatEditBlock | null {
  if (message.authorId === null || message.authorId !== viewer.id) return 'not-author';
  if (message.deletedAt != null) return 'deleted';
  const idadeMs = now.getTime() - new Date(message.createdAt).getTime();
  if (idadeMs > CHAT_EDIT_WINDOW_MINUTES * 60_000) return 'window-closed';
  return null;
}

/** Atalho de `editBlock() === null`, para o `disabled` do botão. */
export function canEditMessage(message: ChatMessage, viewer: ChatViewer, now: Date): boolean {
  return editBlock(message, viewer, now) === null;
}

/**
 * Apagar é do autor a qualquer tempo, ou de quem modera.
 *
 * Sem janela: o arrependimento de ter escrito não vence em quinze minutos. Já
 * apagada não se apaga de novo — no banco isso é silêncio (o pedido é o
 * mesmo), e na tela é um botão que some.
 */
export function canDeleteMessage(message: ChatMessage, viewer: ChatViewer): boolean {
  if (message.deletedAt != null) return false;
  if (message.authorId !== null && message.authorId === viewer.id) return true;
  return viewer.isModerator;
}

/* ── Corpo da mensagem ────────────────────────────────────────────────── */

export type ChatBodyCheck =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too-long' };

/**
 * O que a tela aceita mandar — a mesma regra das constraints
 * `chat_messages_body_not_blank` e `chat_messages_body_size`.
 *
 * Devolve o corpo já aparado, porque é ele que vai para o banco: validar uma
 * coisa e enviar outra é como o espaço em branco vira mensagem vazia gravada.
 */
export function checkMessageBody(body: string): ChatBodyCheck {
  const corpo = body.trim();
  if (corpo === '') return { ok: false, reason: 'empty' };
  if (corpo.length > CHAT_MESSAGE_MAX_LENGTH) return { ok: false, reason: 'too-long' };
  return { ok: true, body: corpo };
}
