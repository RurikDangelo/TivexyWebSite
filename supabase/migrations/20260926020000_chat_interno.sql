-- Tivexy — chat interno da equipe
--
-- ─────────────────────────────────────────────────────────────────────────
-- O que este arquivo NÃO é
-- ─────────────────────────────────────────────────────────────────────────
--
-- Existem dois chats possíveis no produto, e eles não têm nada em comum além
-- do nome:
--
--   (a) conversa com o CLIENTE por WhatsApp — depende de conta Meta, número
--       aprovado, template homologado e credencial. É `BLOCKED — EXTERNAL`.
--       Nada aqui atende isso, e nada aqui deve ser reaproveitado para fingir
--       que atende: não há tabela de conversa externa, nem de contato do
--       WhatsApp, nem de janela de 24h, nem de status de entrega. Ver
--       CLAUDE.md, "Tarefas internas vs externas".
--
--   (b) conversa INTERNA da equipe dentro da empresa — não depende de
--       ninguém de fora. É só isto que este arquivo constrói, e é real.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Por que não há permissão nova no catálogo
-- ─────────────────────────────────────────────────────────────────────────
--
-- Todo módulo de negócio daqui ganhou par `read`/`write` em
-- `20260919020500_core_catalog.sql`. O chat interno não ganha, e a decisão é
-- deliberada: ele não é módulo licenciado nem recurso de negócio — é a equipe
-- conversando. A credencial é o vínculo ativo com a empresa, e quem responde
-- por isso já existe: `is_tenant_member()`.
--
-- Criar `chat.messages.write` produziria a figura do colaborador que trabalha
-- na empresa e não pode falar com os colegas. Ninguém pediu essa regra, e
-- inventá-la só para seguir o formato seria pior que não segui-lo.
--
-- O que **precisa** de papel é moderar: apagar mensagem dos outros, tirar
-- gente de canal restrito, renomear canal alheio. Isso usa
-- `core.users.write` — a permissão de quem administra pessoas dentro da
-- empresa —, via `chat_is_moderator()` logo abaixo. Nenhum código novo entra
-- no catálogo, então `contracts.test.mjs` continua fechando nos dois sentidos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Chave estrangeira composta, como no CRM
-- ─────────────────────────────────────────────────────────────────────────
--
-- Cada tabela ganha `unique (tenant_id, id)` e cada referência leva o
-- `tenant_id` junto. Mensagem de uma empresa em canal de outra deixa de ser
-- defeito a testar e passa a ser impossível de escrever — ver o cabeçalho de
-- `20260920020000_crm_foundation.sql`.
--
-- Aqui há um segundo par pela mesma razão: a resposta carrega
-- `(tenant_id, channel_id, reply_to_id)`. Responder a mensagem de OUTRO canal
-- também é impossível de escrever, sem gatilho para esquecer de criar.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Escrita só por função
-- ─────────────────────────────────────────────────────────────────────────
--
-- `insert`, `update` e `delete` são revogados de `authenticated` nas quatro
-- tabelas. Sobra `select`, sob RLS. Toda escrita passa por função, porque
-- cada uma carrega invariante que uma linha solta não sustentaria:
--
--   * a menção precisa apontar para quem enxerga o canal;
--   * o marcador de leitura só anda para a frente, e nunca para o futuro;
--   * apagar é marcar e esvaziar o corpo, nunca remover a linha;
--   * moderação vai para a auditoria na mesma transação.
--
-- É também o que torna `tenant_id` imutável aqui sem chamar `lock_tenant_id()`:
-- não há privilégio de `update` em coluna nenhuma.

-- ─────────────────────────────────────────────────────────────────────────
-- Canais
-- ─────────────────────────────────────────────────────────────────────────

create table public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  description text,
  -- Restrito: só quem está em `chat_channel_members` enxerga. Público: todo
  -- membro ativo da empresa enxerga, tenha linha de participação ou não.
  --
  -- **Não se troca depois.** Virar público exporia um histórico escrito com a
  -- expectativa de não ser lido por todos; virar restrito esconderia o que a
  -- empresa inteira já leu. Quem precisa do outro modo cria outro canal — e
  -- fica evidente na tela que é outro lugar, que é a verdade.
  is_private  boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint chat_channels_name_not_blank check (btrim(name) <> ''),
  constraint chat_channels_name_size check (length(name) <= 80),
  constraint chat_channels_tenant_id_key unique (tenant_id, id),
  constraint chat_channels_creator_do_tenant
    foreign key (tenant_id, created_by) references public.tenant_users (tenant_id, user_id)
    on delete set null (created_by)
);

