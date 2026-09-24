/**
 * Testes de `accept_invite()`.
 *
 * Esta função é `SECURITY DEFINER`: ela roda com os privilégios do dono, fora
 * do RLS. Isso é necessário — quem está na tela de convite é justamente quem
 * as políticas recusam — e é a razão de ela merecer mais teste que o resto.
 * Uma `DEFINER` mal escrita é escalada de privilégio com nome amigável.
 *
 * As três famílias:
 *
 *   1. Faz o que promete — o convite legítimo vira vínculo ativo.
 *   2. **Não faz o que não promete** — e é aqui que mora o valor: aceitar
 *      convite alheio, entrar em tenant cancelado, virar membro sem convite.
 *   3. Clique repetido não é erro, e não reescreve história.
 *
 *   npm run test:db
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

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

/** Chama a função como aquele usuário, confirmando a transação. */
function aceitar(userId, tenantId) {
  return asUserCommitting(db, userId, () =>
    db.query('select * from public.accept_invite($1)', [tenantId]),
  );
}

/** O estado do vínculo, lido fora do RLS. */
async function vinculo(tenantId, userId) {
  const { rows } = await db.query(
    'select status, joined_at from public.tenant_users where tenant_id = $1 and user_id = $2',
    [tenantId, userId],
  );
  return rows[0] ?? null;
}

before(async () => {
  db = await createDatabase();

  fx.acme = await createTenant(db, { slug: 'acme-convite', name: 'Acme' });
  fx.outra = await createTenant(db, { slug: 'outra-convite', name: 'Outra' });

  fx.dono = await createUser(db, { email: 'dono@acme.convite', fullName: 'Dona' });
  await addMember(db, { tenantId: fx.acme, userId: fx.dono, roleCode: 'tenant_admin' });
});

after(async () => {
  await db?.close?.();
});

/* ── 1. O caminho legítimo ─────────────────────────────────────────────── */

describe('o convite vira vínculo', () => {
  it('quem foi convidado entra, e a data de entrada é carimbada', async () => {
    const pessoa = await createUser(db, { email: 'entra@acme.convite', fullName: 'Entra' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });

    assert.equal((await vinculo(fx.acme, pessoa)).joined_at, null, 'nasceu com data de entrada');

    const { rows } = await aceitar(pessoa, fx.acme);

    assert.equal(rows.length, 1, 'a função precisa devolver o tenant para a tela redirecionar');
    assert.equal(rows[0].slug, 'acme-convite');

    const depois = await vinculo(fx.acme, pessoa);
    assert.equal(depois.status, 'active');
    assert.notEqual(depois.joined_at, null, 'entrou sem data de entrada');
  });

  it('depois de aceitar, o RLS passa a deixar ler', async () => {
    /*
     * A prova de que a função resolveu o problema de verdade, e não só mudou
     * uma coluna: antes, `my_tenants` mostrava o convite e nenhum dado do
     * tenant era alcançável.
     */
    const pessoa = await createUser(db, { email: 'le@acme.convite', fullName: 'Lê' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });

    const antes = await asUser(db, pessoa, () => db.query('select id from public.tenants'));
    assert.equal(antes.rows.length, 0, 'convite pendente não pode enxergar o tenant');

    await aceitar(pessoa, fx.acme);

    const depois = await asUser(db, pessoa, () => db.query('select id from public.tenants'));
    assert.equal(depois.rows.length, 1, 'depois de entrar, precisa enxergar');
    assert.equal(depois.rows[0].id, fx.acme);
  });

  it('a entrada fica na auditoria', async () => {
    const pessoa = await createUser(db, { email: 'audita@acme.convite', fullName: 'Audita' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });

    await aceitar(pessoa, fx.acme);

    const { rows } = await db.query(
      `select action, resource_type, metadata from public.audit_logs
       where tenant_id = $1 and actor_user_id = $2`,
      [fx.acme, pessoa],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'core.membership.accepted');
    /*
     * `metadata` precisa ser objeto, não texto. É a armadilha do `jsonb` que
     * já custou uma noite neste projeto: sem `::text::jsonb`, o driver de
     * produção grava a string e a leitura nunca acha a chave.
     */
    assert.equal(typeof rows[0].metadata, 'object');
    assert.equal(rows[0].metadata.via, 'tela');
  });
});

/* ── 2. O que ela recusa — o motivo de existirem testes ────────────────── */

