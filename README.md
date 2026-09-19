# Tivexy — Monorepo

Repositório oficial do ecossistema Tivexy: landing page pública, plataforma SaaS
(Tivexy Core), packages compartilhados e knowledge base.

Um repositório. Vários projetos, com fronteiras reais.

## Projetos

| Projeto                            | O que é                         | Stack                             | Estado            |
| ---------------------------------- | ------------------------------- | --------------------------------- | ----------------- |
| [`apps/site`](apps/site/README.md) | Landing page pública            | Astro 7, estático                 | ✅ Em produção    |
| [`apps/web`](apps/web/README.md)   | SaaS autenticado (Tivexy Core)  | Next.js 16, React 19, Tailwind v4 | 🟡 Casca pronta   |
| `packages/*`                       | Código compartilhado de verdade | TypeScript                        | ⬜ Vazio, por ora |
| [`docs/`](docs/README.md)          | Knowledge base (cofre Obsidian) | Markdown                          | ✅                |

## Começando

```bash
npm install
```

Instala todos os workspaces de uma vez. Node >= 22.12.0.

## Comandos

Todos a partir da raiz:

| Comando                 | O que faz                                    |
| ----------------------- | -------------------------------------------- |
| `npm run dev:site`      | Servidor de desenvolvimento da landing       |
| `npm run build:site`    | Build da landing em `apps/site/dist/`        |
| `npm run preview:site`  | Serve o build da landing                     |
| `npm run validate:site` | Tipos + lint + build da landing              |
| `npm run icons:site`    | Regera favicon, ícones e manifest da landing |
| `npm run dev:web`       | Servidor de desenvolvimento do SaaS          |
| `npm run build:web`     | Build do SaaS                                |
| `npm run validate:web`  | Tipos + lint + build do SaaS                 |
| `npm run validate`      | Valida os dois aplicativos                   |
| `npm run format`        | Prettier em todo o monorepo                  |

Dentro de um app, os scripts locais continuam valendo (`cd apps/site && npm run dev`).

## Deploy

Cada aplicação publica sozinha. Na Vercel, **um projeto por app**:

| App         | Root Directory | Build           | Output           |
| ----------- | -------------- | --------------- | ---------------- |
| `apps/site` | `apps/site`    | `npm run build` | `dist`           |
| `apps/web`  | `apps/web`     | `npm run build` | (padrão Next.js) |

O Root Directory do projeto da landing já está em `apps/site`, verificado por um
deploy de preview real: o build conclui e a home é servida corretamente.

## Documentação

| Documento                                                      | Responde                      |
| -------------------------------------------------------------- | ----------------------------- |
| [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md)               | Estado atual de cada módulo   |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                 | Como as peças se encaixam     |
| [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md) | O que cada diretório é        |
| [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md)               | Auditoria inicial             |
| [`CLAUDE.md`](CLAUDE.md)                                       | Regras permanentes do projeto |

Execução: [Trello](https://trello.com/b/Ko89xdqb/tivexy).

## Regras que não se negociam

- **Fronteira:** landing e SaaS são projetos separados. Nenhum depende do outro.
- **Core:** regra que pertence ao Core fica no Core. ERP e CRM não duplicam auth,
  tenants, usuários, permissões ou notificações.
- **Módulo não é aplicação:** ERP, CRM e Admin vivem dentro de `apps/web`.
- **Nada falso:** emissão fiscal, integração, webhook ou pagamento simulado nunca
  é apresentado como real. Mock existe, mas rotulado.
- **Tela não é entrega:** pronto exige UI, backend, banco, autorização, validação,
  erro, loading, empty state, responsividade, teste e documentação.

Detalhe em [`CLAUDE.md`](CLAUDE.md).
