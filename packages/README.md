# packages/

Código compartilhado **de verdade** entre as aplicações do monorepo.

## Está vazio de propósito

Hoje só existe uma aplicação (`apps/site`). Não há nada para compartilhar,
e package sem consumidor é abstração adivinhada.

Os candidatos já identificados na auditoria — design tokens, breakpoints,
configuração de marca — só migram para cá quando `apps/web` existir e
precisar deles de fato.

## Packages previstos

| Package  | Responsabilidade                                                | Quando                         |
| -------- | --------------------------------------------------------------- | ------------------------------ |
| `core`   | Domínio, regras de negócio, serviços e contratos do Tivexy Core | Com o Core                     |
| `types`  | Tipos e contratos compartilhados                                | Com o Core                     |
| `ui`     | Componentes compartilhados                                      | Com o segundo consumidor React |
| `config` | Configuração compartilhada (tokens, lint, tsconfig)             | Com o segundo consumidor       |

## Antes de criar um package

Responda: isso é Core, módulo, package, aplicação, integração ou serviço externo?

Package só quando houver **consumo real por mais de um lugar**. Nunca para
"deixar organizado".

## Regra de dependência

```
apps/*  →  packages/*
```

Nunca `packages/* → apps/*`. Nunca `app → app`. Sem ciclos.

Detalhe em [`../docs/REPOSITORY_STRUCTURE.md`](../docs/REPOSITORY_STRUCTURE.md).
