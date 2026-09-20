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
| Esquema do Core              | 🟡     | `npm run test:db` — 114 testes em Postgres 18; **não aplicado**    |
| Knowledge base (`docs/`)     | ✅     | Cofre Obsidian versionado                                          |
| Trello estruturado           | ✅     | Listas, labels por módulo e backlog inicial                        |
| Contratos (`packages/core`)  | ✅     | `npm run validate` — 368 testes; contratos conferidos contra o SQL |
| CI (GitHub Actions)          | 🟡     | Escrito e no remoto; roda na abertura do PR, não em push de branch |
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

**Verificado por execução** — `npm run test:db`, 114 testes contra Postgres 18:

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

Existe e é consumido por `apps/web`. **178 testes.**

**O catálogo e os estados** — módulos, permissões, papéis, planos, e os estados
de tenant, vínculo e provisionamento. Espelham o SQL, e é o teste de contratos
que impede os dois de divergirem.

**As decisões** — regras puras que a aplicação aplica antes de falar com o
banco, cada uma espelhando uma garantia que o banco também tem:

- `decideAccess()`, `matchRule()`, `parseViewer()` — quem pode abrir esta rota.
  37 testes: a ordem em que nega, o padrão fechado, contexto malformado virando
  menos acesso
- `planProvisioning()` — o que acontece ao criar este cliente. A decisão saiu de
  dentro do backend e virou lista ordenada de operações; `previewOf()` a resume
  para mostrar antes de executar
- `tenantSlugFromHost()` — de qual tenant é esta requisição, lido do subdomínio

**A configuração de nicho** — `checkBlueprint()`, `resolveSettings()` e o
catálogo de configurações. Ver a seção Blueprint abaixo.

**16 testes conferem os contratos contra o SQL**, e não só os códigos: `isActive`
contra o índice parcial, `isTerminal` contra a constraint de data de fim, e o
formato do slug contra `tenants_slug_format`.

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
- `lib/auth/guard.ts`: a guarda de rota, pura — junta `matchRule`,
  `decideAccess` e `redirectFor`, e resolve as duas coisas que só aparecem
  quando elas se juntam: laço de redirecionamento e redirecionamento aberto
- `lib/env.ts`: leitura de ambiente que falha cedo e nomeia a variável que
  falta, em vez de `fetch failed` no meio da requisição
- `/acesso-negado`: a tradução de `DenialReason` para texto que distingue
  "módulo não contratado" de "sem permissão" — a diferença entre falar com o
  comercial ou com o administrador da empresa

**72 testes em `apps/web`**, incluindo um invariante que percorre cada motivo de
negação com destino e prova que quem foi mandado para lá consegue abrir.

**Não existe ainda:** autenticação, banco, rotas `(auth)` e `(admin)`, e qualquer
módulo de negócio. A navegação declara essas rotas como `pending`/`blocked` e as
renderiza desabilitadas, de propósito — a estrutura aparece sem prometer tela
que não há.

**A guarda não está ligada a requisição nenhuma.** Ela existe, é pura e tem
teste; falta o `middleware.ts` que a chama e a camada de sessão que monta o
`Viewer`. Ligar antes de existir `/entrar` trocaria uma página que funciona por
um 404 — e `/entrar` depende de Supabase aplicado.

### Admin / Super Admin

**Estado:** ⬜ NÃO EXISTE · **Trello:** `ADMIN` · **Depende de:** Core, Auth, RBAC

### CRM

**Estado:** ⬜ NÃO EXISTE · **Trello:** `CRM` · **Depende de:** Core, Auth, RBAC, provisionamento

### ERP

**Estado:** ⬜ NÃO EXISTE · **Trello:** `ERP` · **Depende de:** Core, Auth, RBAC, provisionamento

### Blueprint — configuração de nicho

**Estado:** 🟡 PARCIAL · **Docs:** `packages/core/blueprints/README.md` · [[16-DECISIONS/ADR-003-blueprint-como-configuracao]] · **Trello:** `BLUEPRINT`

O [[16-DECISIONS/ADR-003-blueprint-como-configuracao|ADR-003]] separou dois
Blueprints que estavam com o mesmo nome. Este é o primeiro: **configuração
declarativa de provisionamento**.

**Pronto e verificado por execução:**

- `packages/core/src/blueprint.ts` — o contrato e `checkBlueprint`, que relata
  todos os problemas de uma vez com o caminho dentro do documento
- Dois nichos reais em JSON: `cafeteria` (erp, inventory, finance) e
  `clinica-odontologica` (crm, finance) — diferem em módulo e em vocabulário
- 71 testes de contrato e 10 de provisionamento contra Postgres, incluindo o
  marco do ADR-003: nichos diferentes produzem tenants diferentes, e o mesmo
  nicho provisionado duas vezes produz tenants iguais

**Não existe:** o motor de esquema em tempo de execução — entidades e
formulários definidos por dado. Continua adiado pelo ADR-002, e com razão.

**Aplicado pela metade, de propósito:** as sementes de negócio ficam
registradas como pendentes, porque as tabelas de CRM e ERP não existem. O
provisionamento não finge que semeou.

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

