-- Tivexy Core — catálogo da plataforma
--
-- Dado de REFERÊNCIA, não dado de demonstração: módulos, permissões, papéis de
-- sistema e planos. Por isso está em migration, e não em seed — o sistema não
-- funciona sem isso, inclusive em produção.
--
-- Dado fictício de tenant demo é outra coisa e mora em `supabase/seed.sql`.
--
-- Tudo aqui é idempotente (`on conflict do nothing`): rodar de novo não duplica.

-- ─────────────────────────────────────────────────────────────────────────
-- Módulos
-- ─────────────────────────────────────────────────────────────────────────

insert into public.modules (code, name, description, sort_order) values
  ('core',         'Core',         'Identidade, tenants, usuários, permissões e auditoria', 0),
  ('crm',          'CRM',          'Leads, contatos, empresas, oportunidades e atividades', 10),
  ('erp',          'ERP',          'Produtos, clientes, fornecedores, vendas e compras',    20),
  ('inventory',    'Estoque',      'Entradas, saídas, ajustes e inventário',                30),
  ('finance',      'Financeiro',   'Contas a pagar e receber, centros de custo e caixa',    40),
  ('fiscal',       'Fiscal',       'Documentos fiscais e integração com provedor',          50),
  ('automation',   'Automações',   'Gatilhos, condições e ações',                           60),
  ('ai',           'IA',           'Assistente e análises com inteligência artificial',     70),
  ('integrations', 'Integrações',  'Conexões com serviços externos',                        80)
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- Permissões — formato modulo.recurso.acao
-- ─────────────────────────────────────────────────────────────────────────

insert into public.permissions (code, module_id, name)
select v.code, m.id, v.name
from (values
  -- Core
  ('core.tenant.read',              'core',         'Ver dados da empresa'),
  ('core.tenant.write',             'core',         'Editar dados da empresa'),
  ('core.users.read',               'core',         'Ver usuários'),
  ('core.users.write',              'core',         'Convidar e gerenciar usuários'),
  ('core.roles.read',               'core',         'Ver papéis e permissões'),
  ('core.roles.write',              'core',         'Criar e editar papéis'),
  ('core.teams.read',               'core',         'Ver equipes'),
  ('core.teams.write',              'core',         'Gerenciar equipes'),
  ('core.audit.read',               'core',         'Ver auditoria'),
  ('core.settings.read',            'core',         'Ver configurações'),
  ('core.settings.write',           'core',         'Editar configurações'),
  -- CRM
  ('crm.leads.read',                'crm',          'Ver leads'),
  ('crm.leads.write',               'crm',          'Criar e editar leads'),
  ('crm.leads.delete',              'crm',          'Excluir leads'),
  ('crm.contacts.read',             'crm',          'Ver contatos'),
  ('crm.contacts.write',            'crm',          'Criar e editar contatos'),
  ('crm.contacts.delete',           'crm',          'Excluir contatos'),
  ('crm.companies.read',            'crm',          'Ver empresas'),
  ('crm.companies.write',           'crm',          'Criar e editar empresas'),
  ('crm.companies.delete',          'crm',          'Excluir empresas'),
  ('crm.deals.read',                'crm',          'Ver oportunidades'),
  ('crm.deals.write',               'crm',          'Criar e editar oportunidades'),
  ('crm.deals.delete',              'crm',          'Excluir oportunidades'),
  ('crm.activities.read',           'crm',          'Ver atividades'),
  ('crm.activities.write',          'crm',          'Criar e editar atividades'),
  -- ERP
  ('erp.products.read',             'erp',          'Ver produtos'),
  ('erp.products.write',            'erp',          'Criar e editar produtos'),
  ('erp.products.delete',           'erp',          'Excluir produtos'),
  ('erp.customers.read',            'erp',          'Ver clientes'),
  ('erp.customers.write',           'erp',          'Criar e editar clientes'),
  ('erp.suppliers.read',            'erp',          'Ver fornecedores'),
  ('erp.suppliers.write',           'erp',          'Criar e editar fornecedores'),
  ('erp.sales.read',                'erp',          'Ver vendas'),
  ('erp.sales.write',               'erp',          'Registrar vendas'),
  ('erp.purchases.read',            'erp',          'Ver compras'),
  ('erp.purchases.write',           'erp',          'Registrar compras'),
  -- Estoque
  ('inventory.stock.read',          'inventory',    'Ver estoque'),
  ('inventory.movements.read',      'inventory',    'Ver movimentações'),
  ('inventory.movements.write',     'inventory',    'Registrar movimentações'),
  -- Financeiro
  ('finance.payables.read',         'finance',      'Ver contas a pagar'),
  ('finance.payables.write',        'finance',      'Gerenciar contas a pagar'),
  ('finance.receivables.read',      'finance',      'Ver contas a receber'),
  ('finance.receivables.write',     'finance',      'Gerenciar contas a receber'),
  ('finance.cashflow.read',         'finance',      'Ver fluxo de caixa'),
  -- Fiscal
  ('fiscal.documents.read',         'fiscal',       'Ver documentos fiscais'),
  ('fiscal.documents.write',        'fiscal',       'Emitir documentos fiscais'),
  -- Automações
  ('automation.rules.read',         'automation',   'Ver automações'),
  ('automation.rules.write',        'automation',   'Criar e editar automações'),
  -- IA
  ('ai.assistant.use',              'ai',           'Usar o assistente'),
  -- Integrações
  ('integrations.connections.read',  'integrations', 'Ver integrações'),
  ('integrations.connections.write', 'integrations', 'Conectar e configurar integrações')
) as v(code, module_code, name)
join public.modules m on m.code = v.module_code
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- Papéis de sistema
-- ─────────────────────────────────────────────────────────────────────────
--
-- Super Admin não aparece aqui de propósito: é sinalizador de plataforma em
-- `users`, não papel de tenant. Ver a migration de identidade.

