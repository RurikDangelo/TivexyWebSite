-- Tivexy Core — o espelho de auth.users em public.users
--
-- `public.users` sempre foi descrita como "espelha auth.users", e a chave
-- primária dela referencia `auth.users (id)`. Só que **nada fazia o espelho**.
--
-- Sem isto, toda pessoa que se cadastrasse existiria para a autenticação e não
-- existiria para a aplicação: `current_viewer()` não a acharia, ela não teria
-- vínculo com tenant nenhum, e o sintoma seria "entrei e o sistema diz que não
-- me conhece". Pior ainda, o defeito só apareceria com o primeiro cadastro
-- real — depois de o produto estar no ar.
--
-- Poderia ser código de aplicação. Não deveria: existem vários caminhos para
-- nascer uma identidade (cadastro, convite, OAuth, criação pelo Super Admin), e
-- cada um teria que lembrar de espelhar. É a mesma regra que vale para o resto
-- deste esquema — regra que depende de a aplicação lembrar não é regra.

create or replace function public.mirror_auth_user()
returns trigger
language plpgsql
security definer
-- Sem `search_path` fixo, quem controlasse o search_path da sessão redirecionaria
-- `public.users` para uma tabela própria. O gatilho roda como dono.
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    -- O que o provedor mandou, se mandou. `raw_user_meta_data` é onde o
    -- Supabase guarda o que veio do cadastro ou do OAuth.
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  -- Reenvio de convite e recriação chegam aqui de novo. Atualizar o que o
  -- provedor sabe, e **não** tocar no resto: `is_super_admin` é decisão da
  -- plataforma e não pode vir de metadado de cadastro.
  on conflict (id) do update
    set email     = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

comment on function public.mirror_auth_user() is
  'Cria o perfil em public.users quando nasce uma identidade em auth.users. Nunca escreve is_super_admin.';

drop trigger if exists mirror_auth_user_on_insert on auth.users;

create trigger mirror_auth_user_on_insert
  after insert on auth.users
  for each row
  execute function public.mirror_auth_user();
