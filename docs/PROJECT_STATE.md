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

| Item                         | Estado | Verificação                                                        |
| ---------------------------- | ------ | ------------------------------------------------------------------ |
| Landing page (`apps/site`)   | ✅     | `npm run validate:site` — 0 erros de tipo, 0 de lint, 7 páginas    |
| Imagem Open Graph            | ✅     | PNG 1200×630 gerado no build                                       |
| Sitemap + robots.txt         | ✅     | Gerados no build                                                   |
| Design system da landing     | ✅     | `apps/site/src/styles/tokens.css`                                  |
| Identidade de marca          | ✅     | 4 SVGs oficiais em `apps/site/src/assets/brand/`                   |
| Monorepo (npm workspaces)    | ✅     | `npm install` + build dos dois apps na nova estrutura              |
| Casca do SaaS (`apps/web`)   | ✅     | `npm run validate:web` — 0 erros; conferido no navegador           |
| Esquema do Core              | 🟡     | `npm run test:db` — 101 testes em Postgres 18; **não aplicado**    |
| Knowledge base (`docs/`)     | ✅     | Cofre Obsidian versionado                                          |
| Trello estruturado           | ✅     | Listas, labels por módulo e backlog inicial                        |
| Contratos (`packages/core`)  | ✅     | `npm run validate` — 157 testes; contratos conferidos contra o SQL |
| CI (GitHub Actions)          | 🟡     | Push feito; execução não conferida — `gh` sem autenticação aqui    |
| Formatação e finais de linha | ✅     | `.gitattributes` + Prettier limpo; build idêntico comprovado       |

## 2. Estado por módulo

### Landing — `apps/site`

**Estado:** ✅ FUNCIONA · **Docs:** `apps/site/README.md` · **Trello:** label `SITE`

Deploy na Vercel apontando para `apps/site`, verificado em preview real.

Pendência: conferir se o destino do formulário de contato ainda responde. As
variáveis já estão cadastradas em produção; o aviso do build é local, por falta
de `.env` na máquina.

### Tivexy Core — esquema do banco

**Estado:** 🟡 PARCIAL · **Docs:** [[02-ARCHITECTURE/DATABASE]] · [[12-SECURITY/MULTI_TENANCY]] · **Trello:** `CORE`

15 tabelas em `supabase/migrations/`: tenancy (planos, módulos, tenants),
identidade e RBAC (usuários, papéis, permissões, vínculos, equipes), auditoria e
provisionamento. Mais RLS em todas elas e o catálogo da plataforma
(9 módulos, 51 permissões, 3 papéis de sistema, 3 planos).

**Verificado por execução** — `npm run test:db`, 101 testes contra Postgres 18:

- Isolamento entre tenants nas quatro operações (ler, inserir, atualizar, excluir)
- Nenhuma tabela sem RLS; nenhuma tabela sem política; `search_path` fixo em
  toda função `SECURITY DEFINER`
- Auditoria append-only; convite pendente sem acesso; `has_permission` por papel
- `current_viewer()`: o contexto de acesso da requisição, com teste de vazamento
  em cada corte — estranho não descobre nem que o tenant existe
- Provisionamento ponta a ponta: idempotência, falha no meio, retomada sem
  repetir etapa concluída
- Compensação: desfaz na ordem inversa, preserva o histórico da falha, cancela
  o tenant em vez de apagá-lo, e não deixa execução nova entrar durante o
  desfazer

**Não verificado:** `auth.uid()` real vindo de JWT e comportamento sob
concorrência. Os testes rodam em PGlite (Postgres em WASM) com `auth.uid()`
simulado por configuração de sessão — fiel ao contrato, não ao transporte.

**Bloqueado:** o projeto `tivexy-core` existe; aplicar as migrations nele
depende de autorizar o conector ou rodar `npm run db:push` com o CLI 🔒.

### Tivexy Core — camada de aplicação (`packages/core`)

**Estado:** 🟡 PARCIAL · **Docs:** `packages/core/README.md` · **Trello:** `CORE`

Existe e é consumido por `apps/web`:

- Contratos do catálogo (módulos, permissões, papéis, planos) e os estados de
  tenant, vínculo e provisionamento, tipados
