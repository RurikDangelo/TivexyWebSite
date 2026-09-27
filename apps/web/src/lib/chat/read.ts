import 'server-only';

/**
 * A leitura do chat interno — tudo o que a tela precisa saber, num lugar só.
 *
 * Toda consulta daqui passa pelo RLS: `chat_channel_visible()` é quem decide
 * se um canal restrito existe para quem pergunta. Os `eq('tenant_id', …)` são
 * o de sempre — o banco é o piso, não o filtro.
 *
 * Nada aqui escreve. Escrita é `actions.ts`, e no banco ela não tem privilégio
 * de tabela: passa por função `security definer`.
 */

import {
  type ChatMessage,
  type ChatViewer,
  canDeleteMessage,
  canEditMessage,
  firstUnreadId,
} from '@tivexy/core';
import { cache } from 'react';

import { type Member, nomeDe, tenantMembers } from '../members.ts';
import { supabaseServer } from '../supabase/server.ts';
import {
  type CanalAberto,
  type CanalNaLista,
  type ConversaLida,
  MENSAGENS_POR_PAGINA,
  type MensagemNaTela,
  type ParticipanteDoCanal,
  type QuemOlha,
  type TrechoCitado,
} from './model.ts';

/* ── Canais ───────────────────────────────────────────────────────────── */

/** O que a barra lateral recebe. `falhou` separa "sem canal" de "não li". */
export interface CanaisLidos {
  canais: readonly CanalNaLista[];
  falhou: boolean;
  /** A contagem de não lidas falhou, mas a lista de canais veio. */
  contagemFalhou: boolean;
}

interface LinhaDeContagem {
  channel_id: string;
  unread: number | string;
  unread_mentions: number | string;
  last_message_at: string | null;
}

