# @tivexy/core

Contratos do domínio do Tivexy Core: os códigos do catálogo, os estados e as
regras que dependem só deles.

**Não tem** acesso a banco, componente de interface, nem nada específico de uma
aplicação. É a linguagem comum entre o SQL e o TypeScript.

## O que exporta

| Módulo              | Conteúdo                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `catalog`           | `MODULE_CODES`, `PERMISSION_CODES`, `SYSTEM_ROLE_CODES`, `PLAN_CODES`, `TERM_KEYS`          |
| `tenancy`           | `TENANT_STATUSES`, `MEMBERSHIP_STATUSES`, `grantsAccess()`, `isOperational()`               |
| `access`            | `decideAccess()`, `matchRule()`, `redirectFor()`, `parseViewer()`, `can()`                  |
| `provisioning`      | `PROVISIONING_STATUSES`, `PROVISIONING_STEPS`, `isTerminal()`, `isActive()`, `progressOf()` |
| `provisioning-plan` | `planProvisioning()`, `previewOf()`                                                         |
| `blueprint`         | `checkBlueprint()`, `termFor()`, `enables()`                                                |
| `settings`          | `TENANT_SETTINGS`, `resolveSettings()`, `checkSettingValue()`                               |
| `tenant-host`       | `tenantSlugFromHost()`, `RESERVED_SUBDOMAINS`, `isReservedSubdomain()`                      |

```ts
import { type PermissionCode, grantsAccess } from '@tivexy/core';
```

### Os três agrupamentos

**O catálogo e os estados** (`catalog`, `tenancy`, `provisioning`) espelham o
SQL. São a linguagem comum, e divergir deles é o que o teste de contratos pega.

**As decisões** (`access`, `provisioning-plan`, `tenant-host`) são regras puras
que a aplicação precisa aplicar **antes** de falar com o banco: quem pode abrir
esta rota, o que acontece ao criar este cliente, de qual tenant é esta
requisição. Todas espelham uma garantia que o banco também tem — o RLS, uma
constraint, um índice. A duplicação é deliberada, e cada uma é conferida contra
o seu par em SQL.

**A configuração de nicho** (`blueprint`, `settings`) é o que muda de uma
clínica para uma cafeteria sem mudar código. Ver
[`blueprints/README.md`](blueprints/README.md) e o ADR-003.

## O contrato com o SQL

Estes valores existem em dois lugares: aqui e nas migrations em `supabase/`.
Duplicação é dívida — esta é paga por teste.

`supabase/tests/contracts.test.mjs` sobe o banco, lê o catálogo e os enums, e
compara com as constantes daqui **nos dois sentidos**. Conferir só um lado
deixaria passar o caso mais provável: alguém adiciona a permissão na migration
e esquece do TypeScript, e a aplicação nunca consegue verificá-la.

Não são só os códigos. As **regras** duplicadas também são conferidas contra o
que o Postgres de fato tem:

| Daqui           | Contra o quê                                    | Se divergir                                       |
| --------------- | ----------------------------------------------- | ------------------------------------------------- |
| `isActive()`    | predicado do índice `..._one_active_per_tenant` | a aplicação libera, o banco recusa por unicidade  |
| `isTerminal()`  | constraint `..._finished_consistency`           | grava data de fim onde não pode, e o banco recusa |
| formato do slug | constraint `tenants_slug_format`                | violação de constraint com o tenant já criado     |

A do slug é de forma diferente, e vale entender por quê: a propriedade **não** é
"os dois aceitam as mesmas entradas", porque daqui o slug é normalizado antes de
gravar. O que precisa valer é mais fraco e mais útil — _nunca produzir um slug
que o banco recusaria_. Ser mais rígido que o banco é aceitável; ser mais frouxo
é o que quebra no meio de um provisionamento.

```bash
npm run test:db      # inclui os 16 testes de contrato
npm run check:core   # tipos
```

**Ao mudar o catálogo:** a migration e este package entram no mesmo commit.
Depois, `npm run docs:matrix` para atualizar a matriz de permissões.

## Por que TypeScript puro, sem build

O package expõe `src/index.ts` diretamente — sem `dist/`, sem etapa de build.

- O Node 24 executa `.ts` nativamente, então os testes importam a fonte
- O Next transpila via `transpilePackages: ['@tivexy/core']`

O custo: os imports internos levam a extensão `.ts` (o Node exige o caminho
completo), o que obriga `allowImportingTsExtensions` em quem consome. É um
ajuste de uma linha, e evita um passo de build para um package que é só
constantes e funções puras.
