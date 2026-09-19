# PROJECT STATE

> Estado real do ecossistema Tivexy. **Atualize junto com a entrega, não depois.**
>
> Última atualização: **19/09/2026**

## Legenda

| Estado                 | Significa                                   |
| ---------------------- | ------------------------------------------- |
| ✅ **FUNCIONA**        | Verificado por execução, não por leitura    |
| 🟡 **PARCIAL**         | Existe, mas não atende a Definition of Done |
| 🔴 **QUEBRADO**        | Existe e não funciona                       |
| ⬜ **NÃO EXISTE**      | Ainda não foi construído                    |
| 🔒 **EXTERNO**         | Bloqueado por conta, credencial ou terceiro |
| ❓ **PRECISA DECISÃO** | Bloqueado por decisão de produto            |

## 1. O que existe e funciona

| Item                       | Estado | Verificação                                                     |
| -------------------------- | ------ | --------------------------------------------------------------- |
| Landing page (`apps/site`) | ✅     | `npm run validate:site` — 0 erros de tipo, 0 de lint, 7 páginas |
| Imagem Open Graph          | ✅     | PNG 1200×630 gerado no build                                    |
| Sitemap + robots.txt       | ✅     | Gerados no build                                                |
| Design system da landing   | ✅     | `apps/site/src/styles/tokens.css`                               |
| Identidade de marca        | ✅     | 4 SVGs oficiais em `apps/site/src/assets/brand/`                |
| Monorepo (npm workspaces)  | ✅     | `npm install` + build dos dois apps na nova estrutura           |
| Casca do SaaS (`apps/web`) | ✅     | `npm run validate:web` — 0 erros; conferido no navegador        |
| Esquema do Core            | 🟡     | `npm run test:db` — 40 testes em Postgres 18; **não aplicado**  |
| Knowledge base (`docs/`)   | ✅     | Cofre Obsidian versionado                                       |
| Trello estruturado         | ✅     | Listas, labels por módulo e backlog inicial                     |

## 2. Estado por módulo

### Landing — `apps/site`

**Estado:** ✅ FUNCIONA · **Docs:** `apps/site/README.md` · **Trello:** label `SITE`

Pendências: configurar `PUBLIC_SITE_URL` e o destino do formulário de contato
(hoje o build avisa e os leads não têm para onde ir) — 🔒 EXTERNO.

### Tivexy Core — esquema do banco

**Estado:** 🟡 PARCIAL · **Docs:** [[02-ARCHITECTURE/DATABASE]] · [[12-SECURITY/MULTI_TENANCY]] · **Trello:** `CORE`

15 tabelas em `supabase/migrations/`: tenancy (planos, módulos, tenants),
identidade e RBAC (usuários, papéis, permissões, vínculos, equipes), auditoria e
provisionamento. Mais RLS em todas elas e o catálogo da plataforma
(9 módulos, 51 permissões, 3 papéis de sistema, 3 planos).

**Verificado por execução** — `npm run test:db`, 40 testes contra Postgres 18:

- Isolamento entre tenants nas quatro operações (ler, inserir, atualizar, excluir)
- Nenhuma tabela sem RLS; nenhuma tabela sem política; `search_path` fixo em
  toda função `SECURITY DEFINER`
- Auditoria append-only; convite pendente sem acesso; `has_permission` por papel
- Provisionamento ponta a ponta: idempotência, falha no meio, retomada sem
  repetir etapa concluída, dados de compensação

**Não verificado:** `auth.uid()` real vindo de JWT e comportamento sob
concorrência. Os testes rodam em PGlite (Postgres em WASM) com `auth.uid()`
simulado por configuração de sessão — fiel ao contrato, não ao transporte.

**Bloqueado:** aplicar as migrations depende do projeto Supabase 🔒.

### Tivexy Core — camada de aplicação (`packages/core`)