| #   | Tarefa                                          | Bloqueia                | Urgência    |
| --- | ----------------------------------------------- | ----------------------- | ----------- |
| 1   | **Aplicar as migrations em `tivexy-core`**      | Todo o SaaS             | 🔴 Imediata |
| 2   | **Abrir o PR** da branch `monorepo-tivexy-core` | Primeira execução do CI | 🔴 Imediata |
| 3   | **Trocar a conta dos conectores** desta máquina | Supabase e Vercel daqui | 🟠 Alta     |
| 4   | Conferir o destino do formulário de contato     | Leads da landing        | 🟠 Alta     |
| 5   | Projeto Vercel do `apps/web` + variáveis        | Deploy do SaaS          | 🟡 Depois   |
| 6   | Domínio `tivexy.com.br` + DNS                   | SEO, e-mail             | 🟠 Média    |
| 7   | E-mail corporativo + SPF/DKIM/DMARC             | Convites do SaaS        | 🟠 Média    |
| 8   | Credenciais OpenAI                              | AI Engine               | 🟡 Depois   |
| 9   | Meta Business + WhatsApp Business API           | Atendimento             | 🟡 Depois   |
| 10  | Provedor fiscal + certificado digital           | Fiscal                  | 🟡 Depois   |
| 11  | CNPJ, contador, conta PJ, contratos             | Venda formal            | 🟡 Paralelo |

A ordem importa: o Supabase é o que **produz as chaves** que a variável de
ambiente da Vercel vai precisar. Cadastrar env antes é preencher campo com valor
que ainda não existe.

O item 5 é deliberadamente "depois": sem autenticação, o SaaS não tem o que
servir. Criar o projeto agora seria estrutura vazia. Ver ADR-002.

### Os dois conectores estão logados na conta errada — verificado em 19/09/2026

**Diagnóstico corrigido.** A primeira leitura foi "o conector precisa ser
reautorizado no projeto". Está errado: o problema não é escopo, é **conta**.
Esta máquina é a das contas pessoais, e os dois conectores desta sessão estão
autenticados na conta **corporativa**, que é a do notebook. Nenhum projeto
Tivexy vive lá.

Isso muda a ação, e para melhor: é sair e entrar com a conta certa, não
reconfigurar permissão. E não se resolve daqui — `reconnect` só serve para
conector com falha, e os dois estão saudáveis.

> Quais contas hospedam o quê está registrado fora do repositório, de
> propósito: este repositório é **público**, e mapear serviço → e-mail de login
> é entregar ao atacante metade do trabalho. Identificador de projeto (`ref`,
> `team_…`) é público por desenho e pode ficar aqui.

| Conector | Alcança                                           | Precisa alcançar                                  |
| -------- | ------------------------------------------------- | ------------------------------------------------- |
| Supabase | `NIT-GLASSES`, `NIT-ERP-CRM`                      | `tivexy-core` (`lddpqizqjvtimxmorxux`)            |
| Vercel   | `team_VerzWfKr9mCSD0jxIT4siHqz` — projetos da NIT | escopo `tivexy` (`team_StfA3dMbSHoj6qr0sLbMGLK4`) |

A Vercel responde literalmente:

> Trying to access resource under scope "tivexy". You must re-authenticate to
> this scope or use a token with access to this scope.

**Achado positivo:** o escopo `tivexy` **já existe** na Vercel, e a landing vive
nele (`prj_d10OZnrXAeUDSHIgDTEDJMvQ7RKA` — lido de `.vercel/project.json`). A
auditoria listava "criar organização Vercel própria da Tivexy" como pendência;
essa parte está feita. O que falta é o projeto do `apps/web`, que ainda não
existe.

**Resolvido em 19/09/2026 (madrugada):** o `git push` aconteceu — a branch
`monorepo-tivexy-core` está no remoto, no mesmo commit do local. Deixou de
existir trabalho que só vive nesta máquina.

**Resolvido em 19/09/2026:** o projeto Supabase existe — `tivexy-core`, ref
`lddpqizqjvtimxmorxux`, `sa-east-1`. O que restou é menor e está no topo desta
tabela: o conector responde `You do not have permission` nele, porque está
logado na conta errada. Enquanto isso, as migrations entram pelo CLI — que já
está configurado (`npm run db:link && npm run db:push`).

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

**Pelo conector** — os conectores desta sessão estão logados na conta
corporativa, e nenhum projeto Tivexy vive nela. Sair e entrar com a conta certa
resolve os dois de uma vez, Supabase e Vercel.

Depois de aplicar, **rodar o teste de isolamento contra o projeto real**. Os
114 testes de banco rodam em Postgres WASM: fiéis ao contrato, não ao
transporte.

### 3. 🔴 Abrir o PR

O push aconteceu, mas **o CI nunca rodou** — e isso está certo: o workflow
dispara em `push` para `main`, em `pull_request` e manualmente. Push de branch
de trabalho não dispara nada, de propósito.

Abrir o PR é o que faz todos os commits serem validados em máquina limpa, não
só nesta. O `gh` aqui não está autenticado, então é pela interface do GitHub —
ou `gh auth login` para destravar e eu abrir.

### Depois, na ordem do ADR-002

4. **Autenticação** — Supabase Auth: login, convite, recuperação, sessão. A
   decisão de acesso já existe e está testada; falta a camada de sessão que
   chama `current_viewer()` e alimenta `parseViewer()`.
5. **Middleware** — `guard()` já existe e está testada; falta o `middleware.ts`
   que a chama e a camada de sessão que monta o `Viewer` a partir dos cookies e
   de `current_viewer()`. Esta é a parte que precisa do Supabase aplicado.
6. **Provisionamento** — o esquema sustenta e há um modelo do fluxo provado em
   teste. Falta a implementação no backend, com `service_role`.
7. **Painel Super Admin**, e só então CRM e ERP.

### O que dá para fazer sem esperar nada

- Conferir se o destino do formulário de contato da landing ainda responde
- Revisar as variáveis de outro projeto no ambiente Vercel (`DATABASE_URL`,
  `AUTH_SECRET`, `STORE_TIMEZONE` e outras) — a landing não usa nenhuma, mas
  apagar segredo sem contexto é irreversível
- Abrir `docs/` no Obsidian como cofre
