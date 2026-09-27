/**
 * As regras do chat interno, sem banco.
 *
 *   npm run test:core
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHAT_EDIT_WINDOW_MINUTES,
  CHAT_MESSAGE_MAX_LENGTH,
  canDeleteMessage,
  canEditMessage,
  checkMessageBody,
  editBlock,
  firstUnreadId,
  groupMessages,
  relativeTime,
  unreadCount,
  type ChatMessage,
  type ChatViewer,
} from './chat.ts';

const SP = 'America/Sao_Paulo';
/* 26/09/2026 12:00 em São Paulo. */
const agora = new Date('2026-09-26T15:00:00Z');

const EU = 'aaaaaaaa-0000-0000-0000-000000000001';
const COLEGA = 'bbbbbbbb-0000-0000-0000-000000000002';

const eu: ChatViewer = { id: EU, isModerator: false };
const moderador: ChatViewer = { id: COLEGA, isModerator: true };

function msg(patch: Partial<ChatMessage> & { id: string; createdAt: string }): ChatMessage {
  return { authorId: COLEGA, ...patch };
}

describe('unreadCount', () => {
  const mensagens: ChatMessage[] = [
    msg({ id: 'm1', createdAt: '2026-09-26T10:00:00Z' }),
    msg({ id: 'm2', createdAt: '2026-09-26T11:00:00Z' }),
    msg({ id: 'm3', createdAt: '2026-09-26T12:00:00Z' }),
  ];

  it('conta o que chegou depois do marcador', () => {
    assert.equal(unreadCount(mensagens, EU, '2026-09-26T11:00:00Z'), 1);
  });

  it('a mensagem do instante exato do marcador já estava na tela', () => {
    // Comparação estrita. Fosse `>=`, a última lida voltaria como não lida a
    // cada recarga, e o badge nunca zeraria.
    assert.equal(unreadCount(mensagens, EU, '2026-09-26T12:00:00Z'), 0);
  });

  it('nunca leu é tudo não lido — não é tudo lido', () => {
    assert.equal(unreadCount(mensagens, EU, null), 3);
  });

  it('ninguém tem recado de si mesmo', () => {
    const minhas = mensagens.map((m) => ({ ...m, authorId: EU }));
    assert.equal(unreadCount(minhas, EU, null), 0);
  });

  it('apagada não avisa ninguém', () => {
    const comApagada = [
      ...mensagens,
      msg({ id: 'm4', createdAt: '2026-09-26T13:00:00Z', deletedAt: '2026-09-26T13:05:00Z' }),
    ];
    assert.equal(unreadCount(comApagada, EU, '2026-09-26T12:00:00Z'), 0);
  });

  it('firstUnreadId acha a primeira, mesmo com a lista fora de ordem', () => {
    const embaralhada = [mensagens[2]!, mensagens[0]!, mensagens[1]!];
    assert.equal(firstUnreadId(embaralhada, EU, '2026-09-26T10:30:00Z'), 'm2');
    assert.equal(firstUnreadId(embaralhada, EU, '2026-09-26T12:00:00Z'), null);
  });
});

describe('groupMessages', () => {
  it('junta as seguidas do mesmo autor dentro da janela', () => {
    const grupos = groupMessages([
      msg({ id: 'a', createdAt: '2026-09-26T12:00:00Z' }),
      msg({ id: 'b', createdAt: '2026-09-26T12:00:30Z' }),
      msg({ id: 'c', createdAt: '2026-09-26T12:02:00Z' }),
    ]);
    assert.equal(grupos.length, 1);
    assert.deepEqual(
      grupos[0]!.messages.map((m) => m.id),
      ['a', 'b', 'c'],
    );
    assert.equal(grupos[0]!.startedAt, '2026-09-26T12:00:00Z');
  });

  it('autor diferente abre bloco', () => {
    const grupos = groupMessages([
      msg({ id: 'a', createdAt: '2026-09-26T12:00:00Z' }),
      msg({ id: 'b', createdAt: '2026-09-26T12:00:10Z', authorId: EU }),
    ]);
    assert.equal(grupos.length, 2);
  });

  it('pausa maior que a janela abre bloco — o horário precisa reaparecer', () => {
    const grupos = groupMessages([
      msg({ id: 'a', createdAt: '2026-09-26T12:00:00Z' }),
      msg({ id: 'b', createdAt: '2026-09-26T12:06:00Z' }),
    ]);
    assert.equal(grupos.length, 2);
  });

  it('a janela conta da mensagem anterior, não da primeira do bloco', () => {
    // Quatro minutos entre cada uma: doze do começo ao fim, e ainda é uma fala.
    const grupos = groupMessages([
      msg({ id: 'a', createdAt: '2026-09-26T12:00:00Z' }),
      msg({ id: 'b', createdAt: '2026-09-26T12:04:00Z' }),
      msg({ id: 'c', createdAt: '2026-09-26T12:08:00Z' }),
    ]);
    assert.equal(grupos.length, 1);
  });

  it('resposta abre bloco — ela carrega a própria citação', () => {
    const grupos = groupMessages([
      msg({ id: 'a', createdAt: '2026-09-26T12:00:00Z' }),
      msg({ id: 'b', createdAt: '2026-09-26T12:00:10Z', replyToId: 'a' }),
    ]);
    assert.equal(grupos.length, 2);
  });

  it('dois ex-membros não viram a mesma pessoa', () => {
    // Os dois chegam como authorId null. Juntá-los atribuiria a fala de um ao
    // outro, que é pior que mostrar dois blocos sem nome.
    const grupos = groupMessages([
      msg({ id: 'a', createdAt: '2026-09-26T12:00:00Z', authorId: null }),
      msg({ id: 'b', createdAt: '2026-09-26T12:00:10Z', authorId: null }),
    ]);
    assert.equal(grupos.length, 2);
  });

  it('lista vazia não inventa bloco', () => {
    assert.deepEqual(groupMessages([]), []);
  });
});

