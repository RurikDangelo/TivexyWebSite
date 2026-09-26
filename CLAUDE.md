# TIVEXY — Regras permanentes do repositório

Este repositório é o **monorepo oficial do ecossistema Tivexy**, não "o repositório do site".
Um repositório, múltiplos projetos com fronteiras claras.

## Estrutura

```
apps/site      Landing page pública (Astro 7, estática)   — EM PRODUÇÃO
apps/web       Plataforma SaaS autenticada (Tivexy Core)  — A CONSTRUIR
packages/*     Código realmente compartilhado entre apps
docs/          Knowledge base (também é o cofre Obsidian)
```

Leia `docs/REPOSITORY_STRUCTURE.md` antes de criar qualquer diretório novo e
`docs/ARCHITECTURE.md` antes de criar qualquer módulo novo.

## Regras de fronteira

- `apps/site` e `apps/web` são **projetos separados** com build e deploy independentes.
  Nunca faça a landing depender do SaaS, nem o SaaS depender da landing.
- ERP, CRM e Admin **não são aplicações**. São módulos dentro de `apps/web`, sobre o Tivexy Core.
- Regra que pertence ao Core fica no Core. Não duplique auth, tenants, usuários,
  permissões, notificações, automações ou integrações dentro de ERP/CRM.
- Direção de dependência permitida: `apps/* → packages/*`. Nunca o contrário,
  e nunca `app → app`.
- Antes de criar um `packages/novo`, responda: isso é Core, módulo, package,
  aplicação, integração ou serviço externo? Package só quando houver
  compartilhamento real — não para "deixar organizado".

## Regra absoluta — não fingir funcionalidade

Não apresente como real: emissão fiscal, integração com Meta/WhatsApp, webhook,
pagamento, boleto, certificado digital ou dado de produção que não exista de fato.

Mocks podem existir durante o desenvolvimento, desde que rotulados no código e na UI
como `MOCK`, `DEMO`, `STUB` ou `PLACEHOLDER`.

Uma tela existir não significa que a funcionalidade está pronta. Só está pronta com:
UI → backend → banco → autorização → validação → erro → loading → empty state →
responsividade → teste → documentação.

## Comandos

Tudo roda a partir da raiz do monorepo (npm workspaces):

```bash
npm install              # instala todos os workspaces
npm run dev:site         # servidor de desenvolvimento da landing
npm run validate:site    # tipos + lint + build da landing
npm run format           # Prettier em todo o monorepo
```

Dentro de um app específico, use os scripts locais (`npm run dev` em `apps/site`).

Ao iniciar o servidor de desenvolvimento, use modo background.

## Estado, execução e conhecimento

Estes quatro não podem divergir:

| Fonte                   | Responde                             |
| ----------------------- | ------------------------------------ |
| Código                  | O que foi implementado               |
| `docs/` (Obsidian)      | O que precisamos saber               |
| Trello                  | O que precisa ser feito              |
| `docs/PROJECT_STATE.md` | Qual é o estado atual de cada módulo |

Trello do projeto: https://trello.com/b/Ko89xdqb/tivexy

Ao concluir um trabalho relevante, atualize `docs/PROJECT_STATE.md` e o card correspondente.

## Tarefas internas vs externas

Separe sempre. **Externa** é tudo que depende de conta, credencial, aprovação ou
serviço de terceiro (Meta, Vercel, Supabase, domínio, DNS, certificado digital,
provedor fiscal, banco). Não invente uma implementação falsa para contornar uma
tarefa externa — marque como `BLOCKED — EXTERNAL` e siga para o que é possível.

## Stack oficial

| Camada     | Padrão                                                      |
| ---------- | ----------------------------------------------------------- |
| Landing    | Astro 7 estático, TypeScript estrito, CSS com design tokens |
| SaaS       | Next.js + TypeScript + Tailwind + shadcn/ui                 |
| Banco/Auth | Supabase + PostgreSQL, isolamento por RLS                   |
| Deploy     | Vercel (projetos separados por app)                         |
| IA         | OpenAI API                                                  |

Não substitua tecnologia existente sem justificativa escrita em `docs/16-DECISIONS/`.

## Documentação

Documentação completa do Astro: https://docs.astro.build

Consulte estes guias antes de trabalhar nos temas relacionados:

- [Páginas, rotas dinâmicas e middleware](https://docs.astro.build/en/guides/routing/)
- [Componentes Astro](https://docs.astro.build/en/basics/astro-components/)
- [Componentes React, Vue, Svelte e outros frameworks](https://docs.astro.build/en/guides/framework-components/)
- [Conteúdo e content collections](https://docs.astro.build/en/guides/content-collections/)
- [Estilos e Tailwind](https://docs.astro.build/en/guides/styling/)
- [Internacionalização](https://docs.astro.build/en/guides/internationalization/)
