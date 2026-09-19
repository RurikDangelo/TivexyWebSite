-- Tivexy Core — colunas de `tenants` que são decisão da plataforma
--
-- Mesma forma da escalada em `public.users`, encontrada na mesma revisão: a
-- política `tenants_update` aprova a LINHA (a pessoa tem `core.tenant.write`)
-- e não olha a COLUNA. Com isso, o administrador de um tenant podia escrever
-- em qualquer campo da própria empresa — inclusive nos que não são dele.
--
--   status   um tenant suspenso por inadimplência se reativava sozinho
--   plan_id  troca de plano sem passar pelo comercial
--   slug     é o subdomínio: mudar quebra todos os links existentes
--
-- De novo, o primitivo certo é privilégio de coluna, que falha fechado.

revoke update on public.tenants from authenticated;

-- O que a empresa de fato administra sobre si mesma.
grant update (name, legal_name, document, settings) on public.tenants to authenticated;

comment on column public.tenants.status is
  'Decisão da plataforma. Não atualizável pelo papel authenticated: suspender e reativar é operação de backend, auditada.';
comment on column public.tenants.plan_id is
  'Decisão comercial. Não atualizável pelo papel authenticated.';
