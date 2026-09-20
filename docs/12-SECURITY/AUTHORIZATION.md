# Autorização e RBAC

> Quem pode o quê. Quem **é** — de cookie a `Viewer` — está em
> [[../03-CORE/AUTHENTICATION|AUTHENTICATION]]. Isolamento entre tenants em
> [[MULTI_TENANCY]]; esquema em [[../02-ARCHITECTURE/DATABASE|DATABASE]].

## Duas camadas, uma regra

| Camada      | Responsabilidade                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Aplicação   | Verifica a permissão **antes** de agir, devolve erro claro, e não mostra o que a pessoa não pode usar |
| Banco (RLS) | Impede o acesso mesmo se a aplicação errar                                                            |

**Esconder botão não é autorização.** A verificação acontece no servidor, e o
teste de autorização chama a API direto, sem passar pela interface.

## Perfis

| Perfil           | Escopo                                            | Onde vive                       |
| ---------------- | ------------------------------------------------- | ------------------------------- |
| **Super Admin**  | Plataforma inteira. Não pertence a tenant nenhum. | `users.is_super_admin`          |
| **Tenant Admin** | Controle total dentro da empresa                  | papel de sistema `tenant_admin` |
| **Gestor**       | Opera os módulos contratados, gerencia equipes    | papel de sistema `manager`      |
| **Colaborador**  | Trabalho do dia a dia                             | papel de sistema `collaborator` |

Super Admin **não é papel de tenant**, de propósito. Um papel capaz de "ver
tudo" seria escalada de privilégio esperando alguém atribuí-lo por engano.

Além dos três papéis de sistema, cada tenant pode criar papéis próprios
(`roles.tenant_id` preenchido) e escolher as permissões — sem deploy.

## Permissão é dado, não código

Formato: `modulo.recurso.acao` — por exemplo `crm.leads.write`.

`permissions` é o catálogo global; `role_permissions` liga papel a permissão. A
verificação no banco é `public.has_permission(tenant_id, 'crm.leads.write')`.

## Matriz

> Gerada a partir do banco com `npm run docs:matrix`. **Não edite à mão** —
> rode o script depois de mudar o catálogo. Matriz de permissões errada na
> documentação é pior que nenhuma.
>
> Totais: `tenant_admin` = 51 · `manager` = 48 · `collaborator` = 21

### Core

| Permissão             | O que permite                 | Admin | Gestor | Colaborador |
| --------------------- | ----------------------------- | :---: | :----: | :---------: |
| `core.audit.read`     | Ver auditoria                 |  ✅   |   ✅   |      —      |
| `core.roles.read`     | Ver papéis e permissões       |  ✅   |   ✅   |      —      |
| `core.roles.write`    | Criar e editar papéis         |  ✅   |   —    |      —      |
| `core.settings.read`  | Ver configurações             |  ✅   |   ✅   |      —      |
| `core.settings.write` | Editar configurações          |  ✅   |   —    |      —      |
| `core.teams.read`     | Ver equipes                   |  ✅   |   ✅   |     ✅      |
| `core.teams.write`    | Gerenciar equipes             |  ✅   |   ✅   |      —      |
| `core.tenant.read`    | Ver dados da empresa          |  ✅   |   ✅   |     ✅      |
| `core.tenant.write`   | Editar dados da empresa       |  ✅   |   —    |      —      |
| `core.users.read`     | Ver usuários                  |  ✅   |   ✅   |     ✅      |
| `core.users.write`    | Convidar e gerenciar usuários |  ✅   |   ✅   |      —      |

### CRM

| Permissão              | O que permite                | Admin | Gestor | Colaborador |
| ---------------------- | ---------------------------- | :---: | :----: | :---------: |
| `crm.activities.read`  | Ver atividades               |  ✅   |   ✅   |     ✅      |
| `crm.activities.write` | Criar e editar atividades    |  ✅   |   ✅   |     ✅      |
| `crm.companies.delete` | Excluir empresas             |  ✅   |   ✅   |      —      |
| `crm.companies.read`   | Ver empresas                 |  ✅   |   ✅   |     ✅      |
| `crm.companies.write`  | Criar e editar empresas      |  ✅   |   ✅   |      —      |
| `crm.contacts.delete`  | Excluir contatos             |  ✅   |   ✅   |      —      |
| `crm.contacts.read`    | Ver contatos                 |  ✅   |   ✅   |     ✅      |
| `crm.contacts.write`   | Criar e editar contatos      |  ✅   |   ✅   |     ✅      |
| `crm.deals.delete`     | Excluir oportunidades        |  ✅   |   ✅   |      —      |
| `crm.deals.read`       | Ver oportunidades            |  ✅   |   ✅   |     ✅      |
| `crm.deals.write`      | Criar e editar oportunidades |  ✅   |   ✅   |     ✅      |
| `crm.leads.delete`     | Excluir leads                |  ✅   |   ✅   |      —      |
| `crm.leads.read`       | Ver leads                    |  ✅   |   ✅   |     ✅      |
| `crm.leads.write`      | Criar e editar leads         |  ✅   |   ✅   |     ✅      |

### ERP

