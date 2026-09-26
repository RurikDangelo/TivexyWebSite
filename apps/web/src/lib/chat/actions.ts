'use server';

/**
 * As escritas do chat interno.
 *
 * Nenhuma delas faz `insert`/`update`/`delete` direto: as quatro tabelas do
 * chat têm esses privilégios **revogados** de `authenticated`, e toda escrita
 * passa por função `security definer` do banco. Não é preferência de estilo —
 * é onde as invariantes moram: o marcador de leitura que só anda para a
 * frente, o apagar que esvazia o corpo sem remover a linha, a menção que não
 * pode apontar para quem não enxerga o canal, e a auditoria na mesma
 * transação. Um `update` solto daqui não sustentaria nenhuma delas.
 *
 * A checagem de acesso da aplicação é `requireAccess('/chat')` — vínculo ativo
 * com a empresa, que é exatamente a credencial que `is_tenant_member()` exige
 * no banco. Não há permissão `chat.*` no catálogo, e isso é decisão do
 * esquema: falar com os colegas é do vínculo; moderar é `core.users.write`, e
 * quem confere isso é `chat_is_moderator()`, não esta camada.
 *
 * ## Isto é chat interno
 *
 * Nada aqui envia mensagem para fora da empresa. WhatsApp com cliente depende
 * de conta Meta, número aprovado e credencial: `BLOCKED — EXTERNAL`.
 */

import { CHAT_MESSAGE_MAX_LENGTH, checkMessageBody } from '@tivexy/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAccess } from '../auth/require.ts';
import { campo, idOpcional, isUuid, opcional } from '../ids.ts';
import { supabaseServer } from '../supabase/server.ts';
import { mensagemDeErroDoChat } from './errors.ts';
import {
  ACAO_INICIAL,
  type AcaoDoChat,
  CANAL_INICIAL,
  type CanalFormState,
  MENSAGEM_INICIAL,
  type MensagemFormState,
} from './state.ts';

const ROTA = '/chat';

const SEM_EMPRESA = 'Escolha uma empresa para conversar com a equipe dela.';

/**
 * Revalida a rota inteira, e não só a página do canal.
 *
 * O `'layout'` é o que importa: a barra lateral com as não lidas por canal é
 * desenhada em toda tela do chat, e marcar uma conversa como lida tem de
 * apagar o contador dela na lista ao lado. Sem isto, o número some só quando a
 * pessoa navega para outro lugar e volta — e o contador passa a mentir.
 */
function revalidar(): void {
  revalidatePath(ROTA, 'layout');
}

/* ── Canais ───────────────────────────────────────────────────────────── */

/**
 * Cria o canal e devolve o id dele.
 *
 * `chat_create_channel` já põe o criador em `chat_channel_members` na mesma
 * transação — em canal restrito é isso que lhe dá acesso ao que acabou de
 * criar.
 *
 * Quem navega é o cliente, não um `redirect()` daqui: ver o comentário de
 * `CanalFormState.criado`.
 */
export async function criarCanal(
  anterior: CanalFormState,
  form: FormData,
): Promise<CanalFormState> {
  const falha = { ...CANAL_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: SEM_EMPRESA };

  const nome = campo(form, 'nome');
  if (nome === '') return { ...falha, erro: 'O canal precisa de um nome.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('chat_create_channel', {
    p_tenant_id: choice.tenant.id,
    p_name: nome,
    p_description: opcional(form, 'descricao'),
    p_is_private: campo(form, 'restrito') === 'sim',
  });

  if (error !== null) return { ...falha, erro: mensagemDeErroDoChat(error) };

  const criado = typeof data === 'string' ? data : null;
  revalidar();
  return {
    erro: null,
    ok: `Canal “${nome}” criado.`,
    rodada: anterior.rodada + 1,
    criado,
  };
}

/** Renomeia e descreve. O modo (restrito ou público) não se troca — ver o esquema. */
export async function editarCanal(
  anterior: CanalFormState,
  form: FormData,
): Promise<CanalFormState> {
  const falha = { ...CANAL_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: SEM_EMPRESA };

  const canalId = campo(form, 'canal');
  if (!isUuid(canalId)) return { ...falha, erro: 'Não encontrei este canal.' };

  const nome = campo(form, 'nome');
  if (nome === '') return { ...falha, erro: 'O canal precisa de um nome.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('chat_update_channel', {
    p_channel_id: canalId,
    p_name: nome,
    p_description: opcional(form, 'descricao'),
  });

  if (error !== null) return { ...falha, erro: mensagemDeErroDoChat(error) };

  revalidar();
  return { erro: null, ok: 'Canal atualizado.', rodada: anterior.rodada + 1, criado: null };
}