comment on table public.chat_channels is
  'Canal da conversa interna da equipe. Não tem relação com WhatsApp: isso é BLOCKED — EXTERNAL.';
comment on column public.chat_channels.is_private is
  'Restrito exige participação. Imutável: trocar reescreveria quem viu o quê.';
comment on column public.chat_channels.created_by is
  'Nulo quando quem criou saiu da empresa. O canal é da empresa, não da pessoa.';

-- Dois canais "Financeiro" no mesmo lugar são um erro de digitação, não uma
-- escolha. Por `lower()`: "Financeiro" e "financeiro" são o mesmo canal para
-- quem procura.
create unique index chat_channels_name_unique
  on public.chat_channels (tenant_id, lower(name));

create index chat_channels_tenant_idx on public.chat_channels (tenant_id, lower(name));

-- ─────────────────────────────────────────────────────────────────────────
-- Participação e marcador de leitura
-- ─────────────────────────────────────────────────────────────────────────
--
-- A tabela responde duas perguntas com a mesma linha, e é de propósito:
--
--   * em canal restrito, quem participa — é ela que dá o acesso;
--   * em qualquer canal, até onde a pessoa leu — é `last_read_at` que responde
--     "quantas não lidas".
--
-- Em canal público a linha é opcional: quem nunca abriu não tem linha, e
-- **ausência significa nunca lido**, não zero não lidas. Fosse o contrário, um
-- canal novo nasceria lido para quem nunca o viu.

create table public.chat_channel_members (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  channel_id   uuid not null,
  user_id      uuid not null,
  -- Instante, não id de mensagem: mensagem some quando o canal some, e o
  -- marcador continuaria apontando para o vazio. Instante compara direto com
  -- `chat_messages.created_at`, que é o que a contagem precisa.
  last_read_at timestamptz,
  joined_at    timestamptz not null default now(),

  constraint chat_channel_members_unique unique (channel_id, user_id),
  constraint chat_channel_members_tenant_id_key unique (tenant_id, id),
  constraint chat_channel_members_channel_do_tenant
    foreign key (tenant_id, channel_id) references public.chat_channels (tenant_id, id)
    on delete cascade,
  -- Sai da empresa, sai dos canais. O vínculo é a credencial.
  constraint chat_channel_members_user_do_tenant
    foreign key (tenant_id, user_id) references public.tenant_users (tenant_id, user_id)
    on delete cascade
);

comment on table public.chat_channel_members is
  'Quem participa de um canal restrito, e até onde cada pessoa leu.';
comment on column public.chat_channel_members.last_read_at is
  'Marcador de leitura. Nulo = nunca leu, e todas as mensagens contam como não lidas.';

-- "Meus canais", na barra lateral.
create index chat_channel_members_user_idx
  on public.chat_channel_members (tenant_id, user_id);