insert into public.roles (tenant_id, code, name, description, is_system) values
  (null, 'tenant_admin',  'Administrador',
   'Controle total dentro da empresa, incluindo usuários e permissões.', true),
  (null, 'manager',       'Gestor',
   'Opera todos os módulos contratados e gerencia equipes. Não altera papéis.', true),
  (null, 'collaborator',  'Colaborador',
   'Trabalha no dia a dia: leads, atividades, vendas e movimentações.', true)
on conflict do nothing;

-- Administrador: tudo.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'tenant_admin' and r.tenant_id is null
on conflict do nothing;

-- Gestor: tudo, menos governança de papéis e dados cadastrais da empresa.
-- Um gestor que edita papéis pode se promover a administrador.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'manager' and r.tenant_id is null
  and p.code not in ('core.roles.write', 'core.tenant.write', 'core.settings.write')
on conflict do nothing;

-- Colaborador: leitura dos módulos de negócio, mais a escrita do dia a dia.
-- Sem exclusão, sem financeiro, sem fiscal, sem governança.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'collaborator' and r.tenant_id is null
  and (
    p.code in (
      'crm.leads.read',      'crm.leads.write',
      'crm.contacts.read',   'crm.contacts.write',
      'crm.companies.read',
      'crm.deals.read',      'crm.deals.write',
      'crm.activities.read', 'crm.activities.write',
      'erp.products.read',
      'erp.customers.read',  'erp.customers.write',
      'erp.sales.read',      'erp.sales.write',
      'inventory.stock.read',
      'inventory.movements.read', 'inventory.movements.write',
      'ai.assistant.use',
      'core.tenant.read',    'core.users.read', 'core.teams.read'
    )
  )
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- Planos
-- ─────────────────────────────────────────────────────────────────────────
--
-- Preço não fica aqui: muda por negociação e por tabela comercial, e não é
-- decisão de esquema. O plano define o que o tenant recebe habilitado.

insert into public.plans (code, name, description, sort_order) values
  ('essencial',    'Essencial',    'Core e CRM. Para começar a organizar o relacionamento.',        10),
  ('profissional', 'Profissional', 'Essencial mais ERP, estoque, financeiro e automações.',         20),
  ('avancado',     'Avançado',     'Profissional mais fiscal, IA e integrações.',                   30)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_id)
select pl.id, m.id
from public.plans pl
join public.modules m on m.code = any (
  case pl.code
    when 'essencial'    then array['core', 'crm']
    when 'profissional' then array['core', 'crm', 'erp', 'inventory', 'finance', 'automation']
    when 'avancado'     then array['core', 'crm', 'erp', 'inventory', 'finance', 'automation',
                                   'fiscal', 'ai', 'integrations']
    else array[]::text[]
  end
)
on conflict do nothing;
