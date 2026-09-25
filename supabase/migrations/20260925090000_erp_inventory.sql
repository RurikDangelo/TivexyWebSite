-- Tivexy Estoque — movimentação e saldo
--
-- ─────────────────────────────────────────────────────────────────────────
-- Livro-razão e saldo
-- ─────────────────────────────────────────────────────────────────────────
--
-- O desenho de ERPNext (Stock Ledger Entry + Bin) e do Odoo (stock.move +
-- stock.quant): toda mudança de estoque é uma linha de movimentação, que
-- **nunca** se edita nem se apaga; o saldo é a soma delas, guardada pronta
-- numa segunda tabela para não somar a história inteira a cada tela.
--
-- Por que não guardar só o saldo: "tinha 12 e agora tem 9" não diz se foram
-- três vendas, uma perda ou um erro de contagem. O razão diz. E por que não
-- guardar só o razão: o saldo é a pergunta mais feita do módulo, e somar
-- dez mil linhas para respondê-la é o tipo de lentidão que aparece no dia em
-- que a loja cresce.
--
-- Quem mantém o saldo é um gatilho, na mesma transação da movimentação.
-- Ninguém de fora escreve nele — nem quem administra.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Saldo negativo é permitido
-- ─────────────────────────────────────────────────────────────────────────
--
-- A decisão do Odoo, e não a do ERPNext. No comércio pequeno a mercadoria é
-- vendida antes de alguém lançar a entrada; recusar a venda porque o estoque
-- *do sistema* está zerado trava o caixa por um erro de cadastro. O saldo
-- negativo aparece destacado na tela, que é onde ele pode ser corrigido.

create type public.inventory_movement_kind as enum (
  'in',          -- entrada: compra, produção, devolução de fornecedor
  'out',         -- saída que não é venda: perda, quebra, consumo, validade
  'adjustment',  -- contagem: o saldo passa a ser o contado
  'sale',        -- baixa de venda — só o gatilho da venda escreve
  'sale_return'  -- devolução por venda cancelada — idem
);

create table public.inventory_movements (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  product_id       uuid not null,
  kind             public.inventory_movement_kind not null,
  -- Com sinal: positivo entra, negativo sai.
  quantity         numeric(14, 3) not null,
  -- Só na contagem: o que foi contado. `quantity` é a diferença, calculada
  -- pelo banco contra o saldo daquele instante.
  counted_quantity numeric(14, 3),
  unit_cost_cents  bigint,
  reason           text,
  sale_id          uuid,
  sale_item_id     uuid,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint inventory_movements_quantity_not_zero check (quantity <> 0 or kind = 'adjustment'),
  constraint inventory_movements_sign check (
    (kind in ('in', 'sale_return') and quantity > 0)
    or (kind in ('out', 'sale') and quantity < 0)
    or kind = 'adjustment'
  ),
  constraint inventory_movements_count check (
    (kind = 'adjustment') = (counted_quantity is not null)
    and (counted_quantity is null or counted_quantity >= 0)
  ),
  -- Saída sem motivo é o furo que ninguém explica no fim do mês.
  constraint inventory_movements_reason check (
    kind <> 'out' or nullif(btrim(reason), '') is not null
  ),
  constraint inventory_movements_cost check (
    unit_cost_cents is null or (unit_cost_cents >= 0 and kind = 'in')
  ),
  constraint inventory_movements_sale_link check (
    (kind in ('sale', 'sale_return')) = (sale_item_id is not null)
    and (sale_item_id is null) = (sale_id is null)
  ),
  constraint inventory_movements_tenant_id_key unique (tenant_id, id),
  -- Produto com movimentação não se apaga: a história precisa de a quem
  -- pertence. Sem `on delete`, pelo mesmo motivo da venda.
  constraint inventory_movements_product_do_tenant
    foreign key (tenant_id, product_id) references public.erp_products (tenant_id, id),
  constraint inventory_movements_sale_do_tenant
    foreign key (tenant_id, sale_id) references public.erp_sales (tenant_id, id),
  constraint inventory_movements_sale_item_do_tenant
    foreign key (tenant_id, sale_item_id) references public.erp_sale_items (tenant_id, id)
);

comment on table public.inventory_movements is
  'Razão do estoque. Só inserção: nunca se edita nem se apaga.';

create index inventory_movements_product_idx
  on public.inventory_movements (tenant_id, product_id, created_at desc);
create index inventory_movements_tenant_idx
  on public.inventory_movements (tenant_id, created_at desc);

-- Uma baixa por item vendido, e uma devolução por item — cancelar duas vezes,
-- ou um gatilho que dispare de novo, não mexe no saldo duas vezes.
create unique index inventory_movements_one_per_sale_item
  on public.inventory_movements (tenant_id, sale_item_id, kind)
  where sale_item_id is not null;

create table public.inventory_stock_levels (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  product_id uuid not null,
  quantity   numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),

  primary key (tenant_id, product_id),
  constraint inventory_stock_levels_product_do_tenant
    foreign key (tenant_id, product_id) references public.erp_products (tenant_id, id)
    on delete cascade
);

comment on table public.inventory_stock_levels is
  'Saldo por produto: a soma de inventory_movements, mantida por gatilho. Ninguém de fora escreve.';

-- ─────────────────────────────────────────────────────────────────────────
-- Antes de gravar: quem, o quê, e a diferença da contagem
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.inventory_movements_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto public.erp_products;
  v_saldo   numeric(14, 3);