- `decideAccess()`, `matchRule()` e `parseViewer()`: a decisão de acesso da
  aplicação, espelhando as regras do RLS — 37 testes, incluindo a ordem em que
  nega, o padrão fechado e o contexto malformado virando menos acesso
- 13 testes conferem os contratos contra o catálogo SQL nos dois sentidos: a
  duplicação entre TypeScript e banco não passa despercebida

**Não existe:** serviços de domínio, Feature Flags, Themes e Notifications —
estes três ainda não têm nem tabela.

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
- Estados de 404, erro e carregamento (esqueleto, não spinner)
- Mapa de regras por rota em `src/config/routes.ts`, **fechado por padrão**, com
  teste que cruza navegação e rotas

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

Corrigido em 18–19/09/2026:

- `sharp` usado sem ser declarado no `package.json` — funcionava por acidente
- `og.png.ts` montava caminho de fonte à mão, incompatível com o içamento do monorepo

**Corrigido em revisão adversarial do próprio esquema**, depois de a primeira
rodada de testes ter passado. Todas introduzidas nas migrations desta noite:

| #   | Falha                                                                                                                                       | Gravidade  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Escalada de privilégio:** qualquer pessoa autenticada podia escrever `is_super_admin = true` na própria linha e enxergar todos os tenants | 🔴 Crítica |
| 2   | Vínculo podia apontar para papel de **outro** tenant, aplicando as permissões dele no tenant errado                                         | 🟠 Alta    |
| 3   | Equipe podia receber membro de **outro** tenant                                                                                             | 🟠 Alta    |
| 4   | `userId: ''` contava como autenticado                                                                                                       | 🟡 Média   |
| 5   | `/ADMIN` caía no padrão `member` em vez de `superAdmin`                                                                                     | 🟡 Média   |