| Permissão             | O que permite               | Admin | Gestor | Colaborador |
| --------------------- | --------------------------- | :---: | :----: | :---------: |
| `erp.customers.read`  | Ver clientes                |  ✅   |   ✅   |     ✅      |
| `erp.customers.write` | Criar e editar clientes     |  ✅   |   ✅   |     ✅      |
| `erp.products.delete` | Excluir produtos            |  ✅   |   ✅   |      —      |
| `erp.products.read`   | Ver produtos                |  ✅   |   ✅   |     ✅      |
| `erp.products.write`  | Criar e editar produtos     |  ✅   |   ✅   |      —      |
| `erp.purchases.read`  | Ver compras                 |  ✅   |   ✅   |      —      |
| `erp.purchases.write` | Registrar compras           |  ✅   |   ✅   |      —      |
| `erp.sales.read`      | Ver vendas                  |  ✅   |   ✅   |     ✅      |
| `erp.sales.write`     | Registrar vendas            |  ✅   |   ✅   |     ✅      |
| `erp.suppliers.read`  | Ver fornecedores            |  ✅   |   ✅   |      —      |
| `erp.suppliers.write` | Criar e editar fornecedores |  ✅   |   ✅   |      —      |

### Estoque

| Permissão                   | O que permite           | Admin | Gestor | Colaborador |
| --------------------------- | ----------------------- | :---: | :----: | :---------: |
| `inventory.movements.read`  | Ver movimentações       |  ✅   |   ✅   |     ✅      |
| `inventory.movements.write` | Registrar movimentações |  ✅   |   ✅   |     ✅      |
| `inventory.stock.read`      | Ver estoque             |  ✅   |   ✅   |     ✅      |

### Financeiro

| Permissão                   | O que permite              | Admin | Gestor | Colaborador |
| --------------------------- | -------------------------- | :---: | :----: | :---------: |
| `finance.cashflow.read`     | Ver fluxo de caixa         |  ✅   |   ✅   |      —      |
| `finance.payables.read`     | Ver contas a pagar         |  ✅   |   ✅   |      —      |
| `finance.payables.write`    | Gerenciar contas a pagar   |  ✅   |   ✅   |      —      |
| `finance.receivables.read`  | Ver contas a receber       |  ✅   |   ✅   |      —      |
| `finance.receivables.write` | Gerenciar contas a receber |  ✅   |   ✅   |      —      |

### Fiscal

| Permissão                | O que permite             | Admin | Gestor | Colaborador |
| ------------------------ | ------------------------- | :---: | :----: | :---------: |
| `fiscal.documents.read`  | Ver documentos fiscais    |  ✅   |   ✅   |      —      |
| `fiscal.documents.write` | Emitir documentos fiscais |  ✅   |   ✅   |      —      |

### Automações

| Permissão                | O que permite             | Admin | Gestor | Colaborador |
| ------------------------ | ------------------------- | :---: | :----: | :---------: |
| `automation.rules.read`  | Ver automações            |  ✅   |   ✅   |      —      |
| `automation.rules.write` | Criar e editar automações |  ✅   |   ✅   |      —      |

### IA

| Permissão          | O que permite     | Admin | Gestor | Colaborador |
| ------------------ | ----------------- | :---: | :----: | :---------: |
| `ai.assistant.use` | Usar o assistente |  ✅   |   ✅   |     ✅      |

### Integrações

| Permissão                        | O que permite                     | Admin | Gestor | Colaborador |
| -------------------------------- | --------------------------------- | :---: | :----: | :---------: |
| `integrations.connections.read`  | Ver integrações                   |  ✅   |   ✅   |      —      |
| `integrations.connections.write` | Conectar e configurar integrações |  ✅   |   ✅   |      —      |

## Por que o gestor não altera papéis

`core.roles.write` fica só com o administrador. Um gestor que edita papéis pode
adicionar permissões ao próprio papel e virar administrador — a permissão de
governar permissões é, na prática, a permissão de ter todas.

O mesmo vale para `core.tenant.write` e `core.settings.write`.

Um teste automatizado falha se `core.roles.write` aparecer no papel `manager`.

## Ter permissão não basta

O acesso a um módulo depende de **duas** coisas:

1. O módulo estar habilitado para o tenant (`tenant_modules.is_enabled`)
2. A pessoa ter a permissão

Um colaborador com `fiscal.documents.read` num tenant sem o módulo fiscal não
acessa nada. A verdade sobre módulo habilitado é `tenant_modules`, não o plano.

## Privilégio de coluna

RLS não restringe coluna. Uma política de `UPDATE` aprova a linha e, com ela,
qualquer coluna dentro dela.

Em `public.users`, o papel `authenticated` só pode atualizar `full_name`,
`avatar_url` e `last_seen_at`. `is_super_admin` e `email` estão fora por
privilégio de coluna, não por política — foi assim que uma escalada de
privilégio real foi fechada. Ver [[MULTI_TENANCY#O que o RLS **não** cobre]].

**Promover alguém a Super Admin é operação de backend**, com `service_role` e
auditoria. É a ação mais privilegiada da plataforma: não passa pelo cliente.

## Regras para código novo

- Toda rota protegida verifica permissão **no servidor**
- Toda tabela de negócio ganha política de escrita com `has_permission(...)`
- Permissão nova entra no catálogo em migration, com os vínculos de papel
- Depois de mudar o catálogo, rode `npm run docs:matrix` e atualize este documento
- Teste de autorização chama a API direto, sem passar pela interface
- Coluna que concede privilégio, muda cobrança ou define identidade sai do
  `GRANT UPDATE` do papel `authenticated`
