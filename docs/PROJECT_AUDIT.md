# TIVEXY — AUDITORIA

> Auditoria executada em **18/09/2026**, antes de qualquer alteração de código.
> Descreve o estado encontrado. O estado corrente vive em [[PROJECT_STATE]].

## 1. Estado atual

O ecossistema Tivexy existia como **um único projeto**: a landing page institucional,
em Astro 7, na raiz do repositório `TivexyWebSite` (GitHub: `RurikDangelo/TivexyWebSite`,
branch `main`, um único commit — "Site oficial da Tivexy").

Não existia nenhuma linha de código do SaaS, do Core, do ERP, do CRM ou do Admin.

**Divergência estrutural encontrada:** o briefing declarava
`TivexyWebSite\TivexyCortex` como "o repositório oficial do ecossistema".
Na prática, `TivexyCortex/` **não era um repositório**: era um cofre Obsidian
recém-criado e vazio (`TivexyCortex/Tivexy/` com 6 arquivos, sendo 5 de configuração
e 1 a nota "Bem-vindo.md" padrão do Obsidian), não versionado, dentro do repo git da landing.

O monorepo oficial, portanto, não existia em lugar nenhum. Foi criado nesta sessão
a partir do repositório existente — decisão registrada em
[[16-DECISIONS/ADR-001-monorepo-no-repositorio-existente]].

## 2. O que já existe

| Item                          | Onde                                   | Observação                                    |
| ----------------------------- | -------------------------------------- | --------------------------------------------- |
| Landing page completa         | `apps/site/` (era a raiz)              | 7 páginas, 11.890 linhas                      |
| Design system                 | `apps/site/src/styles/tokens.css`      | Cores, tipografia, grade de 8px, movimento    |
| Identidade de marca           | `apps/site/src/assets/brand/`          | 4 SVGs oficiais extraídos do PDF da marca     |
| Geração de ícones             | `apps/site/scripts/generate-icons.mjs` | Favicon, PWA icons, manifest                  |
| Imagem Open Graph             | `apps/site/src/pages/og.png.ts`        | Gerada no build com Satori + Resvg            |
| Conteúdo em arquivos de dados | `apps/site/src/data/`                  | 7 arquivos, conteúdo separado da apresentação |
| Documentação de produto       | 2 PDFs internos                        | Master Plan v1.0 e Documentação Interna v1.1  |

### Páginas publicadas

`/`, `/404`, `/privacidade`, `/solucoes/sistemas-sob-medida`, `/solucoes/saas`,
`/solucoes/automacao`, `/solucoes/inteligencia-artificial`, mais `robots.txt`,
`sitemap-index.xml` e `og.png`.

## 3. O que funciona

Verificado por execução real, não por leitura:

- `npm run check` (astro check + TypeScript estrito) — **0 erros, 0 avisos, 0 hints**
- `npm run lint` (ESLint) — **0 problemas**
- `npm run build` — **7 páginas geradas**, sitemap e robots.txt criados
- `og.png` gerado e válido: PNG 1200×630, 57 KB

O README da landing reporta Lighthouse mobile 99/100/100/100 e desktop 100/100/100/100,
axe-core sem violações WCAG 2.2 AA, e nenhum overflow horizontal de 320px a 1920px.
**Esses números não foram reverificados nesta auditoria** — são a medição do autor.

## 4. O que está quebrado

| #   | Problema                                                                                                                                        | Gravidade                 | Situação                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| 1   | `sharp` usado por `generate-icons.mjs` sem estar declarado no `package.json` — funcionava por acidente, como dependência transitiva do Astro    | Média                     | **Corrigido** nesta sessão (declarado em `apps/site/package.json`) |
| 2   | `og.png.ts` montava o caminho das fontes à mão (`process.cwd()/node_modules/...`), o que quebra quando as dependências são içadas pelo monorepo | Alta (só após a migração) | **Corrigido** nesta sessão (passou a usar `import.meta.resolve`)   |
| 3   | Trello oficial completamente vazio: zero listas, zero cards, 6 labels padrão sem nome                                                           | Alta                      | **Corrigido** nesta sessão                                         |
| 4   | Cofre Obsidian vazio e fora do versionamento                                                                                                    | Alta                      | **Corrigido** nesta sessão (virou `docs/`, versionado)             |

Nada na landing estava quebrado em runtime.

## 5. O que está incompleto

