/**
 * O chat interno, contra um Postgres de verdade.
 *
 * O que este arquivo tenta quebrar, nesta ordem de importância:
 *
 *   1. o isolamento entre empresas — canal e mensagem de uma não alcançam a
 *      outra, nem por RLS nem por chave estrangeira;
 *   2. o canal restrito — quem não participa não sabe nem que ele existe;
 *   3. a escrita fora das funções — as tabelas não têm privilégio para isso;
 *   4. apagar de verdade — a linha fica, o corpo não;
 *   5. o marcador de leitura — só anda para a frente, nunca para o futuro.
 *
 * E compara a regra do banco com a do `@tivexy/core`, nos pontos em que as
 * duas existem: janela de edição e contagem de não lidas. Duas implementações
 * da mesma regra só valem com um teste que as obrigue a concordar.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { CHAT_EDIT_WINDOW_MINUTES, unreadCount } from '../../packages/core/src/chat.ts';
import {
  addMember,
  asUser,
  asUserCommitting,
  createDatabase,
  createTenant,
  createUser,
} from './harness.mjs';

let db;
const fx = {};

/** Chama uma função do chat como alguém, confirmando a transação. */
async function comoUsuario(userId, sql, params = []) {
  return asUserCommitting(db, userId, async () => {
    const { rows } = await db.query(sql, params);
    return rows[0];
  });
}

before(async () => {
  db = await createDatabase();

  fx.tenant = await createTenant(db, { slug: 'chat-aurora', name: 'Aurora' });
  fx.outro = await createTenant(db, { slug: 'chat-base', name: 'Base' });

  fx.admin = await createUser(db, { email: 'admin@chat.aurora', fullName: 'Admin' });
  fx.colab = await createUser(db, { email: 'colab@chat.aurora', fullName: 'Colaborador' });
  fx.forasteiro = await createUser(db, { email: 'de-fora@chat.aurora', fullName: 'De fora' });
  fx.adminOutro = await createUser(db, { email: 'admin@chat.base', fullName: 'Admin Base' });

  /* tenant_admin tem core.users.write: é moderador. collaborator não tem. */
  await addMember(db, { tenantId: fx.tenant, userId: fx.admin, roleCode: 'tenant_admin' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.colab, roleCode: 'collaborator' });
  await addMember(db, { tenantId: fx.tenant, userId: fx.forasteiro, roleCode: 'collaborator' });
  await addMember(db, { tenantId: fx.outro, userId: fx.adminOutro, roleCode: 'tenant_admin' });

  /* Canal público da empresa, criado pelo administrador. */
  fx.geral = (
    await comoUsuario(
      fx.admin,
      `select public.chat_create_channel($1, 'Geral', 'Todo mundo') as id`,
      [fx.tenant],
    )
  ).id;

  /* Canal restrito: só o admin, até alguém ser adicionado. */
  fx.diretoria = (
    await comoUsuario(
      fx.admin,
      `select public.chat_create_channel($1, 'Diretoria', null, true) as id`,
      [fx.tenant],
    )
  ).id;

  /* Um canal na outra empresa, para o teste de isolamento ter o que não ver. */
  fx.canalOutro = (
    await comoUsuario(fx.adminOutro, `select public.chat_create_channel($1, 'Geral') as id`, [
      fx.outro,
    ])
  ).id;
});

describe('uma empresa não alcança o chat da outra', () => {
  it('não enxerga o canal', async () => {
    const vistos = await asUser(db, fx.adminOutro, async () => {
      const { rows } = await db.query('select id from public.chat_channels');
      return rows.map((r) => r.id);
    });
    assert.ok(vistos.includes(fx.canalOutro), 'deveria enxergar o próprio');
    assert.ok(!vistos.includes(fx.geral), 'não pode enxergar o da Aurora');
  });

  it('não enxerga a mensagem', async () => {
    await comoUsuario(fx.admin, `select public.chat_post_message($1, 'segredo de outra empresa')`, [
      fx.geral,
    ]);

    const corpos = await asUser(db, fx.adminOutro, async () => {
      const { rows } = await db.query('select body from public.chat_messages');
      return rows.map((r) => r.body);
    });
    assert.ok(!corpos.includes('segredo de outra empresa'));
  });

  it('não escreve no canal da outra, nem com a função', async () => {
    await assert.rejects(
      () => comoUsuario(fx.adminOutro, `select public.chat_post_message($1, 'invadi')`, [fx.geral]),
      /canal não encontrado/,
    );
  });

  it('mensagem com canal de outra empresa é impossível de escrever, mesmo sem RLS', async () => {
    /*
     * Sem RLS e com privilégio total — como o backend roda quando usa
     * service_role. Aqui não há política para salvar: quem recusa é a chave
     * composta.
     */
    await assert.rejects(
      () =>
        db.query(
          `insert into public.chat_messages (tenant_id, channel_id, author_id, body)
           values ($1, $2, $3, 'cruzado')`,
          [fx.outro, fx.geral, fx.adminOutro],
        ),
      /chat_messages_channel_do_tenant|violates foreign key/i,
    );
  });

  it('participação com pessoa de outra empresa também', async () => {
    await assert.rejects(
      () =>
        db.query(
          `insert into public.chat_channel_members (tenant_id, channel_id, user_id)
           values ($1, $2, $3)`,
          [fx.tenant, fx.geral, fx.adminOutro],
        ),
      /chat_channel_members_user_do_tenant|violates foreign key/i,
    );
  });
});

