# @tivexy/core

Contratos do domínio do Tivexy Core: os códigos do catálogo, os estados e as
regras que dependem só deles.

**Não tem** acesso a banco, componente de interface, nem nada específico de uma
aplicação. É a linguagem comum entre o SQL e o TypeScript.

## O que exporta

| Módulo         | Conteúdo                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------- |
| `catalog`      | `MODULE_CODES`, `PERMISSION_CODES`, `SYSTEM_ROLE_CODES`, `PLAN_CODES`, `moduleOf()`         |
| `tenancy`      | `TENANT_STATUSES`, `MEMBERSHIP_STATUSES`, `grantsAccess()`, `isOperational()`               |
| `provisioning` | `PROVISIONING_STATUSES`, `PROVISIONING_STEPS`, `isTerminal()`, `isActive()`, `progressOf()` |

```ts
import { type PermissionCode, grantsAccess } from '@tivexy/core';
```

## O contrato com o SQL

Estes valores existem em dois lugares: aqui e nas migrations em `supabase/`.
Duplicação é dívida — esta é paga por teste.

`supabase/tests/contracts.test.mjs` sobe o banco, lê o catálogo e os enums, e
compara com as constantes daqui **nos dois sentidos**. Conferir só um lado
deixaria passar o caso mais provável: alguém adiciona a permissão na migration
e esquece do TypeScript, e a aplicação nunca consegue verificá-la.

```bash
npm run test:db      # inclui os 13 testes de contrato
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