- **Configuração de publicação**: `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`,
  `PUBLIC_CONTACT_EMAIL` e `PUBLIC_LEADS_ENDPOINT` não estão definidos. O build
  avisa. Sem eles o formulário de contato **não tem para onde enviar leads** e o
  canonical/sitemap/Open Graph usam o domínio padrão `tivexy.com.br`.
- **Produtos anunciados sem existir**: `apps/site/src/data/products.ts` lista
  Tivexy OS, CRM, Flow e AI, todos com status "Em breve". Correto hoje — e é
  exatamente o que este monorepo passa a construir.
- **Cases e prova social vazios**: por decisão de marca, nada é inventado. A seção
  só aparece quando houver case real.

## 6. O que precisa ser criado

Tudo do SaaS. Em ordem de dependência:

Banco → Autenticação → Multi-tenancy → **Provisionamento** → RBAC → Admin →
CRM → ERP → Estoque → Financeiro → Integrações → Automações → Dashboards →
Testes → Documentação → Deploy.

O **provisionamento é prioridade zero** — é o que transforma a plataforma em
operação SaaS de verdade (Documentação Interna v1.1, §5).

## 7. O que pode ser reaproveitado

| Ativo                                                          | Reaproveitamento                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Design tokens (`tokens.css`)                                   | Base do design system do SaaS — precisa virar `packages/ui` quando houver segundo consumidor |
| SVGs da marca                                                  | Diretos, sem redesenho                                                                       |
| `breakpoints.ts` / `brand.ts`                                  | Candidatos naturais a `packages/config`                                                      |
| Vocabulário de produto (`data/services.ts`, `data/systems.ts`) | Já descreve os nichos-alvo: cafeteria, mercado, ERP, CRM — insumo para os Blueprints         |

**Não reaproveitável:** o CSS da landing e os componentes `.astro`. O SaaS usa
Next.js + Tailwind + shadcn/ui (stack oficial do Master Plan §4). Compartilhar
tokens faz sentido; compartilhar componentes entre Astro e React, não.

## 8. Arquitetura atual (antes)

```
TivexyWebSite/            ← repo git = a landing, e só
├── src/                  ← landing
├── public/
├── astro.config.mjs
├── package.json
└── TivexyCortex/         ← não versionado, cofre Obsidian vazio
    └── Tivexy/
```

Sem separação entre repositório, aplicação, módulo e package. Sem SaaS.

## 9. Arquitetura proposta (aplicada nesta sessão)

```
TivexyWebSite/                 ← monorepo (npm workspaces)
├── apps/
│   ├── site/                  ← landing pública (Astro) — build/deploy próprios
│   └── web/                   ← SaaS autenticado (Next.js) — build/deploy próprios
├── packages/                  ← compartilhado de verdade (core, ui, types, config)
├── docs/                      ← knowledge base = cofre Obsidian, versionado
├── CLAUDE.md / AGENTS.md      ← regras permanentes
└── package.json               ← raiz do workspace
```

Detalhe em [[REPOSITORY_STRUCTURE]] e [[ARCHITECTURE]].

## 10. Módulos

| Módulo                                         | Estado                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| Landing (`apps/site`)                          | **FUNCIONA** — em produção                             |
| Core, Auth, Tenants, RBAC                      | **NÃO EXISTE**                                         |
| Provisionamento                                | **NÃO EXISTE** — prioridade zero                       |
| Admin, CRM, ERP, Estoque, Financeiro           | **NÃO EXISTE**                                         |
| Blueprint Engine, AI Engine, Automation Engine | **NÃO EXISTE**                                         |
| WhatsApp / Meta, Banking, Fiscal               | **NÃO EXISTE** + **EXTERNO** (dependem de credenciais) |

## 11. Blueprints

Conceito central, ainda não modelado. O material existente que alimenta os primeiros
Blueprints está em `apps/site/src/data/systems.ts` (cafeteria, mercado, ERP essencial,
CRM essencial) e `services.ts`.

Risco registrado: Blueprint é a parte mais fácil de transformar em over-engineering
antes de existir um Core funcionando. Ver [[16-DECISIONS/ADR-002-ordem-de-construcao]].

## 12. Trello

**Encontrado:** board `Tivexy` (workspace "koriu's workspace") completamente vazio —
nenhuma lista, nenhum card, 6 labels padrão sem nome.

