# Estrutura do repositório

> O que cada diretório é, e o que não é.

## O princípio

**Repositório ≠ Aplicação ≠ Módulo ≠ Package.**

Um repositório só. Vários projetos dentro dele, com fronteiras reais.
Estar no mesmo repositório não significa ser o mesmo projeto.

| Conceito        | O que é                               | Exemplos                       |
| --------------- | ------------------------------------- | ------------------------------ |
| **Repositório** | O ecossistema inteiro                 | `TivexyWebSite`                |
| **Aplicação**   | Algo que builda e publica sozinho     | `apps/site`, `apps/web`        |
| **Módulo**      | Produto dentro de uma aplicação       | ERP, CRM, Admin, Blueprint     |
| **Package**     | Código consumido por mais de um lugar | `packages/core`, `packages/ui` |

## Árvore

```
TivexyWebSite/
│
├── apps/
│   ├── site/              Landing page pública
│   └── web/               SaaS autenticado (Tivexy Core)
│
├── packages/              Compartilhado de verdade
│
├── docs/                  Knowledge base + cofre Obsidian
│
├── .claude/               Configuração do Claude Code
├── .vscode/
├── CLAUDE.md              Regras permanentes (lidas pelo agente)
├── AGENTS.md              Cópia de CLAUDE.md para outros agentes
├── package.json           Raiz dos npm workspaces
└── package-lock.json      Lockfile único do monorepo
```

## `apps/site` — Landing page

Produto **público**. Astro 7, saída estática, sem framework de UI no navegador.

- Build e deploy **próprios**. Não faz parte do build do SaaS.
- Não consome nada de `apps/web`.
- Conteúdo em `src/data/`, apresentação em `src/components/`.
- Documentação própria: `apps/site/README.md`.

O que **não** vai aqui: qualquer coisa autenticada, qualquer regra de negócio de tenant.

## `apps/web` — Tivexy Core (SaaS)

Produto **autenticado**. Next.js + TypeScript + Tailwind + shadcn/ui.

Estrutura interna prevista:

```
apps/web/
├── auth
├── onboarding
├── admin        Super Admin da plataforma
├── erp          Módulo
├── crm          Módulo
├── settings
└── ...
```

ERP, CRM e Admin são **módulos**, não aplicações. Não existe `apps/erp`,
`apps/crm`, `apps/erp-cafeteria`. Nicho é configuração (Blueprint), não código novo.

## `packages/` — Compartilhado

Um package só nasce quando há **consumo real por mais de um lugar**.
Não se cria package para deixar bonito.

| Package           | Responsabilidade                                                 |
| ----------------- | ---------------------------------------------------------------- |
| `packages/core`   | Domínio, regras de negócio, serviços e contratos do Tivexy Core  |
| `packages/ui`     | Componentes compartilhados                                       |
| `packages/types`  | Tipos e contratos compartilhados                                 |
| `packages/config` | Configuração compartilhada (tokens, breakpoints, lint, tsconfig) |

Direção de dependência permitida:

```
apps/*  →  packages/*
```

Nunca `packages/* → apps/*`. Nunca `app → app`. Sem ciclos.

**Estado hoje:** `packages/` está vazio. Os candidatos (design tokens, breakpoints,
configuração de marca) só migram quando `apps/web` existir e precisar deles de fato.
Extrair antes disso é adivinhação.

## `docs/` — Knowledge base

É também o **cofre Obsidian**. Abrir no Obsidian apontando o cofre para `docs/`.

Versionado em git: documentação e código evoluem no mesmo commit.
Só o estado local de janelas do Obsidian fica fora (ver `.gitignore`).

```
docs/
├── README.md                  Índice
├── PROJECT_AUDIT.md           Auditoria inicial
├── PROJECT_STATE.md           Estado atual de cada módulo
├── ARCHITECTURE.md            Arquitetura do ecossistema
├── REPOSITORY_STRUCTURE.md    Este documento
│
├── 00-SYSTEM/         Como o projeto é operado
├── 01-PRODUCT/        Visão, posicionamento, pricing
├── 02-ARCHITECTURE/   Decisões técnicas detalhadas, ERD, diagramas
├── 03-CORE/           Identity, auth, tenants, RBAC, planos, módulos
├── 04-CRM/
├── 05-ERP/
├── 06-ADMIN/          Super Admin e provisionamento
├── 07-BLUEPRINTS/     Niche Blueprint Engine
├── 08-AI/
├── 09-AUTOMATIONS/
├── 10-INTEGRATIONS/   Meta, WhatsApp, banking, adapters
├── 11-FISCAL/
├── 12-SECURITY/       Multi-tenancy, autorização, OWASP, auditoria
├── 13-UX/             Design system, padrões de interface
├── 14-NICHES/         Nichos-alvo e o que cada um exige
├── 15-OPERATIONS/     Onboarding, suporte, implantação
├── 16-DECISIONS/      ADRs — uma decisão por arquivo
├── 17-MEETINGS/
├── 18-RELEASES/
└── 99-ARCHIVE/
```

## Build e deploy independentes

Cada aplicação publica sozinha:

| App         | Comando (da raiz)    | Destino         |
| ----------- | -------------------- | --------------- |
| `apps/site` | `npm run build:site` | Domínio público |
| `apps/web`  | `npm run build:web`  | Aplicação SaaS  |

Na Vercel, **um projeto por app**, cada um com seu Root Directory
(`apps/site` e `apps/web`).

O projeto da landing na Vercel já aponta para `apps/site` (19/09/2026),
verificado por um deploy de preview: o build conclui com npm workspaces e a home
é servida corretamente. O deploy de **produção** só acontece quando a branch
`monorepo-tivexy-core` for mergeada na `main`.

## Antes de criar um diretório novo

Responda, nesta ordem:

1. Isso é **Core**? → `packages/core`
2. É **módulo** de um produto existente? → dentro de `apps/web`
3. É **compartilhado de verdade** por mais de um consumidor? → `packages/`
4. É uma **aplicação** que builda e publica sozinha, com ciclo de vida próprio? → `apps/`
5. É **integração** com terceiro? → adapter dentro do Core, não app nova
6. É **serviço externo**? → não é código deste repositório; é tarefa externa

Aplicação nova só com justificativa arquitetural escrita em `docs/16-DECISIONS/`.