/* ── Participação ─────────────────────────────────────────────────────── */

async function mudarParticipacao(
  form: FormData,
  funcao: 'chat_add_member' | 'chat_remove_member',
  ok: string,
): Promise<AcaoDoChat> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved' || viewer.userId === null) {
    return { ...ACAO_INICIAL, erro: SEM_EMPRESA };
  }

  const canalId = campo(form, 'canal');
  if (!isUuid(canalId)) return { ...ACAO_INICIAL, erro: 'Não encontrei este canal.' };

  /* Sem `pessoa` no formulário, a ação é sobre quem está pedindo — entrar e sair. */
  const pessoa = idOpcional(form, 'pessoa') ?? viewer.userId;

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc(funcao, {
    p_channel_id: canalId,
    p_user_id: pessoa,
  });

  if (error !== null) return { ...ACAO_INICIAL, erro: mensagemDeErroDoChat(error) };

  revalidar();
  return { erro: null, ok };
}

/** Entrar no canal: em restrito não passa (o banco recusa quem não o enxerga). */
export async function entrarNoCanal(_anterior: AcaoDoChat, form: FormData): Promise<AcaoDoChat> {
  return mudarParticipacao(form, 'chat_add_member', 'Você entrou no canal.');
}

/**
 * Sair do canal.
 *
 * Em canal restrito o banco recusa a saída do último participante: o canal
 * ficaria invisível para a empresa inteira, sem volta. A mensagem dele chega
 * inteira à tela — ver `mensagemDeErroDoChat`.
 *
 * Quem sai de um canal restrito perde o acesso ao histórico, então a tela pede
 * confirmação antes (`AlertDialog`), e não aqui.
 */
export async function sairDoCanal(_anterior: AcaoDoChat, form: FormData): Promise<AcaoDoChat> {
  const resultado = await mudarParticipacao(form, 'chat_remove_member', 'Você saiu do canal.');
  /*
   * Saiu de canal restrito: ele deixou de existir para esta pessoa, e ficar na
   * página dele mostraria "não encontrei" no lugar da conversa. Voltar para a
   * lista é o único destino honesto.
   */
  if (resultado.erro === null && campo(form, 'restrito') === 'sim') redirect(ROTA);
  return resultado;
}

/** Põe alguém no canal. Em restrito isso concede acesso, e o banco audita. */
export async function adicionarParticipante(
  _anterior: AcaoDoChat,
  form: FormData,
): Promise<AcaoDoChat> {
  if (idOpcional(form, 'pessoa') === null) {
    return { ...ACAO_INICIAL, erro: 'Escolha quem entra no canal.' };
  }
  return mudarParticipacao(form, 'chat_add_member', 'Pessoa adicionada ao canal.');
}

/** Tira alguém do canal. Só quem modera (`core.users.write`) — o banco confere. */
export async function removerParticipante(
  _anterior: AcaoDoChat,
  form: FormData,
): Promise<AcaoDoChat> {
  if (idOpcional(form, 'pessoa') === null) {
    return { ...ACAO_INICIAL, erro: 'Escolha quem sai do canal.' };
  }
  return mudarParticipacao(form, 'chat_remove_member', 'Pessoa removida do canal.');
}

/* ── Marcador de leitura ──────────────────────────────────────────────── */

/**
 * "Eu vi até aqui" — o que alimenta o contador de não lidas.
 *
 * Recebe o id direto, e não `FormData`: quem chama é um efeito no cliente
 * quando a conversa aparece na tela, não um botão. É a única ação do módulo
 * que a pessoa não pede explicitamente, e por isso é também a única que falha
 * em silêncio: um erro aqui não tem o que dizer a ninguém — o pior efeito é o
 * canal continuar marcado como não lido, que é o estado anterior.
 *
 * O instante fica a cargo do banco (`p_at` omitido → `now()`). Mandar o
 * relógio do navegador seria deixar a contagem de não lidas depender de uma
 * máquina que pode estar adiantada — o banco corta o futuro com `least()`,
 * mas nem assim vale confiar.
 */
export async function marcarCanalComoLido(canalId: string): Promise<void> {
  if (!isUuid(canalId)) return;
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('chat_mark_read', { p_channel_id: canalId });
  if (error !== null) return;

  revalidar();
}

/* ── Mensagens ────────────────────────────────────────────────────────── */