describe('o que accept_invite recusa', () => {
  it('não dá para aceitar o convite de outra pessoa', async () => {
    /*
     * O teste mais importante do arquivo. O parâmetro é o **tenant**; a
     * pessoa é sempre `auth.uid()`. Uma versão que recebesse `user_id` seria
     * uma porta para entrar na conta de qualquer um que tivesse convite
     * pendente.
     */
    const convidada = await createUser(db, { email: 'alvo@acme.convite', fullName: 'Alvo' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: convidada,
      roleCode: 'collaborator',
      status: 'invited',
    });

    const intrusa = await createUser(db, { email: 'intrusa@fora.convite', fullName: 'Intrusa' });

    await assert.rejects(aceitar(intrusa, fx.acme), /não está mais válido/);

    const alheio = await vinculo(fx.acme, convidada);
    assert.equal(alheio.status, 'invited', 'o convite da outra pessoa foi consumido');
  });

  it('quem não tem convite nenhum não vira membro', async () => {
    const estranha = await createUser(db, { email: 'estranha@fora.convite', fullName: 'Estranha' });

    await assert.rejects(aceitar(estranha, fx.acme), /não está mais válido/);

    assert.equal(await vinculo(fx.acme, estranha), null, 'a função criou vínculo do nada');
  });

  it('convite para tenant cancelado não vale', async () => {
    // Entrar num cliente cancelado é acesso a uma conta morta. E o tenant
    // pode ter sido cancelado **depois** de o convite sair.
    const morto = await createTenant(db, { slug: 'morto-convite', name: 'Morto' });
    const pessoa = await createUser(db, { email: 'tarde@morto.convite', fullName: 'Tarde' });
    await addMember(db, {
      tenantId: morto,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });
    await db.query("update public.tenants set status = 'cancelled' where id = $1", [morto]);

    await assert.rejects(aceitar(pessoa, morto), /não está mais válido/);
    assert.equal((await vinculo(morto, pessoa)).status, 'invited');
  });

  it('convite para tenant ainda em provisionamento não vale', async () => {
    // Um cliente pela metade: papéis e módulos podem não ter sido criados.
    const meio = await createTenant(db, { slug: 'meio-convite', name: 'Meio' });
    const pessoa = await createUser(db, { email: 'cedo@meio.convite', fullName: 'Cedo' });
    await addMember(db, {
      tenantId: meio,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });
    await db.query("update public.tenants set status = 'provisioning' where id = $1", [meio]);

    await assert.rejects(aceitar(pessoa, meio), /não está mais válido/);
  });

  it('vínculo suspenso não se reativa sozinho', async () => {
    // Suspender é decisão de quem administra. Se aceitar reativasse, o
    // caminho para desfazer uma suspensão seria abrir a tela de convite.
    const pessoa = await createUser(db, { email: 'suspensa@acme.convite', fullName: 'Suspensa' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'suspended',
    });

    await assert.rejects(aceitar(pessoa, fx.acme), /não está mais válido/);
    assert.equal((await vinculo(fx.acme, pessoa)).status, 'suspended');
  });

  it('aceitar num tenant não abre o outro', async () => {
    const pessoa = await createUser(db, { email: 'dois@acme.convite', fullName: 'Dois' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });

    await aceitar(pessoa, fx.acme);

    const vistos = await asUser(db, pessoa, () => db.query('select id from public.tenants'));
    assert.deepEqual(
      vistos.rows.map((l) => l.id),
      [fx.acme],
      'aceitar um convite deu acesso a outro tenant',
    );
  });

  it('sem sessão, nem chega a olhar o convite', async () => {
    await assert.rejects(
      db.query('select * from public.accept_invite($1)', [fx.acme]),
      /Entre na sua conta|permission denied/,
    );
  });
});

/* ── 3. Clique repetido ────────────────────────────────────────────────── */

describe('aceitar duas vezes', () => {
  it('o segundo clique responde igual, sem reescrever a data de entrada', async () => {
    /*
     * Duplo clique é o comportamento mais comum do mundo numa tela com um
     * botão só. Erro no segundo clique faria a pessoa achar que não entrou —
     * e reescrever `joined_at` apagaria desde quando ela é membro.
     */
    const pessoa = await createUser(db, { email: 'duas@acme.convite', fullName: 'Duas' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });

    const primeira = await aceitar(pessoa, fx.acme);
    const entrouEm = (await vinculo(fx.acme, pessoa)).joined_at;

    const segunda = await aceitar(pessoa, fx.acme);

    assert.deepEqual(segunda.rows[0], primeira.rows[0], 'a resposta mudou no segundo clique');
    assert.deepEqual(
      (await vinculo(fx.acme, pessoa)).joined_at,
      entrouEm,
      'o segundo clique reescreveu desde quando a pessoa é membro',
    );
  });

  it('e não duplica a auditoria', async () => {
    const pessoa = await createUser(db, { email: 'unica@acme.convite', fullName: 'Única' });
    await addMember(db, {
      tenantId: fx.acme,
      userId: pessoa,
      roleCode: 'collaborator',
      status: 'invited',
    });

    await aceitar(pessoa, fx.acme);
    await aceitar(pessoa, fx.acme);

    const { rows } = await db.query(
      `select count(*)::int as n from public.audit_logs
       where actor_user_id = $1 and action = 'core.membership.accepted'`,
      [pessoa],
    );
    assert.equal(rows[0].n, 1, 'o clique repetido virou dois registros de entrada');
  });
});