create index chat_channel_members_channel_idx
  on public.chat_channel_members (tenant_id, channel_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Mensagens
-- ─────────────────────────────────────────────────────────────────────────
--
-- Apagar é marcar, não remover. Duas razões, e a segunda é a que decide:
--
--   * conversa de equipe é registro — quem combinou o quê, quando;
--   * a linha é alvo de `reply_to_id`. Removê-la levaria junto as respostas,
--     ou deixaria a conversa com buraco no meio de um encadeamento.
--
-- O corpo, esse **é** esvaziado ao apagar. O que a linha preserva é o lugar na
-- conversa, não o texto: manter o texto numa coluna que a equipe inteira
-- consegue ler seria apagar só na tela, que é a pior das duas opções — parece
-- apagado e não está.

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  channel_id  uuid not null,
  -- Nulo quando quem escreveu saiu da empresa. A mensagem fica: ela é da
  -- conversa, e sem ela o que veio depois perde o contexto.
  author_id   uuid,
  body        text not null,
  -- Resposta rasa: aponta para uma mensagem, e não abre sub-conversa própria.
  -- Thread de verdade (canal dentro do canal) é outra coisa e não está aqui.
  reply_to_id uuid,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,

  constraint chat_messages_body_not_blank
    check (deleted_at is not null or btrim(body) <> ''),
  -- Apagada não guarda texto. É o par da regra acima: as duas juntas dizem
  -- que corpo e estado nunca discordam.
  constraint chat_messages_deleted_has_no_body
    check (deleted_at is null or body = ''),
  constraint chat_messages_body_size check (length(body) <= 4000),
  constraint chat_messages_edited_after_created
    check (edited_at is null or edited_at >= created_at),
  constraint chat_messages_no_self_reply
    check (reply_to_id is null or reply_to_id <> id),
  constraint chat_messages_tenant_id_key unique (tenant_id, id),
  -- Existe para a resposta poder levar o canal junto na referência.
  constraint chat_messages_channel_id_key unique (tenant_id, channel_id, id),
  constraint chat_messages_channel_do_tenant
    foreign key (tenant_id, channel_id) references public.chat_channels (tenant_id, id)
    on delete cascade,
  constraint chat_messages_author_do_tenant
    foreign key (tenant_id, author_id) references public.tenant_users (tenant_id, user_id)
    on delete set null (author_id),
  -- Três colunas: responder a mensagem de outro canal é impossível de
  -- escrever, e não uma regra que um gatilho precisa lembrar de conferir.
  constraint chat_messages_reply_do_channel
    foreign key (tenant_id, channel_id, reply_to_id)
      references public.chat_messages (tenant_id, channel_id, id)
    on delete cascade
);

comment on table public.chat_messages is
  'Mensagem da conversa interna. Apagar marca deleted_at e esvazia o corpo; a linha fica.';
comment on column public.chat_messages.reply_to_id is
  'Resposta rasa, sempre no mesmo canal — garantido pela FK de três colunas.';

-- O acesso que a tela faz de verdade: as mensagens de um canal, da mais nova
-- para a mais antiga, paginando por cursor `(created_at, id)`. O `id` entra no
-- índice porque duas mensagens podem nascer no mesmo microssegundo, e aí o
-- cursor por data sozinho pularia uma ou repetiria outra.
create index chat_messages_channel_idx
  on public.chat_messages (tenant_id, channel_id, created_at desc, id desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Menções
-- ─────────────────────────────────────────────────────────────────────────
--
-- Linha, e não varredura do texto atrás de "@fulano": o nome muda, o texto
-- fica, e a busca por nome erraria em todo homônimo. A linha também é o que
-- permite "tenho menção não lida" ser uma contagem barata.

create table public.chat_message_mentions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  message_id uuid not null,
  user_id    uuid not null,
  created_at timestamptz not null default now(),

  constraint chat_message_mentions_unique unique (message_id, user_id),
  constraint chat_message_mentions_tenant_id_key unique (tenant_id, id),
  constraint chat_message_mentions_message_do_tenant
    foreign key (tenant_id, message_id) references public.chat_messages (tenant_id, id)
    on delete cascade,
  constraint chat_message_mentions_user_do_tenant
    foreign key (tenant_id, user_id) references public.tenant_users (tenant_id, user_id)
    on delete cascade
);

comment on table public.chat_message_mentions is
  'Quem foi mencionado em qual mensagem. Linha, não busca por "@" no texto.';

create index chat_message_mentions_user_idx
  on public.chat_message_mentions (tenant_id, user_id, created_at desc);

-- `chat_channels` é a única com `updated_at`: é a única cujo cadastro se
-- edita. Mensagem tem `edited_at`, que diz mais (a tela mostra "editada"), e
-- participação só muda o marcador de leitura.
select public.attach_updated_at('public.chat_channels');

-- ─────────────────────────────────────────────────────────────────────────
-- Quem enxerga o quê
-- ─────────────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER e `set search_path = ''` pelas duas razões de sempre: sem
-- definer, a política de `chat_channel_members` consultaria
-- `chat_channel_members` sob RLS e entraria em recursão; sem search_path
-- vazio, quem controla a sessão aponta os nomes para tabelas próprias.

create or replace function public.chat_channel_visible(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_channels c
    where c.id = p_channel_id
      and public.is_tenant_member(c.tenant_id)
      and (
        not c.is_private
        or exists (
          select 1
          from public.chat_channel_members m
          where m.channel_id = c.id
            and m.user_id = (select auth.uid())
        )
      )
  );