describe('canal restrito', () => {
  it('quem não participa não sabe que ele existe', async () => {
    const vistos = await asUser(db, fx.colab, async () => {
      const { rows } = await db.query('select id from public.chat_channels');
      return rows.map((r) => r.id);
    });
    assert.ok(vistos.includes(fx.geral));
    assert.ok(!vistos.includes(fx.diretoria));
  });

  it('e a recusa não confirma a existência — fala em "não encontrado"', async () => {
    await assert.rejects(
      () => comoUsuario(fx.colab, `select public.chat_post_message($1, 'oi')`, [fx.diretoria]),
      /canal não encontrado/,
    );
  });

  it('quem já participa adiciona alguém, e o acesso vem junto', async () => {
    await comoUsuario(fx.admin, `select public.chat_add_member($1, $2)`, [fx.diretoria, fx.colab]);

    const vistos = await asUser(db, fx.colab, async () => {
      const { rows } = await db.query('select id from public.chat_channels where id = $1', [
        fx.diretoria,
      ]);
      return rows.length;
    });
    assert.equal(vistos, 1);
  });

  it('adicionar em canal restrito vira auditoria', async () => {
    const { rows } = await db.query(
      `select actor_user_id, metadata from public.audit_logs
       where action = 'chat.member_added' and resource_id = $1`,
      [fx.diretoria],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_user_id, fx.admin);
    assert.equal(rows[0].metadata.usuario, fx.colab);
  });

  it('não dá para mencionar quem não participa do canal restrito', async () => {
    await assert.rejects(
      () =>
        comoUsuario(
          fx.admin,
          `select public.chat_post_message($1, 'olha isso', null, array[$2::uuid])`,
          [fx.diretoria, fx.forasteiro],
        ),
      /não participa deste canal restrito/,
    );
  });

  it('o último participante não sai — o canal ficaria invisível e sem volta', async () => {
    await comoUsuario(fx.admin, `select public.chat_remove_member($1, $2)`, [
      fx.diretoria,
      fx.colab,
    ]);
    await assert.rejects(
      () =>
        comoUsuario(fx.admin, `select public.chat_remove_member($1, $2)`, [fx.diretoria, fx.admin]),
      /ficaria sem ninguém/,
    );
  });
});