describe('relativeTime', () => {
  it('menos de um minuto é agora', () => {
    assert.equal(relativeTime('2026-09-26T14:59:30Z', agora, SP), 'agora');
  });

  it('relógio do cliente adiantado não vira "há -3 min"', () => {
    assert.equal(relativeTime('2026-09-26T15:03:00Z', agora, SP), 'agora');
  });

  it('dentro da hora, em minutos', () => {
    assert.equal(relativeTime('2026-09-26T14:20:00Z', agora, SP), 'há 40 min');
  });

  it('mais cedo hoje, só a hora — no fuso do tenant', () => {
    /* 09:00 em São Paulo, mesmo dia. */
    assert.equal(relativeTime('2026-09-26T12:00:00Z', agora, SP), '09:00');
  });

  it('22h de ontem em São Paulo já é hoje em UTC — e continua sendo ontem', () => {
    /* 2026-09-26T01:00Z = 25/09 às 22h em São Paulo. */
    assert.equal(relativeTime('2026-09-26T01:00:00Z', agora, SP), 'ontem 22:00');
  });

  it('dentro da semana, dia e mês; passou disso, com o ano', () => {
    assert.equal(relativeTime('2026-09-23T15:00:00Z', agora, SP), '23/09 12:00');
    assert.equal(relativeTime('2026-09-01T15:00:00Z', agora, SP), '01/09/2026');
  });
});

describe('quem edita e quem apaga', () => {
  const minha = msg({ id: 'x', createdAt: '2026-09-26T14:55:00Z', authorId: EU });

  it('o autor edita dentro da janela', () => {
    assert.equal(canEditMessage(minha, eu, agora), true);
  });

  it('passada a janela, não', () => {
    const velha = msg({ id: 'x', createdAt: '2026-09-26T14:00:00Z', authorId: EU });
    assert.equal(editBlock(velha, eu, agora), 'window-closed');
  });

  it('a janela é exatamente CHAT_EDIT_WINDOW_MINUTES', () => {
    const noLimite = new Date(agora.getTime() - CHAT_EDIT_WINDOW_MINUTES * 60_000).toISOString();
    assert.equal(editBlock(msg({ id: 'x', createdAt: noLimite, authorId: EU }), eu, agora), null);

    const umSegundoDepois = new Date(
      agora.getTime() - CHAT_EDIT_WINDOW_MINUTES * 60_000 - 1000,
    ).toISOString();
    assert.equal(
      editBlock(msg({ id: 'x', createdAt: umSegundoDepois, authorId: EU }), eu, agora),
      'window-closed',
    );
  });

  it('moderador apaga, mas não reescreve — a mensagem continua assinada', () => {
    assert.equal(canEditMessage(minha, moderador, agora), false);
    assert.equal(editBlock(minha, moderador, agora), 'not-author');
    assert.equal(canDeleteMessage(minha, moderador), true);
  });

  it('mensagem de ex-membro não é de ninguém — nem do moderador para editar', () => {
    const orfa = msg({ id: 'x', createdAt: '2026-09-26T14:55:00Z', authorId: null });
    assert.equal(editBlock(orfa, eu, agora), 'not-author');
    assert.equal(canDeleteMessage(orfa, eu), false);
    assert.equal(canDeleteMessage(orfa, moderador), true);
  });

  it('apagada não se edita nem se apaga de novo', () => {
    const apagada = msg({
      id: 'x',
      createdAt: '2026-09-26T14:55:00Z',
      authorId: EU,
      deletedAt: '2026-09-26T14:56:00Z',
    });
    assert.equal(editBlock(apagada, eu, agora), 'deleted');
    assert.equal(canDeleteMessage(apagada, eu), false);
  });

  it('apagar a própria não tem janela — arrependimento não vence em 15 minutos', () => {
    const antiga = msg({ id: 'x', createdAt: '2020-01-01T00:00:00Z', authorId: EU });
    assert.equal(canDeleteMessage(antiga, eu), true);
    assert.equal(canEditMessage(antiga, eu, agora), false);
  });

  it('colega sem moderação não apaga a minha', () => {
    assert.equal(canDeleteMessage(minha, { id: COLEGA, isModerator: false }), false);
  });
});

describe('checkMessageBody', () => {
  it('apara e devolve o que vai para o banco', () => {
    assert.deepEqual(checkMessageBody('  combinado  '), { ok: true, body: 'combinado' });
  });

  it('só espaço é mensagem vazia', () => {
    assert.deepEqual(checkMessageBody('   \n  '), { ok: false, reason: 'empty' });
  });

  it('o limite é o da constraint, e conta depois de aparar', () => {
    const noLimite = 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH);
    assert.deepEqual(checkMessageBody(` ${noLimite} `), { ok: true, body: noLimite });
    assert.deepEqual(checkMessageBody('a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1)), {
      ok: false,
      reason: 'too-long',
    });
  });
});