**Feito:** board estruturado com fluxo de execução, labels por módulo e backlog inicial.

## 13. Obsidian

**Encontrado:** cofre em `TivexyCortex/Tivexy/`, vazio, fora do git.

**Feito:** cofre movido para `docs/`, versionado, com a taxonomia numerada
(`00-SYSTEM` … `99-ARCHIVE`). O estado local de janelas do Obsidian ficou no `.gitignore`.

## 14. Tarefas internas

Tudo que não depende de terceiros: Core, Auth, multi-tenancy, provisionamento, RBAC,
Admin, CRM, ERP, estoque, financeiro, Blueprint Engine, Automation Engine, UI/UX,
testes, documentação, adapters (com mock rotulado).

## 15. Tarefas externas — `BLOCKED — EXTERNAL`

Nenhuma delas pode ser resolvida escrevendo código:

| Tarefa                                                                  | Por quê                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Vercel: mudar Root Directory do projeto da landing para `apps/site`** | **Urgente** — sem isso o próximo deploy da landing quebra                   |
| Criar conta/organização Vercel própria da Tivexy                        | Hoje o `tivexy.vercel.app` não está na conta Vercel conectada a esta sessão |
| Criar projeto Supabase da Tivexy                                        | Banco, Auth e Storage do SaaS                                               |
| Definir `PUBLIC_SITE_URL` e destino do formulário de contato            | Leads da landing hoje não têm destino                                       |
| Domínio `tivexy.com.br` + DNS                                           | Canonical, e-mail, SEO                                                      |
| E-mail corporativo + SPF/DKIM/DMARC                                     | Comunicação e convites do SaaS                                              |
| Meta Business + WhatsApp Business API                                   | Integração de atendimento                                                   |
| Provedor fiscal + certificado digital                                   | NF-e / NFC-e / NFS-e                                                        |
| Credenciais OpenAI                                                      | AI Engine                                                                   |
| CNPJ, contador, conta PJ, contratos                                     | Master Plan §2                                                              |

## 16. Dependências

```
apps/site  →  (nenhuma interna)
apps/web   →  packages/core → packages/types
           →  packages/ui   → packages/config
```

Externas do SaaS: Supabase (banco/auth/storage), Vercel (deploy), OpenAI (IA),
Meta (WhatsApp/Instagram), provedor fiscal, provedor bancário.

## 17. Riscos

| #   | Risco                                                              | Impacto                           | Mitigação                                                                    |
| --- | ------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Deploy da landing quebrar após a migração                          | Alto, imediato                    | Ajustar Root Directory na Vercel antes do próximo push — ver §15             |
| 2   | Construir ERP/CRM antes de um Core confiável                       | Alto                              | Ordem fixa: provisionamento antes de módulo. Regra final da Doc Interna v1.1 |
| 3   | Blueprint Engine virar abstração prematura                         | Alto                              | Só depois de Core + um módulo real funcionando                               |
| 4   | Duplicar auth/usuários/permissões dentro de ERP e CRM              | Alto                              | Regra de fronteira no `CLAUDE.md`                                            |
| 5   | Apresentar mock como funcionalidade real (fiscal, WhatsApp)        | Crítico — risco legal e comercial | Regra absoluta no `CLAUDE.md`; rótulo obrigatório na UI                      |
| 6   | Trello, Obsidian, código e PROJECT_STATE divergirem                | Médio                             | Atualização junto com a entrega, não depois                                  |
| 7   | Uma pessoa acumulando produto, arquitetura, dev, segurança e infra | Médio                             | Escopo por fase; não abrir frente nova antes de fechar a anterior            |

## 18. Próximas ações

1. **[EXTERNO, urgente]** Ajustar o Root Directory da landing na Vercel para `apps/site`.
2. **[EXTERNO]** Criar o projeto Supabase e entregar as credenciais.
3. **[INTERNO]** Scaffold de `apps/web` (Next.js + TypeScript + Tailwind + shadcn/ui).
4. **[INTERNO]** Modelar o banco: tenants, planos, módulos, usuários, perfis, permissões, auditoria.
5. **[INTERNO]** Autenticação e multi-tenancy com RLS.
6. **[INTERNO]** Fluxo de provisionamento ponta a ponta + teste E2E.
7. **[INTERNO]** Teste obrigatório: usuário do Tenant B acessando recurso do Tenant A → negado.
