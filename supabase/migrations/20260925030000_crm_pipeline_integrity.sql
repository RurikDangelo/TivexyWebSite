-- Tivexy CRM — o funil passa a ser editável sem mentir
--
-- Até aqui o funil só nascia do Blueprint. A tela de oportunidades traz o
-- editor — criar funil, etapa, renomear, reordenar —, e editar abre dois
-- caminhos para dado errado que o esquema não fechava.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Mudar o tipo de uma etapa com oportunidades dentro
-- ─────────────────────────────────────────────────────────────────────────
--
-- `closed_at` é mantido por `sync_deal_closed_at()`, que dispara quando a
-- **oportunidade** muda de etapa. Se a **etapa** muda de `open` para `won`,
-- nenhuma oportunidade é tocada: as que estão lá passam a ser ganhas sem data
-- de fechamento, e o relatório de ciclo de venda deixa de fechar — sem erro.
--
-- Propagar a mudança para as oportunidades seria pior: carimbaria `now()`
-- como data de fechamento de negócios que fecharam em outro dia. O certo é
-- recusar, e a pessoa move as oportunidades antes. O mesmo vale para trocar a
-- etapa de funil: a oportunidade ficaria num funil e a etapa dela, em outro,
-- que é justamente o que `crm_deals_stage_do_pipeline` existe para impedir.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 2. Trocar o funil padrão
-- ─────────────────────────────────────────────────────────────────────────
--
-- Um padrão por tenant, garantido pelo índice parcial. Trocar exige duas
-- escritas — desmarcar o antigo, marcar o novo —, e o cliente PostgREST não
-- tem transação. Na ordem inversa o índice recusa; na ordem certa, uma queda
-- de rede no meio deixa o tenant sem padrão. Função, como `crm_convert_lead`.

-- A mensagem chega na tela, então fala o vocabulário do tenant: "tratamentos"
-- na clínica, "oportunidades" sem nicho. DEFINER já é preciso para contar
-- oportunidades que o RLS de quem edita talvez esconda; ler `tenants.terms`
-- vem junto.
create or replace function public.assert_stage_change_keeps_deals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plural text;
begin
  if (new.kind is distinct from old.kind or new.pipeline_id is distinct from old.pipeline_id)
     and exists (select 1 from public.crm_deals d where d.stage_id = old.id) then
    select coalesce(nullif(btrim(t.terms -> 'crm.deals' ->> 'plural'), ''), 'oportunidades')
    into v_plural
    from public.tenants t
    where t.id = old.tenant_id;

    raise exception using
      errcode = '23514',
      message = format(
        'a etapa "%s" ainda tem %s; esvazie a etapa antes de mudar o tipo ou o funil dela',
        old.name, coalesce(v_plural, 'oportunidades')
      );
  end if;

  return new;
end;
$$;

comment on function public.assert_stage_change_keeps_deals() is
  'Recusa mudar tipo ou funil de etapa com oportunidades: closed_at e o funil delas ficariam errados.';

create trigger crm_pipeline_stages_keeps_deals
  before update of kind, pipeline_id on public.crm_pipeline_stages
  for each row execute function public.assert_stage_change_keeps_deals();

-- SECURITY INVOKER: as duas escritas passam pelo RLS de `crm_pipelines`.
create or replace function public.crm_set_default_pipeline(p_pipeline_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  -- O RLS esconde o funil de outro tenant: a mensagem é a de um id que não existe.
  select p.tenant_id into v_tenant
  from public.crm_pipelines p
  where p.id = p_pipeline_id;

  if v_tenant is null then
    raise exception using
      errcode = 'no_data_found',
      message = 'funil não encontrado';
  end if;

  -- Sem a checagem, quem só lê executaria dois `update` que o RLS reduz a
  -- zero linhas, e a resposta seria sucesso sem nada ter mudado.
  if not (public.is_super_admin() or public.has_permission(v_tenant, 'crm.deals.write')) then
    raise exception using
      errcode = '42501',
      message = 'você não tem permissão para mudar o funil';
  end if;

  update public.crm_pipelines
  set is_default = false
  where tenant_id = v_tenant and is_default and id <> p_pipeline_id;

  update public.crm_pipelines
  set is_default = true
  where id = p_pipeline_id;
end;
$$;

comment on function public.crm_set_default_pipeline(uuid) is
  'Troca o funil padrão numa transação só. SECURITY INVOKER: passa pelo RLS.';

revoke execute on function public.crm_set_default_pipeline(uuid) from public, anon;
grant execute on function public.crm_set_default_pipeline(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Criar funil já com saída
-- ─────────────────────────────────────────────────────────────────────────
--
-- `checkBlueprint()` recusa funil sem etapa de ganho e de perda, porque sem
-- elas nenhum negócio fecha e o relatório nunca fecha — sem erro. O funil
-- criado pela tela precisa da mesma garantia, e a forma mais simples de ter é
-- nascer com as duas. São três escritas; numa função, uma transação.
--
-- O primeiro funil do tenant nasce padrão: sem padrão, a tela abriria o
-- primeiro por ordem, e ninguém escolheu isso.

create or replace function public.crm_create_pipeline(p_tenant_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nome       text := btrim(coalesce(p_name, ''));
  v_posicao    integer;
  v_tem_padrao boolean;
  v_id         uuid;
begin
  if v_nome = '' then
    raise exception using errcode = '23514', message = 'o funil precisa de um nome';
  end if;

  select coalesce(max(p.position), 0) + 1, coalesce(bool_or(p.is_default), false)
  into v_posicao, v_tem_padrao
  from public.crm_pipelines p
  where p.tenant_id = p_tenant_id;

  -- O RLS de `crm_pipelines` decide se esta pessoa pode: a inserção abaixo
  -- falha para quem não tem `crm.deals.write` neste tenant.
  insert into public.crm_pipelines (tenant_id, name, is_default, position)
  values (p_tenant_id, v_nome, not v_tem_padrao, v_posicao)
  returning id into v_id;

  insert into public.crm_pipeline_stages (tenant_id, pipeline_id, name, kind, position)
  values
    (p_tenant_id, v_id, 'Ganho', 'won', 1),
    (p_tenant_id, v_id, 'Perdido', 'lost', 2);

  return v_id;
end;
$$;

comment on function public.crm_create_pipeline(uuid, text) is
  'Cria o funil com as etapas de ganho e perda, numa transação. SECURITY INVOKER: passa pelo RLS.';

revoke execute on function public.crm_create_pipeline(uuid, text) from public, anon;
grant execute on function public.crm_create_pipeline(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Quantas oportunidades há em cada etapa
-- ─────────────────────────────────────────────────────────────────────────
--
-- O editor precisa saber quais etapas estão vazias — só essas mudam de tipo
-- ou saem. Contar no cliente exigiria trazer todas as oportunidades; o
-- agregado do PostgREST vem desligado no Supabase. INVOKER, então a contagem
-- só enxerga o que o RLS deixa quem pergunta enxergar.

create or replace function public.crm_stage_counts(p_tenant_id uuid)
returns table (stage_id uuid, deals bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.stage_id, count(*)
  from public.crm_deals d
  where d.tenant_id = p_tenant_id
  group by d.stage_id;
$$;

comment on function public.crm_stage_counts(uuid) is
  'Oportunidades por etapa, sob o RLS de quem pergunta.';

revoke execute on function public.crm_stage_counts(uuid) from public, anon;
grant execute on function public.crm_stage_counts(uuid) to authenticated;