/* `count(...)` do Postgres é `bigint`, e o PostgREST o devolve como string. */
function comoNumero(valor: unknown): number {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Os canais que esta pessoa alcança, com as não lidas de cada um.
 *
 * Três leituras em paralelo porque respondem a perguntas diferentes e nenhuma
 * depende do resultado da outra:
 *
 *   * `chat_channels` diz quais existem para quem pergunta (o RLS filtra);
 *   * `chat_unread_counts()` conta, sob o mesmo RLS;
 *   * `chat_channel_members` diz de quais eu participo — que em canal público
 *     é diferente de "alcanço", e é o que decide mostrar "Entrar".
 *
 * Se a contagem falhar e a lista vier, a lista aparece: um chat sem os números
 * ainda é um chat. O que não pode é o zero falso, e por isso `naoLidas` vira
 * `null` — a tela escreve que não conseguiu contar.
 */
export const lerCanais = cache(async (tenantId: string, userId: string): Promise<CanaisLidos> => {
  const supabase = await supabaseServer();

  const [canais, contagens, participacoes] = await Promise.all([
    supabase
      .from('chat_channels')
      .select('id, name, description, is_private')
      .eq('tenant_id', tenantId)
      .order('name'),
    supabase.rpc('chat_unread_counts', { p_tenant_id: tenantId }),
    supabase
      .from('chat_channel_members')
      .select('channel_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId),
  ]);

  if (canais.error !== null) return { canais: [], falhou: true, contagemFalhou: true };

  const contagemFalhou = contagens.error !== null;
  const porCanal = new Map<string, LinhaDeContagem>();
  for (const linha of (contagens.data ?? []) as LinhaDeContagem[]) {
    porCanal.set(String(linha.channel_id), linha);
  }

  const participo = new Set(
    (participacoes.data ?? []).map((linha) => String(linha.channel_id as string)),
  );

  const lista: CanalNaLista[] = (canais.data ?? []).map((linha) => {
    const contagem = porCanal.get(String(linha.id));
    return {
      id: String(linha.id),
      nome: String(linha.name),
      descricao: typeof linha.description === 'string' ? linha.description : null,
      restrito: linha.is_private === true,
      participo: participo.has(String(linha.id)),
      naoLidas: contagemFalhou ? null : comoNumero(contagem?.unread),
      mencoesNaoLidas: contagemFalhou ? null : comoNumero(contagem?.unread_mentions),
      ultimaMensagemEm: contagem?.last_message_at ?? null,
    };
  });

  /*
   * Ordem: quem tem menção não lida, depois quem tem não lida, depois pela
   * última mensagem, e só então por nome. É a ordem em que a pessoa procura —
   * "o que me chamou" vem antes de "o que é novo", que vem antes do resto.
   * Canal sem mensagem nenhuma cai no fim, pelo nome, e não some.
   */
  lista.sort((a, b) => {
    const mencao = Number((b.mencoesNaoLidas ?? 0) > 0) - Number((a.mencoesNaoLidas ?? 0) > 0);
    if (mencao !== 0) return mencao;
    const naoLida = Number((b.naoLidas ?? 0) > 0) - Number((a.naoLidas ?? 0) > 0);
    if (naoLida !== 0) return naoLida;
    const quando = (b.ultimaMensagemEm ?? '').localeCompare(a.ultimaMensagemEm ?? '');
    if (quando !== 0) return quando;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return { canais: lista, falhou: false, contagemFalhou };
});

/** O canal aberto, ou `null` quando não existe **ou** não é desta pessoa. */
export const lerCanal = cache(
  async (tenantId: string, canalId: string, userId: string): Promise<CanalAberto | null> => {
    const supabase = await supabaseServer();

    const [canal, participacao] = await Promise.all([
      supabase
        .from('chat_channels')
        .select('id, name, description, is_private, created_by')
        .eq('tenant_id', tenantId)
        .eq('id', canalId)
        .maybeSingle(),
      supabase
        .from('chat_channel_members')
        .select('last_read_at')
        .eq('tenant_id', tenantId)
        .eq('channel_id', canalId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (canal.error !== null || canal.data === null) return null;

    return {
      id: String(canal.data.id),
      nome: String(canal.data.name),
      descricao: typeof canal.data.description === 'string' ? canal.data.description : null,
      restrito: canal.data.is_private === true,
      criadoPor: typeof canal.data.created_by === 'string' ? canal.data.created_by : null,
      participo: participacao.data !== null,
      lidoAte:
        typeof participacao.data?.last_read_at === 'string' ? participacao.data.last_read_at : null,
    };
  },
);

/* ── Participantes ────────────────────────────────────────────────────── */

/**
 * Quem está no canal.
 *
 * Em canal restrito é a lista de acesso. Em canal público é a lista de quem já
 * abriu alguma vez — e a tela precisa dizer isso, senão "3 participantes" num
 * canal que a empresa inteira lê parece uma restrição que não existe.
 */
export async function lerParticipantes(
  tenantId: string,
  canalId: string,
  userId: string,
): Promise<readonly ParticipanteDoCanal[]> {
  const supabase = await supabaseServer();
  const [linhas, membros] = await Promise.all([
    supabase
      .from('chat_channel_members')
      .select('user_id, joined_at')
      .eq('tenant_id', tenantId)
      .eq('channel_id', canalId),
    tenantMembers(tenantId),
  ]);

  return (linhas.data ?? [])
    .map((linha): ParticipanteDoCanal => {
      const id = String(linha.user_id);
      return {
        userId: id,
        /*
         * Quem consta no canal e não está entre os membros ativos teve o
         * vínculo suspenso desde que entrou. Nomear o estado é melhor que
         * mostrar um uuid — e some da lista nenhum, porque ele ainda tem a
         * linha e um moderador pode querer removê-lo.
         */
        nome: nomeDe(membros, id) ?? 'Sem acesso ativo',
        entrouEm: String(linha.joined_at),
        souEu: id === userId,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ── Conversa ─────────────────────────────────────────────────────────── */

interface LinhaDeMensagem {
  id: string;
  author_id: string | null;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

/** O quanto de uma mensagem cabe numa citação antes de virar a mensagem de novo. */
const TAMANHO_DA_CITACAO = 140;

function recortar(corpo: string): string {
  /* Uma linha só: a citação mora numa faixa de uma linha, e `\n` a quebraria. */
  const numaLinha = corpo.replace(/\s+/g, ' ').trim();
  return numaLinha.length <= TAMANHO_DA_CITACAO
    ? numaLinha
    : `${numaLinha.slice(0, TAMANHO_DA_CITACAO - 1).trimEnd()}…`;
}

function comoChatMessage(linha: LinhaDeMensagem): ChatMessage {
  return {
    id: String(linha.id),
    authorId: linha.author_id === null ? null : String(linha.author_id),
    createdAt: String(linha.created_at),
    editedAt: linha.edited_at,
    deletedAt: linha.deleted_at,
    replyToId: linha.reply_to_id,
  };
}

function citar(linha: LinhaDeMensagem, membros: readonly Member[]): TrechoCitado {
  const apagada = linha.deleted_at !== null;
  return {
    id: String(linha.id),
    autorNome: nomeDe(membros, linha.author_id),
    trecho: apagada ? '' : recortar(String(linha.body)),
    apagada,
  };
}

/**
 * As últimas mensagens do canal, prontas para desenhar.
 *
 * Carrega do fim para o começo — é o que o índice
 * `chat_messages_channel_idx` serve — e devolve em ordem cronológica, porque é
 * assim que a conversa se lê. Pede uma a mais que o limite só para saber se
 * cortou: sem isso a tela não teria como dizer "mostrando as últimas 80", e
 * sumir com o começo da conversa sem avisar é mentir por omissão.
 *
 * `agora` entra por parâmetro para que "posso editar" seja decidido uma vez,
 * com o mesmo relógio para a lista inteira — e não oitenta vezes, com oitenta
 * respostas diferentes na fronteira dos quinze minutos.
 */
export async function lerConversa(
  tenantId: string,
  canal: CanalAberto,
  quem: QuemOlha,
  agora: Date,
): Promise<ConversaLida> {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, author_id, body, reply_to_id, created_at, edited_at, deleted_at')
    .eq('tenant_id', tenantId)
    .eq('channel_id', canal.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MENSAGENS_POR_PAGINA + 1);

  if (error !== null) {
    return { mensagens: [], truncada: false, falhou: true, primeiraNaoLida: null };
  }

  const recentesPrimeiro = (data ?? []) as LinhaDeMensagem[];
  const truncada = recentesPrimeiro.length > MENSAGENS_POR_PAGINA;
  const linhas = recentesPrimeiro.slice(0, MENSAGENS_POR_PAGINA).reverse();

  if (linhas.length === 0) {
    return { mensagens: [], truncada: false, falhou: false, primeiraNaoLida: null };
  }

  const ids = linhas.map((linha) => String(linha.id));
  /*
   * A anotação de tupla no retorno do `map` não é enfeite: sem ela o
   * TypeScript infere `(string | LinhaDeMensagem)[][]`, que o construtor do
   * `Map` recusa. É o mesmo tropeço em toda parte onde se monta um índice.
   */
  const carregadas = new Map<string, LinhaDeMensagem>(
    linhas.map((linha): [string, LinhaDeMensagem] => [String(linha.id), linha]),
  );

  /*
   * As mensagens citadas que não estão na janela carregada — responder a algo
   * de duas semanas atrás é normal, e a citação não pode aparecer vazia por
   * isso. Consulta só o que falta.
   */
  const citadasDeFora = [
    ...new Set(
      linhas
        .map((linha) => linha.reply_to_id)
        .filter((id): id is string => id !== null && !carregadas.has(String(id))),
    ),
  ];

  const [membros, mencoes, citadas] = await Promise.all([
    tenantMembers(tenantId),
    supabase
      .from('chat_message_mentions')
      .select('message_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', quem.userId)
      .in('message_id', ids),
    citadasDeFora.length === 0
      ? Promise.resolve({ data: [] as LinhaDeMensagem[] })
      : supabase
          .from('chat_messages')
          .select('id, author_id, body, reply_to_id, created_at, edited_at, deleted_at')
          .eq('tenant_id', tenantId)
          .in('id', citadasDeFora),
  ]);

  for (const linha of (citadas.data ?? []) as LinhaDeMensagem[]) {
    carregadas.set(String(linha.id), linha);
  }

  const mencionado = new Set(
    (mencoes.data ?? []).map((linha) => String(linha.message_id as string)),
  );

  const olhar: ChatViewer = { id: quem.userId, isModerator: quem.moderador };

  const mensagens: MensagemNaTela[] = linhas.map((linha) => {
    const base = comoChatMessage(linha);
    const citada =
      linha.reply_to_id === null ? undefined : carregadas.get(String(linha.reply_to_id));

    return {
      id: base.id,
      autorId: base.authorId,
      autorNome: nomeDe(membros, base.authorId),
      souEuQuemEscreveu: base.authorId !== null && base.authorId === quem.userId,
      corpo: String(linha.body),
      criadaEm: base.createdAt,
      editadaEm: linha.edited_at,
      apagadaEm: linha.deleted_at,
      /*
       * Citação que não veio da consulta: o alvo existe (a FK garante) mas
       * ficou fora do alcance desta leitura. Melhor a faixa dizendo que há uma
       * resposta do que fingir que a mensagem não responde nada.
       */
      respondeA:
        linha.reply_to_id === null
          ? null
          : citada !== undefined
            ? citar(citada, membros)
            : {
                id: String(linha.reply_to_id),
                autorNome: null,
                trecho: '',
                apagada: false,
              },
      mencionaVoce: mencionado.has(base.id),
      possoEditar: canEditMessage(base, olhar, agora),
      possoApagar: canDeleteMessage(base, olhar),
    };
  });

  return {
    mensagens,
    truncada,
    falhou: false,
    primeiraNaoLida: firstUnreadId(linhas.map(comoChatMessage), quem.userId, canal.lidoAte),
  };
}