A causa comum das três primeiras: **RLS decide quais linhas alguém enxerga, não
quais colunas foram escritas nem se os valores da linha fazem sentido juntos.**
Documentado em [[12-SECURITY/MULTI_TENANCY#O que o RLS **não** cobre]].

Um defeito no harness contribuía: os `GRANT`s eram aplicados **depois** das
migrations, o que desfaria qualquer revogação de privilégio feita em migration —
o teste de escalada teria passado por engano.

## 4. O que está em desenvolvimento

Nada em andamento. O que dava para avançar sem credencial foi entregue:
`packages/core` com os contratos e a decisão de acesso, o CI, e o CLI do
Supabase configurado no monorepo (`npm run db:link` / `db:push` / `db:types`).
A autenticação, próximo passo de verdade, depende das migrations estarem
aplicadas em `tivexy-core` (🔒 externo).

## 5. Decisões tomadas

| #       | Decisão                                                                  | Data       |
| ------- | ------------------------------------------------------------------------ | ---------- |
| ADR-001 | Monorepo no repositório existente, não em `TivexyCortex/`                | 18/09/2026 |
| ADR-002 | Ordem de construção: Core e provisionamento antes de módulos e Blueprint | 18/09/2026 |
| —       | Cofre Obsidian versionado em `docs/`                                     | 18/09/2026 |
| —       | SaaS em Next.js, conforme Master Plan §4 — não em Astro                  | 18/09/2026 |

## 6. Dependências externas — 🔒 BLOCKED — EXTERNAL

Ordenadas por urgência:

| #   | Tarefa                                       | Bloqueia              | Urgência    |
| --- | -------------------------------------------- | --------------------- | ----------- |
| 1   | **Autorizar o conector Supabase no projeto** | Aplicar as migrations | 🔴 Imediata |
| 2   | Conferir o destino do formulário de contato  | Leads da landing      | 🟠 Alta     |
| 3   | Conta/organização Vercel própria da Tivexy   | Deploy do SaaS        | 🟠 Média    |
| 4   | Domínio `tivexy.com.br` + DNS                | SEO, e-mail           | 🟠 Média    |
| 5   | E-mail corporativo + SPF/DKIM/DMARC          | Convites do SaaS      | 🟠 Média    |
| 6   | Credenciais OpenAI                           | AI Engine             | 🟡 Depois   |
| 7   | Meta Business + WhatsApp Business API        | Atendimento           | 🟡 Depois   |
| 8   | Provedor fiscal + certificado digital        | Fiscal                | 🟡 Depois   |
| 9   | CNPJ, contador, conta PJ, contratos          | Venda formal          | 🟡 Paralelo |

**Resolvido em 19/09/2026 (madrugada):** o `git push` aconteceu — a branch
`monorepo-tivexy-core` está no remoto, no mesmo commit do local. Deixou de
existir trabalho que só vive nesta máquina.

**Resolvido em 19/09/2026:** o projeto Supabase existe — `tivexy-core`, ref
`lddpqizqjvtimxmorxux`, `sa-east-1`. O que restou é menor e está no topo desta
tabela: o conector Supabase desta sessão foi autorizado antes do projeto
existir, e responde `You do not have permission` nele. Sem isso, as migrations
só entram pelo CLI — que já está configurado (`npm run db:link && npm run
db:push`).

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
| 1   | Construir ERP/CRM antes de um Core confiável   | 🔴 Alto                      |
| 2   | Blueprint Engine virar abstração prematura     | 🔴 Alto                      |
| 3   | Duplicar auth/permissões dentro dos módulos    | 🟠 Alto                      |
| 4   | Mock apresentado como funcionalidade real      | 🔴 Crítico (legal/comercial) |
| 5   | Código, docs, Trello e este arquivo divergirem | 🟡 Médio                     |

**Saiu da lista em 19/09/2026:** "trabalho existir só nesta máquina" — o push
aconteceu.

Detalhe em [[PROJECT_AUDIT#17. Riscos]].

## 8. Retomada — nesta ordem

Os dois primeiros são seus e bloqueiam o resto.

### 1. 🔴 Revogar o token da Vercel

Ele foi colado em texto puro no chat da sessão de 18–19/09. Vercel → Settings →
Tokens → revogar e gerar outro. Foi usado para corrigir o Root Directory e
publicar um preview; nada além disso.

Na mesma passada, vale revogar o _deployment protection bypass token_ que a CLI
gerou sozinha para conseguir ler o preview protegido.

### 2. 🔴 Aplicar as migrations no projeto

O projeto existe (`tivexy-core`, ref `lddpqizqjvtimxmorxux`). Aplicar destrava
autenticação, provisionamento, Admin, CRM e ERP — tudo depende disto. Há dois
caminhos, e o segundo é o que fica.

**Pelo CLI** — já configurado, não depende de conector:

```bash
npx supabase login
npm run db:link
npm run db:push
npm run db:types
```

**Pelo conector** — precisa de reautorização: Configurações → Conectores →
Supabase → reconectar, incluindo o projeto novo no escopo. O conector desta
sessão foi autorizado antes de `tivexy-core` existir e responde
`You do not have permission` nele.

Depois de aplicar, **rodar o teste de isolamento contra o projeto real**. Os
157 testes rodam em Postgres WASM: fiéis ao contrato, não ao transporte.

### Depois, na ordem do ADR-002

3. **Autenticação** — Supabase Auth: login, convite, recuperação, sessão. A
   decisão de acesso já existe e está testada; falta a camada de sessão que
   chama `current_viewer()` e alimenta `parseViewer()`.
4. **Middleware** — ligar `matchRule` + `decideAccess` + `redirectFor` às rotas.
   As três peças existem e têm teste; falta o fio que as conecta à requisição.
5. **Provisionamento** — o esquema sustenta e há um modelo do fluxo provado em
   teste. Falta a implementação no backend, com `service_role`.
6. **Painel Super Admin**, e só então CRM e ERP.

### O que dá para fazer sem esperar nada

- Abrir o PR da branch `monorepo-tivexy-core` (o push já aconteceu; o `gh` nesta
  máquina não está autenticado, então é pela interface do GitHub ou depois de um
  `gh auth login`)
- Conferir se o destino do formulário de contato da landing ainda responde
- Revisar as variáveis de outro projeto no ambiente Vercel (`DATABASE_URL`,
  `AUTH_SECRET`, `STORE_TIMEZONE` e outras) — a landing não usa nenhuma, mas
  apagar segredo sem contexto é irreversível
- Abrir `docs/` no Obsidian como cofre