**Estado:** ⬜ NÃO EXISTE · **Docs:** [[ARCHITECTURE#3. Tivexy Core]] · **Trello:** `CORE`

Serviços, contratos e regras sobre o esquema acima. Feature Flags, Themes e
Notifications ainda não têm nem tabela.

### Provisionamento — **prioridade zero**

**Estado:** ⬜ NÃO EXISTE · **Docs:** [[ARCHITECTURE#4. Provisionamento — prioridade zero]] · **Trello:** `ADMIN`

É o que transforma a plataforma em SaaS de verdade. Vem antes de qualquer módulo
de negócio. Depende de: banco 🔒, auth, multi-tenancy.

### Aplicação SaaS — `apps/web`

**Estado:** 🟡 PARCIAL — casca pronta · **Docs:** `apps/web/README.md` · **Trello:** `CORE`

Next.js 16 (App Router, Turbopack), React 19, TypeScript estrito, Tailwind v4.

**Pronto e verificado por execução** (`npm run validate:web`: typecheck, lint e
build sem erro; conferido no navegador em claro, escuro e 375px):

- Design system da marca, com camada semântica e tema claro/escuro
- Casca: cabeçalho, navegação lateral, gaveta mobile com `aria-modal`, foco e
  trava de scroll
- Troca de tema em três estados, persistida, sem piscar na primeira pintura
- Primitivos: botão, card, badge, campo
- `/painel` com o estado real da plataforma — **não é dashboard de produto**,
  não há dado de negócio

**Não existe ainda:** autenticação, banco, rotas `(auth)` e `(admin)`, e qualquer
módulo de negócio. A navegação declara essas rotas como `pending`/`blocked` e as
renderiza desabilitadas, de propósito — a estrutura aparece sem prometer tela
que não há.

### Admin / Super Admin

**Estado:** ⬜ NÃO EXISTE · **Trello:** `ADMIN` · **Depende de:** Core, Auth, RBAC

### CRM

**Estado:** ⬜ NÃO EXISTE · **Trello:** `CRM` · **Depende de:** Core, Auth, RBAC, provisionamento

### ERP

**Estado:** ⬜ NÃO EXISTE · **Trello:** `ERP` · **Depende de:** Core, Auth, RBAC, provisionamento

### Blueprint Engine

**Estado:** ⬜ NÃO EXISTE · **Trello:** `BLUEPRINT`

Bloqueado **por decisão de ordem**, não por falta de recurso: só depois de Core +
provisionamento + um módulo real funcionando. Ver [[16-DECISIONS/ADR-002-ordem-de-construcao]].

### AI Engine

**Estado:** ⬜ NÃO EXISTE · 🔒 credenciais OpenAI · **Trello:** `AI`

### Automation Engine

**Estado:** ⬜ NÃO EXISTE · **Trello:** `AUTOMATION`

### Integrações — WhatsApp / Meta

**Estado:** ⬜ NÃO EXISTE · 🔒 Meta Business + WhatsApp Business API · **Trello:** `META`

Adapter pode ser construído com mock **rotulado** antes das credenciais. A conexão
real, não.

### Fiscal

**Estado:** ⬜ NÃO EXISTE · 🔒 provedor fiscal + certificado digital · **Trello:** `FISCAL`

⚠️ Nunca apresentar emissão simulada como nota fiscal real.

### Financeiro / Estoque

**Estado:** ⬜ NÃO EXISTE · **Trello:** `FINANCE` · **Depende de:** ERP

## 3. O que está quebrado

Nada, no momento.

Corrigido nesta sessão:

- `sharp` usado sem ser declarado no `package.json` — funcionava por acidente
- `og.png.ts` montava caminho de fonte à mão, incompatível com o içamento do monorepo

## 4. O que está em desenvolvimento

Nada em andamento. A modelagem do banco foi concluída e testada; o próximo passo
— autenticação — depende do projeto Supabase existir (🔒 externo).

Enquanto isso, o que dá para avançar sem credencial: extrair `packages/core` com
os contratos do esquema, e escrever a especificação do fluxo de provisionamento
em `docs/06-ADMIN/PROVISIONING.md`.

## 5. Decisões tomadas

| #       | Decisão                                                                  | Data       |
| ------- | ------------------------------------------------------------------------ | ---------- |
| ADR-001 | Monorepo no repositório existente, não em `TivexyCortex/`                | 18/09/2026 |
| ADR-002 | Ordem de construção: Core e provisionamento antes de módulos e Blueprint | 18/09/2026 |
| —       | Cofre Obsidian versionado em `docs/`                                     | 18/09/2026 |
| —       | SaaS em Next.js, conforme Master Plan §4 — não em Astro                  | 18/09/2026 |

## 6. Dependências externas — 🔒 BLOCKED — EXTERNAL

Ordenadas por urgência:

| #   | Tarefa                                          | Bloqueia                | Urgência    |
| --- | ----------------------------------------------- | ----------------------- | ----------- |
| 1   | **`git push` da branch `monorepo-tivexy-core`** | Tudo sair desta máquina | 🔴 Imediata |
| 2   | Criar projeto Supabase da Tivexy                | Todo o SaaS             | 🔴 Alta     |
| 3   | Conferir o destino do formulário de contato     | Leads da landing        | 🟠 Alta     |
| 4   | Conta/organização Vercel própria da Tivexy      | Deploy do SaaS          | 🟠 Média    |
| 5   | Domínio `tivexy.com.br` + DNS                   | SEO, e-mail             | 🟠 Média    |
| 6   | E-mail corporativo + SPF/DKIM/DMARC             | Convites do SaaS        | 🟠 Média    |
| 7   | Credenciais OpenAI                              | AI Engine               | 🟡 Depois   |
| 8   | Meta Business + WhatsApp Business API           | Atendimento             | 🟡 Depois   |
| 9   | Provedor fiscal + certificado digital           | Fiscal                  | 🟡 Depois   |
| 10  | CNPJ, contador, conta PJ, contratos             | Venda formal            | 🟡 Paralelo |

**Resolvido em 19/09/2026:** Root Directory da landing na Vercel → `apps/site`,
verificado por deploy de preview real (build READY, home servida corretamente).

**Correção da auditoria:** `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`,
`PUBLIC_CONTACT_EMAIL` e `PUBLIC_LEADS_ENDPOINT` **já estão cadastradas** em
produção e preview na Vercel. A auditoria as deu como ausentes porque o aviso do
build era local — falta o `.env` na máquina, não a variável no ambiente. O que
resta é conferir se o destino do formulário ainda responde.

**Observado, não alterado:** o projeto tem variáveis que parecem sobra de outro
app (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`,
`STORE_TIMEZONE`, `SESSION_TTL_DAYS`). A landing em Astro não usa nenhuma.
Apagar segredo sem contexto é irreversível — vale revisar.

## 7. Riscos ativos

| #   | Risco                                          | Impacto                      |
| --- | ---------------------------------------------- | ---------------------------- |
| 1   | Trabalho existir só nesta máquina, sem push    | 🔴 Alto, imediato            |
| 2   | Construir ERP/CRM antes de um Core confiável   | 🔴 Alto                      |
| 3   | Blueprint Engine virar abstração prematura     | 🔴 Alto                      |
| 4   | Duplicar auth/permissões dentro dos módulos    | 🟠 Alto                      |
| 5   | Mock apresentado como funcionalidade real      | 🔴 Crítico (legal/comercial) |
| 6   | Código, docs, Trello e este arquivo divergirem | 🟡 Médio                     |

Detalhe em [[PROJECT_AUDIT#17. Riscos]].

## 8. Próximo passo

1. 🔒 **`git push` da branch `monorepo-tivexy-core`** — o push trava aqui porque
   o Git Credential Manager pede autenticação em janela. É o único risco real
   em aberto: sem isso o trabalho existe só nesta máquina.
2. 🔒 Criar o projeto Supabase
3. ✅ ~~Root Directory na Vercel~~ — corrigido e verificado em 19/09/2026
4. ✅ ~~Scaffold de `apps/web`~~ — concluído em 18/09/2026
5. ✅ ~~Modelagem do banco~~ — migrations escritas e testadas em 18/09/2026;
   aplicar depende do item 2
6. Auth + multi-tenancy com RLS — RLS já escrito e testado; falta a autenticação
7. Provisionamento ponta a ponta + teste E2E — esquema pronto e provado; falta
   a implementação na aplicação
