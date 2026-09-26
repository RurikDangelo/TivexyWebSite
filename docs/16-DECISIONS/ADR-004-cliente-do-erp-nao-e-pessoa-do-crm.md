# ADR-004 — O cliente do ERP não é a pessoa do CRM

**Data:** 25/09/2026 · **Status:** Aceita

## Contexto

O ERP precisa de cliente: a venda aponta para quem comprou, e a configuração
`erp.sales_requires_customer` pode exigir que aponte. O CRM já tem pessoas
(`crm_contacts`) e contas (`crm_companies`).

A tentação é reaproveitar: "cliente é contato que comprou". Três fatos pesam
contra, hoje:

1. **Nem todo tenant tem os dois módulos.** A cafeteria e o mercado nascem com
   ERP e sem CRM (ver `packages/core/blueprints/`). Se o cliente da venda fosse
   `crm_contacts`, a venda dependeria de um módulo que o tenant não contratou —
   e as políticas de `crm_contacts` pedem `crm.contacts.read`, que o operador de
   caixa não tem.
2. **As permissões são outras.** `erp.customers.*` e `crm.contacts.*` já
   existem separadas no catálogo, e os papéis de nicho foram escritos sobre
   elas: o barista lê cliente e não lê funil.
3. **O dado é outro.** Pessoa do CRM é quem se relaciona — interessado,
   indicado, contato de empresa. Cliente do ERP é quem compra, e carrega o que a
   venda precisa: documento para identificar, e daqui a pouco endereço de
   entrega e limite de crédito.

## Decisão

`erp_customers` é cadastro próprio do ERP, com as mesmas regras de documento do
Core (`DOCUMENT_PATTERN`, único por tenant). O ERP não referencia tabela do CRM,
e o CRM não referencia tabela do ERP.

## O que fica para depois, e quando

Quando um tenant tiver os dois módulos e pedir, a ligação é **uma coluna
opcional** — `erp_customers.crm_contact_id`, chave composta com `tenant_id` —,
e não a fusão das tabelas. Ela permite "ver as compras desta pessoa" na página
do contato sem que nenhum dos dois módulos passe a depender do outro para
existir.

## Consequências

- Um tenant com os dois módulos pode ter a mesma pessoa nos dois cadastros.
  É duplicação visível, resolvida pela ligação acima quando houver demanda —
  não por um modelo que obrigue a cafeteria a ter CRM.
- O painel do negócio soma vendas por `erp_customers` e oportunidades por
  `crm_companies`, sem cruzar os dois.