$$;

comment on function public.chat_channel_visible(uuid) is
  'O canal é alcançável por quem está pedindo: membro ativo da empresa e, se restrito, participante.';

create or replace function public.chat_message_visible(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_messages m
    where m.id = p_message_id
      and public.chat_channel_visible(m.channel_id)
  );
$$;

-- Moderar não é falar. Falar é de todo mundo da empresa; apagar mensagem
-- alheia, tirar gente de canal e renomear canal dos outros é de quem já
-- administra pessoas — `core.users.write`, que o Administrador e o Gestor têm
-- e o Colaborador não.
create or replace function public.chat_is_moderator(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_super_admin() or public.has_permission(p_tenant_id, 'core.users.write');
$$;

comment on function public.chat_is_moderator(uuid) is
  'Quem modera o chat interno: quem já administra pessoas na empresa (core.users.write).';

-- A janela de edição mora aqui **e** em `@tivexy/core`
-- (`CHAT_EDIT_WINDOW_MINUTES`). Duplicação é dívida; `chat.test.mjs` compara
-- as duas e falha se divergirem — tela que oferece "editar" onde o banco
-- recusa é pior que não oferecer.
create or replace function public.chat_edit_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '15 minutes' $$;

comment on function public.chat_edit_window() is
  'Por quanto tempo o autor edita a própria mensagem. Espelha CHAT_EDIT_WINDOW_MINUTES no Core.';

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
--
-- Só `select`: a escrita não tem privilégio, então não tem política. Super
-- Admin aparece como no resto da plataforma — e é uma escolha com custo, que
-- fica registrada aqui: a equipe Tivexy alcança a conversa interna do cliente.
-- Restringir isso é decisão de produto e vai para `docs/16-DECISIONS/`, não
-- uma divergência silenciosa nesta linha.

alter table public.chat_channels         enable row level security;
alter table public.chat_channel_members  enable row level security;
alter table public.chat_messages         enable row level security;
alter table public.chat_message_mentions enable row level security;

create policy chat_channels_read on public.chat_channels
  for select to authenticated
  using (public.is_super_admin() or public.chat_channel_visible(id));

create policy chat_channel_members_read on public.chat_channel_members
  for select to authenticated
  using (public.is_super_admin() or public.chat_channel_visible(channel_id));

create policy chat_messages_read on public.chat_messages
  for select to authenticated
  using (public.is_super_admin() or public.chat_channel_visible(channel_id));

create policy chat_message_mentions_read on public.chat_message_mentions
  for select to authenticated
  using (public.is_super_admin() or public.chat_message_visible(message_id));

revoke insert, update, delete on public.chat_channels         from anon, authenticated;
revoke insert, update, delete on public.chat_channel_members  from anon, authenticated;
revoke insert, update, delete on public.chat_messages         from anon, authenticated;
revoke insert, update, delete on public.chat_message_mentions from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Criar e editar canal
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.chat_create_channel(
  p_tenant_id   uuid,
  p_name        text,
  p_description text default null,
  p_is_private  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := btrim(coalesce(p_name, ''));
  v_ator uuid := (select auth.uid());
  v_id   uuid;
begin
  -- Super Admin não passa aqui, e está certo: ele não é membro de empresa
  -- nenhuma, e canal criado por quem não participa nasce órfão.
  if not public.is_tenant_member(p_tenant_id) then
    raise exception using errcode = '42501', message = 'você não participa desta empresa';
  end if;

  if v_nome = '' then
    raise exception using errcode = '23514', message = 'o canal precisa de um nome';
  end if;

  begin
    insert into public.chat_channels (tenant_id, name, description, is_private, created_by)
    values (
      p_tenant_id,
      v_nome,
      nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(p_is_private, false),
      v_ator
    )
    returning id into v_id;
  exception when unique_violation then
    -- O índice único fala em nome de coluna; a tela precisa de português.
    raise exception using errcode = '23505', message = 'já existe um canal com esse nome';
  end;

  -- Quem cria participa. Em canal restrito é isto que lhe dá o acesso —
  -- criar um canal onde nem o autor entra seria criar um canal morto.
  insert into public.chat_channel_members (tenant_id, channel_id, user_id, last_read_at)
  values (p_tenant_id, v_id, v_ator, now());

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, v_ator, 'chat.channel_created', 'chat_channel', v_id::text,
    jsonb_build_object('nome', v_nome, 'restrito', coalesce(p_is_private, false))
  );

  return v_id;
end;
$$;

comment on function public.chat_create_channel(uuid, text, text, boolean) is
  'Cria o canal e põe quem criou dentro, numa transação. Auditado: canal é estrutura da empresa.';

revoke execute on function public.chat_create_channel(uuid, text, text, boolean) from public, anon;
grant execute on function public.chat_create_channel(uuid, text, text, boolean) to authenticated;

-- `is_private` não entra: ver o comentário da coluna.
create or replace function public.chat_update_channel(
  p_channel_id  uuid,
  p_name        text,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid;
  v_criador uuid;
  v_antes   text;
  v_nome    text := btrim(coalesce(p_name, ''));
  v_ator    uuid := (select auth.uid());
begin
  select c.tenant_id, c.created_by, c.name
  into v_tenant, v_criador, v_antes
  from public.chat_channels c
  where c.id = p_channel_id
  for update;

  -- Canal que a pessoa não enxerga responde como canal que não existe: dizer
  -- "sem permissão" confirmaria a existência de um canal restrito.
  if v_tenant is null or not public.chat_channel_visible(p_channel_id) then
    raise exception using errcode = 'no_data_found', message = 'canal não encontrado';
  end if;

  if v_criador is distinct from v_ator and not public.chat_is_moderator(v_tenant) then
    raise exception using errcode = '42501', message = 'você não pode editar este canal';
  end if;

  if v_nome = '' then
    raise exception using errcode = '23514', message = 'o canal precisa de um nome';
  end if;

  begin
    update public.chat_channels
    set name = v_nome,
        description = nullif(btrim(coalesce(p_description, '')), '')
    where id = p_channel_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'já existe um canal com esse nome';
  end;

  if v_antes is distinct from v_nome then
    insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    values (
      v_tenant, v_ator, 'chat.channel_renamed', 'chat_channel', p_channel_id::text,
      jsonb_build_object('antes', v_antes, 'depois', v_nome)
    );
  end if;
end;
$$;

comment on function public.chat_update_channel(uuid, text, text) is
  'Renomeia e descreve o canal. Criador ou moderador. Renomear vai para a auditoria.';

revoke execute on function public.chat_update_channel(uuid, text, text) from public, anon;
grant execute on function public.chat_update_channel(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Participação
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.chat_add_member(p_channel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_ator   uuid := (select auth.uid());
begin
  select c.tenant_id into v_tenant
  from public.chat_channels c
  where c.id = p_channel_id;

  -- Quem não enxerga o canal restrito não se adiciona a ele: sem esta linha,
  -- a função seria a porta que o RLS fecha.
  if v_tenant is null or not public.chat_channel_visible(p_channel_id) then
    raise exception using errcode = 'no_data_found', message = 'canal não encontrado';
  end if;

  -- Convite pendente não é acesso a dado — a mesma regra de
  -- `user_tenant_ids()`. A FK confere o vínculo; o status, não.
  if not exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = v_tenant and tu.user_id = p_user_id and tu.status = 'active'
  ) then
    raise exception using errcode = '23503', message = 'essa pessoa não é da equipe';
  end if;

  insert into public.chat_channel_members (tenant_id, channel_id, user_id)
  values (v_tenant, p_channel_id, p_user_id)
  on conflict (channel_id, user_id) do nothing;

  -- Em canal público a linha é só marcador de leitura, e não concede nada.
  -- Em canal restrito, conceder acesso é ação administrativa e fica gravada.
  if exists (select 1 from public.chat_channels c where c.id = p_channel_id and c.is_private) then
    insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    values (
      v_tenant, v_ator, 'chat.member_added', 'chat_channel', p_channel_id::text,
      jsonb_build_object('usuario', p_user_id)
    );
  end if;
end;
$$;

comment on function public.chat_add_member(uuid, uuid) is
  'Põe alguém no canal. Em canal restrito isso concede acesso, e vai para a auditoria.';

revoke execute on function public.chat_add_member(uuid, uuid) from public, anon;
grant execute on function public.chat_add_member(uuid, uuid) to authenticated;

create or replace function public.chat_remove_member(p_channel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_restrito boolean;
  v_ator     uuid := (select auth.uid());
  v_restam   integer;
begin
  select c.tenant_id, c.is_private into v_tenant, v_restrito
  from public.chat_channels c
  where c.id = p_channel_id;

  if v_tenant is null or not public.chat_channel_visible(p_channel_id) then
    raise exception using errcode = 'no_data_found', message = 'canal não encontrado';
  end if;

  -- Sair é de quem sai. Tirar os outros é de quem modera.
  if p_user_id is distinct from v_ator and not public.chat_is_moderator(v_tenant) then
    raise exception using errcode = '42501', message = 'você não pode remover esta pessoa do canal';
  end if;

  -- Canal restrito sem ninguém dentro fica invisível para a empresa inteira,
  -- e não há como voltar: quem poderia readicionar alguém precisaria enxergar
  -- o canal, e ninguém mais enxerga. Recusar é a saída; o histórico continua
  -- alcançável para quem ficou.
  if v_restrito then
    select count(*) into v_restam
    from public.chat_channel_members m
    where m.channel_id = p_channel_id and m.user_id <> p_user_id;

    if v_restam = 0 then
      raise exception using
        errcode = '23514',
        message = 'o canal restrito ficaria sem ninguém — e sem volta';
    end if;
  end if;

  delete from public.chat_channel_members
  where channel_id = p_channel_id and user_id = p_user_id;

  if v_restrito then
    insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    values (
      v_tenant, v_ator, 'chat.member_removed', 'chat_channel', p_channel_id::text,
      jsonb_build_object('usuario', p_user_id)
    );
  end if;
end;
$$;

comment on function public.chat_remove_member(uuid, uuid) is
  'Tira alguém do canal. O próprio, ou um moderador. Nunca o último de um canal restrito.';

revoke execute on function public.chat_remove_member(uuid, uuid) from public, anon;
grant execute on function public.chat_remove_member(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Marcador de leitura
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.chat_mark_read(
  p_channel_id uuid,
  p_at         timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  -- Nunca no futuro. Um cliente com relógio adiantado — ou mal-intencionado —
  -- zeraria as não lidas para sempre, e nenhuma mensagem nova voltaria a
  -- contar.
  v_quando timestamptz := least(coalesce(p_at, now()), now());
begin
  select c.tenant_id into v_tenant
  from public.chat_channels c
  where c.id = p_channel_id;

  if v_tenant is null or not public.chat_channel_visible(p_channel_id) then
    raise exception using errcode = 'no_data_found', message = 'canal não encontrado';
  end if;

  -- `greatest` no lugar de um `select ... for update`: duas abas da mesma
  -- pessoa marcando leitura ao mesmo tempo é a corrida real aqui, e o
  -- marcador só pode andar para a frente. Uma instrução só resolve, sem
  -- bloqueio e sem ordem de chegada importar.
  insert into public.chat_channel_members (tenant_id, channel_id, user_id, last_read_at)
  values (v_tenant, p_channel_id, (select auth.uid()), v_quando)
  on conflict (channel_id, user_id) do update
    set last_read_at = greatest(
      public.chat_channel_members.last_read_at,
      excluded.last_read_at
    );
end;
$$;

comment on function public.chat_mark_read(uuid, timestamptz) is
  'Anda o marcador de leitura. Monotônico e nunca no futuro — senão as não lidas somem para sempre.';

revoke execute on function public.chat_mark_read(uuid, timestamptz) from public, anon;
grant execute on function public.chat_mark_read(uuid, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Escrever, editar e apagar
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.chat_post_message(
  p_channel_id  uuid,
  p_body        text,
  p_reply_to_id uuid default null,
  p_mentions    uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_restrito boolean;
  v_corpo    text := btrim(coalesce(p_body, ''));
  v_ator     uuid := (select auth.uid());
  v_id       uuid;
  v_alvo     uuid;
begin
  select c.tenant_id, c.is_private into v_tenant, v_restrito
  from public.chat_channels c
  where c.id = p_channel_id;

  if v_tenant is null or not public.chat_channel_visible(p_channel_id) then
    raise exception using errcode = 'no_data_found', message = 'canal não encontrado';
  end if;

  if v_corpo = '' then
    raise exception using errcode = '23514', message = 'a mensagem está vazia';
  end if;

  if length(v_corpo) > 4000 then
    raise exception using errcode = '22001', message = 'a mensagem é longa demais';
  end if;

  -- A FK de três colunas já recusa resposta de outro canal. Isto existe para
  -- a mensagem que chega na tela: erro de chave estrangeira não se mostra
  -- para ninguém.
  if p_reply_to_id is not null and not exists (
    select 1 from public.chat_messages m
    where m.id = p_reply_to_id and m.channel_id = p_channel_id
  ) then
    raise exception using errcode = '23503', message = 'a mensagem respondida não é deste canal';
  end if;

  insert into public.chat_messages (tenant_id, channel_id, author_id, body, reply_to_id)
  values (v_tenant, p_channel_id, v_ator, v_corpo, p_reply_to_id)
  returning id into v_id;

  foreach v_alvo in array coalesce(p_mentions, '{}'::uuid[]) loop
    if not exists (
      select 1 from public.tenant_users tu
      where tu.tenant_id = v_tenant and tu.user_id = v_alvo and tu.status = 'active'
    ) then
      raise exception using errcode = '23503', message = 'não dá para mencionar quem não é da equipe';
    end if;

    -- Mencionar alguém em canal restrito de que ele não participa seria
    -- avisá-lo sobre um texto que ele não pode abrir. O aviso viraria um
    -- vazamento pela metade: a pessoa sabe que falaram dela e não sabe o quê.
    if v_restrito and not exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = p_channel_id and m.user_id = v_alvo
    ) then
      raise exception using
        errcode = '42501',
        message = 'essa pessoa não participa deste canal restrito';
    end if;

    insert into public.chat_message_mentions (tenant_id, message_id, user_id)
    values (v_tenant, v_id, v_alvo)
    on conflict (message_id, user_id) do nothing;
  end loop;

  -- Quem escreve leu o que estava lá. Sem isto, a própria mensagem cairia
  -- como não lida para o autor no instante seguinte.
  insert into public.chat_channel_members (tenant_id, channel_id, user_id, last_read_at)
  values (v_tenant, p_channel_id, v_ator, now())
  on conflict (channel_id, user_id) do update
    set last_read_at = greatest(
      public.chat_channel_members.last_read_at,
      excluded.last_read_at
    );

  return v_id;
end;
$$;

comment on function public.chat_post_message(uuid, text, uuid, uuid[]) is
  'Publica a mensagem, grava as menções e anda o marcador do autor — numa transação.';

revoke execute on function public.chat_post_message(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.chat_post_message(uuid, text, uuid, uuid[]) to authenticated;

create or replace function public.chat_edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canal   uuid;
  v_autor   uuid;
  v_criada  timestamptz;
  v_apagada timestamptz;
  v_corpo   text := btrim(coalesce(p_body, ''));
  v_ator    uuid := (select auth.uid());
begin
  select m.channel_id, m.author_id, m.created_at, m.deleted_at
  into v_canal, v_autor, v_criada, v_apagada
  from public.chat_messages m
  where m.id = p_message_id
  for update;

  if v_canal is null or not public.chat_channel_visible(v_canal) then
    raise exception using errcode = 'no_data_found', message = 'mensagem não encontrada';
  end if;

  -- Editar é do autor, e só dele. Moderador apaga — não reescreve. Pôr
  -- palavra na boca de alguém é pior que apagar o que ele disse, porque
  -- continua assinado.
  if v_autor is distinct from v_ator then
    raise exception using errcode = '42501', message = 'só quem escreveu edita a mensagem';
  end if;

  if v_apagada is not null then
    raise exception using errcode = '23514', message = 'mensagem apagada não se edita';
  end if;

  if now() - v_criada > public.chat_edit_window() then
    raise exception using
      errcode = '42501',
      message = 'a janela de edição desta mensagem já passou';
  end if;

  if v_corpo = '' then
    raise exception using errcode = '23514', message = 'a mensagem está vazia';
  end if;

  update public.chat_messages
  set body = v_corpo, edited_at = now()
  where id = p_message_id;

  -- As menções não mudam na edição, de propósito: a menção é o aviso que já
  -- foi entregue, e desfazer aviso entregue não é edição de texto.
end;
$$;

comment on function public.chat_edit_message(uuid, text) is
  'Corrige a própria mensagem dentro da janela. Moderador não edita mensagem alheia — assinada é dele.';

revoke execute on function public.chat_edit_message(uuid, text) from public, anon;
grant execute on function public.chat_edit_message(uuid, text) to authenticated;

create or replace function public.chat_delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid;
  v_canal   uuid;
  v_autor   uuid;
  v_apagada timestamptz;
  v_ator    uuid := (select auth.uid());
begin
  -- `for update`: autor e moderador podem chegar juntos. Sem o bloqueio, as
  -- duas transações leriam "ainda não apagada" e gravariam duas linhas de
  -- auditoria para um apagar só.
  select m.tenant_id, m.channel_id, m.author_id, m.deleted_at
  into v_tenant, v_canal, v_autor, v_apagada
  from public.chat_messages m
  where m.id = p_message_id
  for update;

  if v_tenant is null or not public.chat_channel_visible(v_canal) then
    raise exception using errcode = 'no_data_found', message = 'mensagem não encontrada';
  end if;

  if v_autor is distinct from v_ator and not public.chat_is_moderator(v_tenant) then
    raise exception using errcode = '42501', message = 'você não pode apagar esta mensagem';
  end if;

  -- Já apagada: nada a fazer, e sem erro. Apagar duas vezes é o mesmo pedido.
  if v_apagada is not null then
    return;
  end if;

  update public.chat_messages
  set deleted_at = now(), body = ''
  where id = p_message_id;

  -- Auditoria só quando alguém apaga a mensagem de outra pessoa. Apagar a
  -- própria é uso normal; registrar tudo encheria a auditoria de ruído e
  -- esconderia justamente o caso que se quer achar depois.
  if v_autor is distinct from v_ator then
    insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    values (
      v_tenant, v_ator, 'chat.message_moderated', 'chat_message', p_message_id::text,
      jsonb_build_object('canal', v_canal, 'autor', v_autor)
    );
  end if;
end;
$$;

comment on function public.chat_delete_message(uuid) is
  'Marca a mensagem como apagada e esvazia o corpo. Moderação vai para a auditoria; apagar a própria, não.';

revoke execute on function public.chat_delete_message(uuid) from public, anon;
grant execute on function public.chat_delete_message(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Não lidas
-- ─────────────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER: a contagem enxerga exatamente o que o RLS deixa quem
-- pergunta enxergar. Canal restrito de que a pessoa não participa não aparece
-- na lista, e não aparece com zero — não aparece.
--
-- Conta varrendo as mensagens do canal. No tamanho de uma equipe isso é
-- barato; quando doer, o caminho é um contador materializado por
-- (canal, pessoa), e não um índice a mais. Fica escrito para não ser
-- redescoberto na brasa.

create or replace function public.chat_unread_counts(p_tenant_id uuid)
returns table (
  channel_id      uuid,
  unread          bigint,
  unread_mentions bigint,
  last_message_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    count(m.id) filter (
      where m.deleted_at is null
        and m.author_id is distinct from (select auth.uid())
        and (cm.last_read_at is null or m.created_at > cm.last_read_at)
    ) as unread,
    count(m.id) filter (
      where m.deleted_at is null
        and m.author_id is distinct from (select auth.uid())
        and (cm.last_read_at is null or m.created_at > cm.last_read_at)
        and mn.id is not null
    ) as unread_mentions,
    max(m.created_at) as last_message_at
  from public.chat_channels c
  left join public.chat_channel_members cm
    on cm.channel_id = c.id and cm.user_id = (select auth.uid())
  left join public.chat_messages m
    on m.channel_id = c.id
  left join public.chat_message_mentions mn
    on mn.message_id = m.id and mn.user_id = (select auth.uid())
  where c.tenant_id = p_tenant_id
  group by c.id;
$$;

comment on function public.chat_unread_counts(uuid) is
  'Não lidas por canal, sob o RLS de quem pergunta. Espelha unreadCount() do @tivexy/core.';

revoke execute on function public.chat_unread_counts(uuid) from public, anon;
grant execute on function public.chat_unread_counts(uuid) to authenticated;