/** As menções marcadas pelo formulário, já sem repetição e sem lixo. */
function mencoesPedidas(form: FormData): string[] {
  return [
    ...new Set(
      form
        .getAll('mencao')
        .filter((valor): valor is string => typeof valor === 'string')
        .filter(isUuid),
    ),
  ];
}

/**
 * Publica a mensagem.
 *
 * `checkMessageBody` é a mesma regra das constraints
 * `chat_messages_body_not_blank` e `chat_messages_body_size` — conferir antes
 * não é segurança (o banco recusaria), é a diferença entre um erro que explica
 * o limite e um `22001` cru.
 */
export async function enviarMensagem(
  anterior: MensagemFormState,
  form: FormData,
): Promise<MensagemFormState> {
  const falha = { ...MENSAGEM_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: SEM_EMPRESA };

  const canalId = campo(form, 'canal');
  if (!isUuid(canalId)) return { ...falha, erro: 'Não encontrei este canal.' };

  const conferido = checkMessageBody(form.get('corpo') === null ? '' : String(form.get('corpo')));
  if (!conferido.ok) {
    return {
      ...falha,
      erro:
        conferido.reason === 'empty'
          ? 'Escreva alguma coisa antes de enviar.'
          : `A mensagem passou de ${CHAT_MESSAGE_MAX_LENGTH.toLocaleString('pt-BR')} caracteres. Quebre em duas.`,
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('chat_post_message', {
    p_channel_id: canalId,
    p_body: conferido.body,
    p_reply_to_id: idOpcional(form, 'responde_a'),
    p_mentions: mencoesPedidas(form),
  });

  if (error !== null) return { ...falha, erro: mensagemDeErroDoChat(error) };

  revalidar();
  return { erro: null, ok: null, rodada: anterior.rodada + 1 };
}

/**
 * Corrige a própria mensagem, dentro da janela de 15 minutos.
 *
 * A janela é do banco (`chat_edit_window()`) e do Core
 * (`CHAT_EDIT_WINDOW_MINUTES`), que um teste compara. A tela esconde o botão
 * quando ela passou, mas a checagem de verdade é a do banco: entre abrir o
 * menu e clicar em salvar cabem os quinze minutos, e a recusa tem de chegar
 * escrita — não como um salvamento que não salvou.
 */
export async function editarMensagem(
  anterior: MensagemFormState,
  form: FormData,
): Promise<MensagemFormState> {
  const falha = { ...MENSAGEM_INICIAL, rodada: anterior.rodada };
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...falha, erro: SEM_EMPRESA };

  const mensagemId = campo(form, 'mensagem');
  if (!isUuid(mensagemId)) return { ...falha, erro: 'Não encontrei esta mensagem.' };

  const conferido = checkMessageBody(form.get('corpo') === null ? '' : String(form.get('corpo')));
  if (!conferido.ok) {
    return {
      ...falha,
      erro:
        conferido.reason === 'empty'
          ? 'Mensagem vazia não salva. Para tirá-la da conversa, apague-a.'
          : `A mensagem passou de ${CHAT_MESSAGE_MAX_LENGTH.toLocaleString('pt-BR')} caracteres.`,
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('chat_edit_message', {
    p_message_id: mensagemId,
    p_body: conferido.body,
  });

  if (error !== null) return { ...falha, erro: mensagemDeErroDoChat(error) };

  revalidar();
  return { erro: null, ok: 'Mensagem editada.', rodada: anterior.rodada + 1 };
}

/**
 * Apaga a mensagem — que no banco é marcar, não remover.
 *
 * A linha fica, o corpo é esvaziado, e a conversa mostra "mensagem apagada" no
 * lugar dela. Sumir com a linha levaria junto as respostas que apontam para
 * ela, ou deixaria um buraco no meio de um encadeamento: quem lesse a resposta
 * depois não saberia a que ela responde.
 */
export async function apagarMensagem(_anterior: AcaoDoChat, form: FormData): Promise<AcaoDoChat> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...ACAO_INICIAL, erro: SEM_EMPRESA };

  const mensagemId = campo(form, 'mensagem');
  if (!isUuid(mensagemId)) return { ...ACAO_INICIAL, erro: 'Não encontrei esta mensagem.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('chat_delete_message', { p_message_id: mensagemId });

  if (error !== null) return { ...ACAO_INICIAL, erro: mensagemDeErroDoChat(error) };

  revalidar();
  return { erro: null, ok: 'Mensagem apagada.' };
}