describe('as tabelas não aceitam escrita direta', () => {
  it('nem inserir mensagem', async () => {
    await asUser(db, fx.admin, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.chat_messages (tenant_id, channel_id, author_id, body)
             values ($1, $2, $3, 'pela porta dos fundos')`,
            [fx.tenant, fx.geral, fx.admin],
          ),
        /permission denied/i,
      );
    });
  });

  it('nem editar a própria mensagem por update', async () => {
    await asUser(db, fx.admin, async () => {
      await assert.rejects(
        () => db.query(`update public.chat_messages set body = 'reescrito'`),
        /permission denied/i,
      );
    });
  });

  it('nem apagar a linha', async () => {
    await asUser(db, fx.admin, async () => {
      await assert.rejects(
        () => db.query(`delete from public.chat_messages`),
        /permission denied/i,
      );
    });
  });

  it('nem se adicionar a um canal restrito', async () => {
    await asUser(db, fx.forasteiro, async () => {
      await assert.rejects(
        () =>
          db.query(
            `insert into public.chat_channel_members (tenant_id, channel_id, user_id)
             values ($1, $2, $3)`,
            [fx.tenant, fx.diretoria, fx.forasteiro],
          ),
        /permission denied/i,
      );
    });
  });
});

describe('apagar é marcar', () => {
  let alvo;
  let resposta;

  before(async () => {
    alvo = (
      await comoUsuario(fx.colab, `select public.chat_post_message($1, 'me arrependi') as id`, [
        fx.geral,
      ])
    ).id;
    resposta = (
      await comoUsuario(fx.admin, `select public.chat_post_message($1, 'entendi', $2) as id`, [
        fx.geral,
        alvo,
      ])
    ).id;
  });

  it('a linha fica, o corpo não', async () => {
    await comoUsuario(fx.colab, `select public.chat_delete_message($1)`, [alvo]);

    const { rows } = await db.query(
      'select body, deleted_at from public.chat_messages where id = $1',
      [alvo],
    );
    assert.equal(rows.length, 1, 'a linha precisa continuar existindo');
    assert.equal(rows[0].body, '');
    assert.notEqual(rows[0].deleted_at, null);
  });

  it('e a resposta continua apontando para ela', async () => {
    const { rows } = await db.query('select reply_to_id from public.chat_messages where id = $1', [
      resposta,
    ]);
    assert.equal(rows[0].reply_to_id, alvo);
  });

  it('apagar de novo é silêncio, não erro — o pedido é o mesmo', async () => {
    await comoUsuario(fx.colab, `select public.chat_delete_message($1)`, [alvo]);
  });

  it('apagar a própria não enche a auditoria', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from public.audit_logs
       where action = 'chat.message_moderated' and resource_id = $1`,
      [alvo],
    );
    assert.equal(rows[0].n, 0);
  });

  it('moderador apaga a alheia, e isso fica registrado', async () => {
    const id = (
      await comoUsuario(
        fx.colab,
        `select public.chat_post_message($1, 'algo fora de hora') as id`,
        [fx.geral],
      )
    ).id;

    await comoUsuario(fx.admin, `select public.chat_delete_message($1)`, [id]);

    const { rows } = await db.query(
      `select actor_user_id, metadata from public.audit_logs
       where action = 'chat.message_moderated' and resource_id = $1`,
      [id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_user_id, fx.admin);
    assert.equal(rows[0].metadata.autor, fx.colab);
  });

  it('colega sem moderação não apaga a dos outros', async () => {
    const id = (
      await comoUsuario(fx.admin, `select public.chat_post_message($1, 'minha mensagem') as id`, [
        fx.geral,
      ])
    ).id;

    await assert.rejects(
      () => comoUsuario(fx.colab, `select public.chat_delete_message($1)`, [id]),
      /não pode apagar esta mensagem/,
    );
  });
});

describe('editar', () => {
  it('o autor corrige dentro da janela', async () => {
    const id = (
      await comoUsuario(fx.colab, `select public.chat_post_message($1, 'reunião as 14h') as id`, [
        fx.geral,
      ])
    ).id;

    await comoUsuario(fx.colab, `select public.chat_edit_message($1, 'reunião às 14h')`, [id]);

    const { rows } = await db.query(
      'select body, edited_at from public.chat_messages where id = $1',
      [id],
    );
    assert.equal(rows[0].body, 'reunião às 14h');
    assert.notEqual(rows[0].edited_at, null);
  });

  it('moderador não reescreve mensagem alheia — ela continua assinada', async () => {
    const id = (
      await comoUsuario(fx.colab, `select public.chat_post_message($1, 'o que eu disse') as id`, [
        fx.geral,
      ])
    ).id;

    await assert.rejects(
      () => comoUsuario(fx.admin, `select public.chat_edit_message($1, 'o que ele queria')`, [id]),
      /só quem escreveu edita/,
    );
  });

  it('passada a janela, não', async () => {
    const id = (
      await comoUsuario(fx.colab, `select public.chat_post_message($1, 'antiga') as id`, [fx.geral])
    ).id;
    /* Envelhece a mensagem por fora: sem RLS, como o backend de manutenção. */
    await db.query(
      `update public.chat_messages
       set created_at = now() - public.chat_edit_window() - interval '1 minute'
       where id = $1`,
      [id],
    );

    await assert.rejects(
      () => comoUsuario(fx.colab, `select public.chat_edit_message($1, 'tarde demais')`, [id]),
      /janela de edição/,
    );
  });

  it('a janela do banco é a mesma do @tivexy/core', async () => {
    // Duas implementações da mesma regra concordam aqui, ou a tela oferece
    // "editar" onde o banco recusa.
    const { rows } = await db.query(
      `select extract(epoch from public.chat_edit_window()) / 60 as minutos`,
    );
    assert.equal(Number(rows[0].minutos), CHAT_EDIT_WINDOW_MINUTES);
  });
});

describe('marcador de leitura e não lidas', () => {
  let canal;

  before(async () => {
    canal = (
      await comoUsuario(fx.admin, `select public.chat_create_channel($1, 'Leituras') as id`, [
        fx.tenant,
      ])
    ).id;
    await comoUsuario(fx.admin, `select public.chat_post_message($1, 'primeira')`, [canal]);
    await comoUsuario(fx.admin, `select public.chat_post_message($1, 'segunda')`, [canal]);
  });

  it('quem nunca abriu tem tudo como não lido', async () => {
    const { rows } = await asUser(db, fx.colab, () =>
      db.query('select unread from public.chat_unread_counts($1) where channel_id = $2', [
        fx.tenant,
        canal,
      ]),
    );
    assert.equal(Number(rows[0].unread), 2);
  });

  it('quem escreveu não tem recado de si mesmo', async () => {
    const { rows } = await asUser(db, fx.admin, () =>
      db.query('select unread from public.chat_unread_counts($1) where channel_id = $2', [
        fx.tenant,
        canal,
      ]),
    );
    assert.equal(Number(rows[0].unread), 0);
  });

  it('marcar leitura zera, e a mensagem seguinte volta a contar', async () => {
    await comoUsuario(fx.colab, `select public.chat_mark_read($1)`, [canal]);

    const depois = await asUser(db, fx.colab, () =>
      db.query('select unread from public.chat_unread_counts($1) where channel_id = $2', [
        fx.tenant,
        canal,
      ]),
    );
    assert.equal(Number(depois.rows[0].unread), 0);

    await comoUsuario(fx.admin, `select public.chat_post_message($1, 'terceira')`, [canal]);

    const agora = await asUser(db, fx.colab, () =>
      db.query('select unread from public.chat_unread_counts($1) where channel_id = $2', [
        fx.tenant,
        canal,
      ]),
    );
    assert.equal(Number(agora.rows[0].unread), 1);
  });

  it('o marcador não anda para trás — duas abas não se atropelam', async () => {
    const antes = await db.query(
      'select last_read_at from public.chat_channel_members where channel_id = $1 and user_id = $2',
      [canal, fx.colab],
    );

    await comoUsuario(fx.colab, `select public.chat_mark_read($1, now() - interval '1 day')`, [
      canal,
    ]);

    const depois = await db.query(
      'select last_read_at from public.chat_channel_members where channel_id = $1 and user_id = $2',
      [canal, fx.colab],
    );
    assert.deepEqual(depois.rows[0].last_read_at, antes.rows[0].last_read_at);
  });

  it('nem para o futuro — senão as não lidas sumiriam para sempre', async () => {
    await comoUsuario(fx.colab, `select public.chat_mark_read($1, now() + interval '10 years')`, [
      canal,
    ]);

    const { rows } = await db.query(
      `select last_read_at <= now() as dentro_do_tempo
       from public.chat_channel_members where channel_id = $1 and user_id = $2`,
      [canal, fx.colab],
    );
    assert.equal(rows[0].dentro_do_tempo, true);
  });

  it('a contagem do banco é a mesma do unreadCount() do Core', async () => {
    /*
     * A tela conta no cliente com as mensagens que já tem, e o badge da barra
     * lateral vem do banco. Se as duas discordarem, o badge diz 3 e a conversa
     * mostra 2 — e quem usa perde a confiança nos dois números.
     */
    await comoUsuario(fx.admin, `select public.chat_post_message($1, 'quarta')`, [canal]);
    await comoUsuario(fx.admin, `select public.chat_post_message($1, 'quinta')`, [canal]);

    const { mensagens, marcador, doBanco } = await asUser(db, fx.colab, async () => {
      const m = await db.query(
        `select id, author_id, created_at, deleted_at from public.chat_messages
         where channel_id = $1 order by created_at`,
        [canal],
      );
      const marca = await db.query(
        'select last_read_at from public.chat_channel_members where channel_id = $1 and user_id = $2',
        [canal, fx.colab],
      );
      const conta = await db.query(
        'select unread from public.chat_unread_counts($1) where channel_id = $2',
        [fx.tenant, canal],
      );
      return {
        mensagens: m.rows,
        marcador: marca.rows[0]?.last_read_at ?? null,
        doBanco: Number(conta.rows[0].unread),
      };
    });

    const doCore = unreadCount(
      mensagens.map((r) => ({
        id: r.id,
        authorId: r.author_id,
        createdAt: new Date(r.created_at).toISOString(),
        deletedAt: r.deleted_at === null ? null : new Date(r.deleted_at).toISOString(),
      })),
      fx.colab,
      marcador === null ? null : new Date(marcador).toISOString(),
    );

    assert.equal(doBanco, doCore);
    assert.ok(doBanco > 0, 'o teste não vale nada se os dois derem zero');
  });
});

describe('resposta e menção', () => {
  it('responder mensagem de outro canal é impossível de escrever', async () => {
    const noGeral = (
      await comoUsuario(fx.admin, `select public.chat_post_message($1, 'no geral') as id`, [
        fx.geral,
      ])
    ).id;
    const outroCanal = (
      await comoUsuario(fx.admin, `select public.chat_create_channel($1, 'Projetos') as id`, [
        fx.tenant,
      ])
    ).id;

    /* Pela função, com mensagem em português. */
    await assert.rejects(
      () =>
        comoUsuario(fx.admin, `select public.chat_post_message($1, 'fora de lugar', $2)`, [
          outroCanal,
          noGeral,
        ]),
      /não é deste canal/,
    );

    /* E sem RLS, direto na tabela: quem recusa é a FK de três colunas. */
    await assert.rejects(
      () =>
        db.query(
          `insert into public.chat_messages (tenant_id, channel_id, author_id, body, reply_to_id)
           values ($1, $2, $3, 'fora de lugar', $4)`,
          [fx.tenant, outroCanal, fx.admin, noGeral],
        ),
      /chat_messages_reply_do_channel|violates foreign key/i,
    );
  });

  it('menção em canal público vale para qualquer pessoa da equipe', async () => {
    const id = (
      await comoUsuario(
        fx.admin,
        `select public.chat_post_message($1, 'dá uma olhada', null, array[$2::uuid]) as id`,
        [fx.geral, fx.forasteiro],
      )
    ).id;

    const { rows } = await db.query(
      'select user_id from public.chat_message_mentions where message_id = $1',
      [id],
    );
    assert.deepEqual(
      rows.map((r) => r.user_id),
      [fx.forasteiro],
    );
  });

  it('mencionar quem não é da equipe é recusado', async () => {
    await assert.rejects(
      () =>
        comoUsuario(fx.admin, `select public.chat_post_message($1, 'oi', null, array[$2::uuid])`, [
          fx.geral,
          fx.adminOutro,
        ]),
      /não é da equipe/,
    );
  });

  it('menção não lida aparece separada na contagem', async () => {
    const { rows } = await asUser(db, fx.forasteiro, () =>
      db.query(
        'select unread, unread_mentions from public.chat_unread_counts($1) where channel_id = $2',
        [fx.tenant, fx.geral],
      ),
    );
    assert.ok(Number(rows[0].unread) >= 1);
    assert.equal(Number(rows[0].unread_mentions), 1);
  });
});

describe('cadastro do canal', () => {
  it('nome repetido é erro de digitação, não escolha', async () => {
    await assert.rejects(
      () =>
        comoUsuario(fx.admin, `select public.chat_create_channel($1, 'geral') as id`, [fx.tenant]),
      /já existe um canal com esse nome/,
    );
  });

  it('quem não é da empresa não cria canal nela', async () => {
    await assert.rejects(
      () =>
        comoUsuario(fx.adminOutro, `select public.chat_create_channel($1, 'Intruso') as id`, [
          fx.tenant,
        ]),
      /você não participa desta empresa/,
    );
  });

  it('renomear é do criador ou do moderador, e vai para a auditoria', async () => {
    const id = (
      await comoUsuario(fx.colab, `select public.chat_create_channel($1, 'Rascunho') as id`, [
        fx.tenant,
      ])
    ).id;

    await assert.rejects(
      () =>
        comoUsuario(fx.forasteiro, `select public.chat_update_channel($1, 'Sequestrado')`, [id]),
      /não pode editar este canal/,
    );

    await comoUsuario(fx.admin, `select public.chat_update_channel($1, 'Rascunhos')`, [id]);

    const { rows } = await db.query(
      `select metadata from public.audit_logs
       where action = 'chat.channel_renamed' and resource_id = $1`,
      [id],
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].metadata, { antes: 'Rascunho', depois: 'Rascunhos' });
  });
});
