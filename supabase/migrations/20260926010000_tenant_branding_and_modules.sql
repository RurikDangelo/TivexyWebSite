-- Tivexy Core — marca do cliente e módulos por empresa
--
-- Duas lacunas que a auditoria de 26/09/2026 encontrou e que o painel
-- administrativo precisa para fazer o que foi pedido dele: criar uma empresa
-- escolhendo **módulos**, **cor** e **logo**.
--
-- Nenhuma das duas existia. `tenants` não tinha coluna de aparência nenhuma, e
-- os módulos vinham inteiramente derivados do blueprint do nicho — o Super
-- Admin não tinha como ligar ou desligar um módulo depois, embora
-- `tenant_modules` já fosse a verdade sobre acesso desde 20260919020100 e o
-- comentário daquela migração já citasse cortesia, piloto e migração como
-- casos reais.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. A marca mora em coluna, não em `settings`
-- ─────────────────────────────────────────────────────────────────────────
--
-- `settings` é jsonb e teria servido, mas a marca é lida em **toda**
-- requisição autenticada — o shell desenha o logo do cliente antes de qualquer
-- conteúdo. Coluna tipada, com restrição no banco, custa menos que um caminho
-- jsonb validado na aplicação, e erra mais cedo: uma cor inválida é recusada
-- aqui, não descoberta quando a tela renderiza.

alter table public.tenants
  add column if not exists brand_primary   text,
  add column if not exists brand_logo_path text;

comment on column public.tenants.brand_primary is
  'Cor principal do cliente em hexadecimal (#rrggbb). Nulo = usa o azul da Tivexy.';
comment on column public.tenants.brand_logo_path is
  'Caminho do logo dentro do bucket `tenant-branding`. Nulo = usa a marca da Tivexy.';

-- Hexadecimal de seis dígitos, minúsculo, com cerquilha. Uma forma só: aceitar
-- `#FFF`, `#FFFFFF` e `rgb(...)` significa três caminhos de conversão na tela.
alter table public.tenants
  drop constraint if exists tenants_brand_primary_format;
alter table public.tenants
  add constraint tenants_brand_primary_format
  check (brand_primary is null or brand_primary ~ '^#[0-9a-f]{6}$');

-- O caminho tem que começar pelo id do tenant: é o que amarra o arquivo à
-- empresa e o que a política do bucket usa para autorizar.
alter table public.tenants
  drop constraint if exists tenants_brand_logo_path_scoped;
alter table public.tenants
  add constraint tenants_brand_logo_path_scoped
  check (brand_logo_path is null or brand_logo_path like id::text || '/%');

-- As colunas nascem sem privilégio de escrita direta. `authenticated` já teve
-- `update` revogado em 20260919050000 e só recebeu de volta name, legal_name e
-- document — então não há nada a revogar aqui, e é assim que deve ficar: quem
-- escreve marca é a função abaixo, que confere e audita.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Onde o logo fica
-- ─────────────────────────────────────────────────────────────────────────
--
-- Leitura pública: o logo aparece no navegador de quem ainda não entrou, na
-- tela de login do cliente. Escrita só do Super Admin.
--
-- SVG está **fora** da lista de propósito. O bucket é de leitura pública e um
-- SVG é documento executável: servido do domínio do projeto Supabase, um script
-- embutido roda naquela origem. Só o Super Admin envia, então o risco é
-- pequeno — mas pequeno não é motivo para abrir. PNG ou WebP a 2x resolvem um
-- logo de 32 px. Para liberar SVG um dia, acrescente o mime e sanitize antes de
-- gravar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-branding',
  'tenant-branding',
  true,
  524288, -- 512 KB: é um logo, não um banner
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tenant_branding_read   on storage.objects;
drop policy if exists tenant_branding_insert on storage.objects;
drop policy if exists tenant_branding_update on storage.objects;
drop policy if exists tenant_branding_delete on storage.objects;

create policy tenant_branding_read on storage.objects
  for select using (bucket_id = 'tenant-branding');

create policy tenant_branding_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tenant-branding' and public.is_super_admin());

create policy tenant_branding_update on storage.objects
  for update to authenticated
  using (bucket_id = 'tenant-branding' and public.is_super_admin())
  with check (bucket_id = 'tenant-branding' and public.is_super_admin());

create policy tenant_branding_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tenant-branding' and public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Gravar a marca
-- ─────────────────────────────────────────────────────────────────────────
--
-- Os dois campos entram juntos porque são uma decisão só — "a cara deste
-- cliente" —, e separá-los renderia duas linhas de auditoria para uma mudança.
-- `p_clear_logo` existe porque nulo em `p_logo_path` significa "não mexe"; sem
-- uma segunda bandeira não haveria como **tirar** o logo e voltar ao da Tivexy.

