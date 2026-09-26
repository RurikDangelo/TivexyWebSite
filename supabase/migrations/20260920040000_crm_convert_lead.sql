-- Tivexy CRM — converter um lead
--
-- O momento em que um contato incerto vira cliente: nasce a conta, nasce a
-- pessoa, nasce a oportunidade, e o lead é carimbado com o que virou.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Por que isto é função do banco, e não quatro chamadas da aplicação
-- ─────────────────────────────────────────────────────────────────────────
--
-- São quatro escritas que só fazem sentido juntas. O cliente PostgREST não
-- tem transação: cada chamada é a sua. Quatro chamadas seguidas significam
-- quatro pontos onde a rede pode cair, e cada um deixa um estrago diferente:
--
--   depois da conta      conta órfã, sem pessoa e sem oportunidade
--   depois da pessoa     pessoa sem oportunidade, lead ainda "qualificado"
--   depois do negócio    oportunidade real, lead que não sabe que converteu
--
-- O terceiro é o pior, porque não parece defeito: a oportunidade aparece no
-- funil, e o lead continua na fila esperando alguém ligar de novo.
--
-- Dentro de uma função, o corpo inteiro é uma transação. Ou os quatro
-- acontecem, ou nenhum.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER, de propósito
-- ─────────────────────────────────────────────────────────────────────────
--
-- O padrão do Postgres, e aqui ele é a escolha certa — diferente das funções
-- auxiliares do RLS, que precisam de DEFINER para não recorrer.
--
-- Com INVOKER, cada `insert` lá dentro passa pela política da tabela como se
-- a aplicação o tivesse escrito. Quem não tem `crm.deals.write` não converte,
-- e não converte **inteiro**: a transação inteira volta atrás. Uma função
-- DEFINER aqui seria um buraco com nome amigável, capaz de criar conta,
-- pessoa e oportunidade para quem só podia ler lead.

create or replace function public.crm_convert_lead(
  p_lead_id     uuid,
  p_stage_id    uuid,
  p_deal_title  text default null,
  p_value_cents bigint default 0
)
returns table (company_id uuid, contact_id uuid, deal_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead      public.crm_leads;
  v_tenant    uuid;
  v_pipeline  uuid;
  v_company   uuid;
  v_contact   uuid;
  v_deal      uuid;
begin
  -- `for update` segura a linha até o fim da transação. Sem isso, dois
  -- cliques simultâneos leriam os dois o lead como 'qualified' e criariam
  -- duas contas, duas pessoas e duas oportunidades para o mesmo contato.
  select * into v_lead
  from public.crm_leads
  where id = p_lead_id
  for update;

  -- O RLS já teria escondido o lead de outro tenant: aqui ele simplesmente
  -- não aparece, e a mensagem é a mesma de um id inexistente. Dizer "este
  -- lead é de outra empresa" confirmaria que ele existe.
  if v_lead.id is null then
    raise exception using
      errcode = 'no_data_found',
      message = 'lead não encontrado';
  end if;

  if v_lead.status = 'converted' then
    raise exception using
      errcode = '23505',
      message = format('o lead "%s" já foi convertido', v_lead.name);
  end if;

  if v_lead.status = 'disqualified' then
    raise exception using
      errcode = '23514',
      message = format('o lead "%s" está descartado; reabra antes de converter', v_lead.name);
  end if;

  v_tenant := v_lead.tenant_id;

  /*
   * A permissão, conferida antes de começar.
   *
   * **Isto não é a garantia** — a garantia é o RLS, que recusa cada `insert`
   * lá embaixo e derruba a transação inteira. Isto é a mensagem.
   *
   * Sem a checagem, quem não tem `crm.deals.write` também não tem
   * `crm.deals.read`, então a política esconde a etapa e a função responde
   * "etapa não encontrada neste funil". A pessoa procuraria a etapa, que está
   * lá, em vez de pedir a permissão que falta.
   */
  if not public.has_permission(v_tenant, 'crm.deals.write') then
    raise exception using
      errcode = '42501',
      message = 'converter cria uma oportunidade, e você não tem permissão para isso';
  end if;

  -- A etapa decide o funil. Pedir os dois seria pedir que a aplicação
  -- mantivesse a coerência entre eles, que é exatamente o que o gatilho
  -- `crm_deals_stage_do_pipeline` existe para não depender.
  select s.pipeline_id into v_pipeline
  from public.crm_pipeline_stages s
  where s.id = p_stage_id and s.tenant_id = v_tenant;

  if v_pipeline is null then
    raise exception using
      errcode = 'no_data_found',
      message = 'etapa não encontrada neste funil';
  end if;

  /*
   * A conta, quando o lead traz nome de empresa.
   *
   * Reaproveita quando já existe uma com o mesmo nome, ignorando caixa. É uma
   * troca consciente: reaproveitar pode grudar o negócio na empresa errada
   * quando há duas com nome igual, e não reaproveitar enche a base de
   * duplicatas — que é o defeito clássico de CRM e o mais caro de limpar
   * depois. Os dois enganos são **visíveis** na tela da conta; duplicata é o
   * que ninguém percebe até ter trezentas.
   *
   * Lead sem empresa não cria conta nenhuma. Pessoa física é caso normal.
   */
  if nullif(btrim(coalesce(v_lead.company_name, '')), '') is not null then
    -- A mais antiga, e não "uma qualquer": não há unicidade por nome, então
    -- duas homônimas podem existir. Sem `order by`, qual delas leva o negócio
    -- depende do plano de execução — e mudaria sozinho quando a tabela
    -- crescesse. A mais antiga é a original; as outras vieram depois.
    select c.id into v_company
    from public.crm_companies c
    where c.tenant_id = v_tenant
      and lower(c.name) = lower(btrim(v_lead.company_name))
    order by c.created_at, c.id
    limit 1;

    if v_company is null then
      insert into public.crm_companies (tenant_id, name, owner_id)
      values (v_tenant, btrim(v_lead.company_name), v_lead.owner_id)
      returning id into v_company;
    end if;
  end if;

  insert into public.crm_contacts (tenant_id, company_id, name, email, phone, owner_id)
  values (v_tenant, v_company, v_lead.name, v_lead.email, v_lead.phone, v_lead.owner_id)
  returning id into v_contact;

  insert into public.crm_deals (
    tenant_id, pipeline_id, stage_id, company_id, contact_id, title, value_cents, owner_id
  )
  values (
    v_tenant, v_pipeline, p_stage_id, v_company, v_contact,
    -- Sem título, o nome de quem virou cliente. É o que a pessoa procuraria.
    coalesce(nullif(btrim(coalesce(p_deal_title, '')), ''), v_lead.name),
    greatest(coalesce(p_value_cents, 0), 0),
    v_lead.owner_id
  )
  returning id into v_deal;

  update public.crm_leads
  set status               = 'converted',
      converted_at         = now(),
      converted_company_id = v_company,
      converted_contact_id = v_contact,
      converted_deal_id    = v_deal
  where id = p_lead_id;

  return query select v_company, v_contact, v_deal;
end;
$$;

comment on function public.crm_convert_lead(uuid, uuid, text, bigint) is
  'Converte um lead em conta, pessoa e oportunidade, numa transação só. SECURITY INVOKER: passa pelo RLS.';

grant execute on function public.crm_convert_lead(uuid, uuid, text, bigint) to authenticated;