begin
  select * into v_produto
  from public.erp_products p
  where p.id = new.product_id and p.tenant_id = new.tenant_id;

  if v_produto.id is null then
    raise exception using errcode = 'no_data_found', message = 'produto não encontrado';
  end if;

  new.created_by := auth.uid();
  new.created_at := now();
  new.reason := nullif(btrim(coalesce(new.reason, '')), '');

  -- Baixa e devolução de venda espelham o item vendido, e já passaram pelas
  -- regras dele no dia da venda. Conferir de novo aqui travaria o
  -- cancelamento de uma venda antiga só porque o cadastro mudou depois —
  -- o produto deixou de controlar estoque, ou mudou de unidade.
  if new.kind in ('sale', 'sale_return') then
    return new;
  end if;

  if not v_produto.track_stock then
    raise exception using
      errcode = '55000',
      message = format('"%s" não controla estoque', v_produto.name);
  end if;

  if new.kind = 'adjustment' then
    if new.counted_quantity is null or new.counted_quantity < 0 then
      raise exception using errcode = '23514', message = 'a contagem precisa ser zero ou mais';
    end if;
    -- A linha do saldo fica presa até o fim da transação: uma venda que
    -- chegue agora espera, e a diferença é contra o saldo que a contagem viu.
    select l.quantity into v_saldo
    from public.inventory_stock_levels l
    where l.tenant_id = new.tenant_id and l.product_id = new.product_id
    for update;
    new.quantity := new.counted_quantity - coalesce(v_saldo, 0);
  end if;

  if not public.erp_unit_is_fractional(v_produto.unit)
     and (new.quantity <> trunc(new.quantity)
          or coalesce(new.counted_quantity, 0) <> trunc(coalesce(new.counted_quantity, 0))) then
    raise exception using
      errcode = '23514',
      message = format('"%s" se conta por %s, sem fração', v_produto.name, v_produto.unit);
  end if;

  return new;
end;
$$;

create trigger inventory_movements_before_insert
  before insert on public.inventory_movements
  for each row execute function public.inventory_movements_before_insert();

-- Depois de gravar: o saldo.
create or replace function public.inventory_movements_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_stock_levels as l (tenant_id, product_id, quantity)
  values (new.tenant_id, new.product_id, new.quantity)
  on conflict (tenant_id, product_id)
  do update set quantity = l.quantity + excluded.quantity, updated_at = now();
  return null;
end;
$$;

create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function public.inventory_movements_apply();

-- ─────────────────────────────────────────────────────────────────────────
-- A venda, vista pelo estoque
-- ─────────────────────────────────────────────────────────────────────────
--
-- Baixa quando: o tenant tem o módulo de estoque, a configuração
-- `inventory.deduct_on_sale` está ligada, e o produto controla estoque. Com
-- qualquer uma das três desligada, a venda acontece e o estoque não se mexe
-- — que é o que a tela de configurações promete.

create or replace function public.inventory_on_sale_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tenant_module_enabled(new.tenant_id, 'inventory') then
    return null;
  end if;
  if public.tenant_setting(new.tenant_id, 'inventory.deduct_on_sale') is distinct from 'true'::jsonb then
    return null;
  end if;
  if not exists (
    select 1 from public.erp_products p
    where p.id = new.product_id and p.tenant_id = new.tenant_id and p.track_stock
  ) then
    return null;
  end if;

  insert into public.inventory_movements (tenant_id, product_id, kind, quantity, sale_id, sale_item_id)
  values (new.tenant_id, new.product_id, 'sale', -new.quantity, new.sale_id, new.id);
  return null;
end;
$$;

create trigger inventory_on_sale_item
  after insert on public.erp_sale_items
  for each row execute function public.inventory_on_sale_item();

-- Venda cancelada devolve **o que baixou** — nem mais, nem menos. Se a baixa
-- estava desligada no dia da venda, não há o que devolver, mesmo que tenha
-- sido ligada depois.
create or replace function public.inventory_on_sale_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_movements (tenant_id, product_id, kind, quantity, sale_id, sale_item_id, reason)
  select m.tenant_id, m.product_id, 'sale_return', -m.quantity, m.sale_id, m.sale_item_id,
         format('venda nº %s cancelada', new.number)
  from public.inventory_movements m
  where m.tenant_id = new.tenant_id and m.sale_id = new.id and m.kind = 'sale'
  on conflict do nothing;
  return null;
end;
$$;

create trigger inventory_on_sale_cancelled
  after update of status on public.erp_sales
  for each row
  when (old.status = 'completed' and new.status = 'cancelled')
  execute function public.inventory_on_sale_cancelled();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS e privilégios
-- ─────────────────────────────────────────────────────────────────────────

alter table public.inventory_movements    enable row level security;
alter table public.inventory_stock_levels enable row level security;

create policy inventory_movements_read on public.inventory_movements
  for select to authenticated
  using (public.is_super_admin() or public.has_permission(tenant_id, 'inventory.movements.read'));

-- À mão, só entrada, saída e contagem. Baixa e devolução de venda nascem da
-- venda; escrever uma sem venda seria sumir com mercadoria pela porta dos
-- fundos.
create policy inventory_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (
    kind in ('in', 'out', 'adjustment')
    and sale_id is null
    and sale_item_id is null
    and (public.is_super_admin() or public.has_permission(tenant_id, 'inventory.movements.write'))
  );

-- O saldo aparece para quem vê estoque e para quem cuida do cadastro: "tem
-- em estoque?" é a pergunta de quem vende.
create policy inventory_stock_levels_read on public.inventory_stock_levels
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_permission(tenant_id, 'inventory.stock.read')
    or public.has_permission(tenant_id, 'erp.products.read')
  );

revoke update, delete on public.inventory_movements from anon, authenticated;
revoke insert, update, delete on public.inventory_stock_levels from anon, authenticated;