create or replace function public.admin_set_tenant_brand(
  p_tenant_id  uuid,
  p_primary    text default null,
  p_logo_path  text default null,
  p_clear_logo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.tenants;
  v_cor   text;
  v_logo  text;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'só o Super Admin muda a marca de uma empresa';
  end if;

  select * into v_antes from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'empresa não encontrada';
  end if;

  -- Normaliza antes de validar: quem digita "#1648A6" quis a mesma cor.
  v_cor := nullif(lower(trim(coalesce(p_primary, ''))), '');
  if v_cor is not null and v_cor !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '22023',
      message = 'cor inválida: use hexadecimal de seis dígitos, como #1648a6';
  end if;

  v_logo := case
    when p_clear_logo then null
    when nullif(trim(coalesce(p_logo_path, '')), '') is null then v_antes.brand_logo_path
    else trim(p_logo_path)
  end;

  if v_logo is not null and v_logo not like p_tenant_id::text || '/%' then
    raise exception using errcode = '22023',
      message = 'o logo tem que estar na pasta da própria empresa';
  end if;

  update public.tenants
     set brand_primary   = v_cor,
         brand_logo_path = v_logo,
         updated_at      = now()
   where id = p_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, (select auth.uid()),
    'tenant.brand_changed', 'tenant', p_tenant_id::text,
    jsonb_build_object(
      'cor_de',  v_antes.brand_primary,   'cor_para',  v_cor,
      'logo_de', v_antes.brand_logo_path, 'logo_para', v_logo
    )
  );

  return jsonb_build_object('brand_primary', v_cor, 'brand_logo_path', v_logo);
end;
$$;

revoke execute on function public.admin_set_tenant_brand(uuid, text, text, boolean) from public, anon;
grant  execute on function public.admin_set_tenant_brand(uuid, text, text, boolean) to authenticated;

comment on function public.admin_set_tenant_brand(uuid, text, text, boolean) is
  'Cor e logo de uma empresa, em uma decisão só. Nulo na cor volta ao azul da Tivexy; p_clear_logo tira o logo.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Ligar e desligar um módulo
-- ─────────────────────────────────────────────────────────────────────────
--
-- `admin_change_plan` já move módulos em bloco, seguindo o plano. Esta função é
-- o caso que o plano não cobre e que a migração original previu em comentário:
-- cortesia, piloto, migração — um módulo a mais ou a menos do que o plano diz,
-- por decisão explícita, com motivo registrado.
--
-- Desligar **não apaga nada**. A linha fica, o acesso sai, religar devolve
-- tudo. É a mesma regra de `admin_change_plan`, e ela existe porque cliente que
-- volta atrás não pode perder o que cadastrou.

create or replace function public.admin_set_tenant_module(
  p_tenant_id   uuid,
  p_module_code text,
  p_enabled     boolean,
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module public.modules;
  v_status public.tenant_status;
  v_antes  boolean;
  v_motivo text;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'só o Super Admin liga ou desliga módulo de uma empresa';
  end if;

  select * into v_module from public.modules m where m.code = p_module_code;
  if not found then
    raise exception using errcode = '22023', message = 'módulo desconhecido';
  end if;
  if not v_module.is_active and p_enabled then
    raise exception using errcode = '22023', message = 'módulo fora de catálogo: não dá para ligar';
  end if;

  select t.status into v_status from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'empresa não encontrada';
  end if;
  if v_status = 'provisioning' then
    raise exception using errcode = '22023',
      message = 'empresa em provisionamento: conclua antes de mexer nos módulos';
  end if;

  select tm.is_enabled into v_antes
  from public.tenant_modules tm
  where tm.tenant_id = p_tenant_id and tm.module_id = v_module.id;

  if v_antes is not distinct from p_enabled then
    raise exception using errcode = '22023',
      message = case when p_enabled then 'o módulo já está ligado' else 'o módulo já está desligado' end;
  end if;

  v_motivo := nullif(trim(coalesce(p_reason, '')), '');

  insert into public.tenant_modules (tenant_id, module_id, is_enabled, enabled_at)
  values (p_tenant_id, v_module.id, p_enabled, case when p_enabled then now() end)
  on conflict (tenant_id, module_id) do update
    set is_enabled = excluded.is_enabled,
        enabled_at = case when excluded.is_enabled then now() else public.tenant_modules.enabled_at end,
        updated_at = now();

  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    p_tenant_id, (select auth.uid()),
    case when p_enabled then 'tenant.module_enabled' else 'tenant.module_disabled' end,
    'module', v_module.code,
    jsonb_build_object('de', v_antes, 'para', p_enabled, 'motivo', v_motivo)
  );

  return jsonb_build_object('module', v_module.code, 'is_enabled', p_enabled);
end;
$$;

revoke execute on function public.admin_set_tenant_module(uuid, text, boolean, text) from public, anon;
grant  execute on function public.admin_set_tenant_module(uuid, text, boolean, text) to authenticated;

comment on function public.admin_set_tenant_module(uuid, text, boolean, text) is
  'Liga ou desliga um módulo de uma empresa fora do plano. Desligar não apaga dado.';
