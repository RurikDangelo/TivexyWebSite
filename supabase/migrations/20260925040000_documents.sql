-- Tivexy — CPF e CNPJ, com o CNPJ que tem letra
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. O CNPJ é alfanumérico desde julho de 2026
-- ─────────────────────────────────────────────────────────────────────────
--
-- A IN RFB nº 2.229/2024 pôs letra nas doze primeiras posições do CNPJ. Os
-- dois dígitos verificadores continuam números. `tenants.document` e
-- `crm_companies.document` aceitavam `^[0-9]+$` — ou seja, recusavam toda
-- empresa aberta a partir de julho de 2026, que é exatamente o cliente novo.
--
-- A regra nova é a de `DOCUMENT_PATTERN`, em `packages/core/src/documents.ts`:
-- 11 dígitos (CPF) ou 12 alfanuméricos e 2 dígitos (CNPJ). O teste de
-- contratos compara as duas.
--
-- `not valid`: a constraint vale para toda escrita daqui para a frente e não
-- revisa o que já está gravado. A regra antiga aceitava qualquer quantidade de
-- dígitos, e reprovar agora uma linha antiga derrubaria a migration no banco
-- de produção por um dado que ninguém está editando.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 2. A pessoa passa a ter documento
-- ─────────────────────────────────────────────────────────────────────────
--
-- `crm.contact_requires_document` existe no catálogo de configurações, e a
-- clínica odontológica liga — mas `crm_contacts` não tinha onde guardar
-- documento. A configuração era uma promessa sem coluna.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 3. Um documento, um cadastro — por tenant
-- ─────────────────────────────────────────────────────────────────────────
--
-- Duplicata é o defeito clássico de CRM, e o mais caro de limpar depois. O
-- mesmo CPF duas vezes na mesma empresa é a mesma pessoa cadastrada duas
-- vezes; em empresas diferentes, é normal — cada cliente da Tivexy tem a sua
-- base.

alter table public.crm_contacts add column document text;

alter table public.crm_contacts
  add constraint crm_contacts_document_format
  check (document is null or document ~ '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$');

comment on column public.crm_contacts.document is
  'CPF ou CNPJ, sem pontuação e em maiúscula. Formatar é da interface.';

create unique index crm_contacts_document_per_tenant
  on public.crm_contacts (tenant_id, document)
  where document is not null;

alter table public.crm_companies drop constraint crm_companies_document_digits;
alter table public.crm_companies
  add constraint crm_companies_document_format
  check (document is null or document ~ '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$') not valid;

create unique index crm_companies_document_per_tenant
  on public.crm_companies (tenant_id, document)
  where document is not null;

alter table public.tenants drop constraint tenants_document_digits;
alter table public.tenants
  add constraint tenants_document_format
  check (document is null or document ~ '^[0-9]{11}$|^[0-9A-Z]{12}[0-9]{2}$') not valid;
