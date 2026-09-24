# Prompt — sessão autônoma

> O briefing de uma sessão longa e sem supervisão. Versionado porque a sessão
> precisa poder reler, e porque o que se pede a um agente autônomo é uma
> decisão de projeto como qualquer outra.
>
> Escrito em 23/09/2026, para a sessão de nuvem que vai construir ERP, terminar
> CRM e Admin, e escrever o tutorial.

---

Você vai trabalhar sozinho por várias horas no Tivexy. Leia `CLAUDE.md` e
`docs/PROJECT_STATE.md` antes de escrever a primeira linha — eles valem mais
que este prompt em qualquer discordância.

## O que já existe

Branch `monorepo-tivexy-core`. Monorepo npm workspaces, **sem Docker em lugar
nenhum**.

|                 |                                                    |
| --------------- | -------------------------------------------------- |
| `apps/site`     | Landing em Astro, em produção                      |
| `apps/web`      | SaaS em Next.js 16 — Core, Auth, Admin, CRM        |
| `packages/core` | Contratos puros, sem I/O                           |
| `supabase/`     | 12 migrations, testes em PGlite (Postgres em WASM) |
| `docs/`         | Cofre Obsidian                                     |

Pronto e verificado contra o banco real: esquema do Core (15 tabelas, RLS),
autenticação e sessão, provisionamento de cliente pela tela com Blueprint
(criar, retomar, desfazer), esquema do CRM (8 tabelas), tela de leads e
conversão de lead.

`npm run validate` roda tipos, lint, build dos dois apps e **519 testes**.
Deve estar verde antes e depois de cada commit seu.

## A restrição desta sessão — leia antes de escrever qualquer documento

**Você não tem `.env`.** Ele é gitignored e precisa ser.

Você **pode** construir tudo e rodar `npm run validate` inteiro: o PGlite não
precisa de credencial.

Você **não pode** aplicar migration no projeto real, entrar no sistema, nem
abrir uma tela contra o Postgres de verdade.

Por isso, e isto não é negociável: **tudo que você entregar entra em
`PROJECT_STATE.md` como 🟡, com a frase "testado, não verificado contra o banco
real". Nunca ✅.** A legenda daquela página reserva ✅ para o que foi verificado
por execução. Ver §6.2 — os dois defeitos mais sérios encontrados em 20/09 não
foram pegos por teste nenhum; apareceram contra o banco de verdade.

Migration que você criar fica pendente até o dono rodar `npm run db:push`.

## O que construir, nesta ordem

Faça **um item por vez, inteiro**. Item pela metade vale menos que item a
menos — e o crédito pode acabar no meio.

### 1. Terminar o CRM

- Funil em **kanban** (`/crm/oportunidades`): colunas por etapa, arrastar entre
  etapas, total por coluna. A situação da oportunidade é a da etapa — ela não
  tem status próprio.
- Contatos (`/crm/contatos`), contas (`/crm/empresas`), atividades
  (`/crm/atividades`).
- Busca e filtro nas listagens. Hoje a de leads traz as 200 mais recentes.
- **Aceitar convite pela tela.** Exige uma função `SECURITY DEFINER` que confira
  o convite: o RLS nega essa escrita a quem ainda não é membro ativo, que é
  exatamente quem está naquela página. Hoje `/convite` diz a verdade e não
  oferece botão.

### 2. Admin

Editar cliente, suspender e reativar, trocar plano, convidar usuário, histórico
de provisionamentos.

### 3. ERP inteiro, do zero

Esquema + RLS + contratos + telas: produtos, categorias, estoque, vendas,
formas de pagamento, financeiro.

Ao criar as tabelas, **inclua `erp.product_categories` e `erp.payment_methods`
em `TABELA_DA_SEMENTE`** (`apps/web/src/server/provisioning/execute.ts`). Hoje
essas sementes do Blueprint ficam registradas como pendentes; quando a tabela
existir, elas precisam passar a aplicar — e o teste que afirma que continuam
pendentes vai falhar. Reescrevê-lo é a resposta certa.

### 4. Motor de automações

Gatilho → condição → ação, **só interno**. Nada que dependa de canal externo.

### 5. Tutorial interativo

Rota própria em `apps/web`. Ponta a ponta: criar cliente pelo Admin com
Blueprint → primeiro acesso do cliente → CRM → ERP.

Precisa **dizer o que ainda é externo** — convite não sai por e-mail sem SMTP,
não há WhatsApp, não há emissão fiscal — em vez de fingir que o fluxo fecha.

## A régua visual

Qualidade visual é requisito, não enfeite. O dono pediu o melhor e mais
completo ERP/CRM/Admin que couber: gráficos animados, temas bonitos, tipografia
boa.

- **Estenda o design system que já existe** — `apps/web/src/app/globals.css`,
  tokens semânticos, claro e escuro, Manrope/Inter/Geist Mono. Não invente um
  segundo.
- Gráfico legível nos **dois temas**, e acessível: cor não pode ser a única
  portadora de informação.
- Animação respeita `prefers-reduced-motion` — a regra global já zera duração.
- **Nenhum número inventado em gráfico.** Sem dado, estado vazio honesto.
- Tudo funciona a 375px, sem scroll horizontal.

## O que é proibido

`CLAUDE.md` §"não fingir funcionalidade". Não construa, nem rotulado:

- emissão fiscal, boleto, pagamento, certificado digital
- integração Meta/WhatsApp, webhook apresentado como real
- envio de e-mail que não sai
- dado de produção inventado

Fora de escopo por dependerem de credencial: SMTP, OpenAI, Meta, provedor
fiscal, deploy na Vercel, CI. Não tente contornar nenhum.

## Como trabalhar

**A disciplina do projeto, na ordem:** esquema → testes de banco → contratos em
`packages/core` (com teste comparando contra o SQL) → tela.

**Garantia crítica se confere quebrando o código de propósito** para ver o teste
falhar. Se o teste passa com o código quebrado, ele não estava testando nada.

**Commit e push a cada peça coerente.** Não acumule. O crédito pode acabar no
meio, e o que estiver commitado sobrevive. Mensagem em português, explicando
**por que** e não o quê. Termine com:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**`PROJECT_STATE.md` e o documento do módulo em `docs/` entram no mesmo commit
da entrega**, não depois. As fontes de verdade não podem divergir; o Trello está
desconectado (§6.1), então registre lá o que iria para ele.

**Nunca** force-push, nunca mexa em `main`, nunca apague dado, nunca invente
credencial.

Quando um teste existente falhar por causa da sua mudança, decida qual dos dois
está errado — o código ou o teste — e **diga qual** no commit. Os dois casos já
aconteceram neste projeto.

## Armadilhas já pagas

Não repita nenhuma destas. Cada uma custou tempo:

- **jsonb**: todo parâmetro JSON vai como `$n::text::jsonb`. Sem o `::text` os
  drivers divergem — o PGlite analisa, o de produção serializa de novo — e o
  teste não pega.
- **Chave composta**: tabela nova de tenant leva `unique (tenant_id, id)`, e
  toda referência carrega o `tenant_id` junto. Use
  `on delete set null (coluna)`: sem nomear a coluna, ele tenta anular
  `tenant_id`, que é `not null`.
- **`'use server'`** só exporta função assíncrona. Estado inicial e constantes
  vão para arquivo separado. Não dá erro em build — quebra ao enviar o
  formulário.
- **RLS é piso, não filtro.** Toda consulta filtra `tenant_id` explicitamente:
  quem participa de duas empresas tem permissão nas duas.
- **`asUser()`** do harness faz rollback. Escrita que precisa persistir usa
  `asUserCommitting()`.
- **Blueprint**: funil precisa de etapa `won` **e** `lost`; etapa cita o funil
  pelo nome e precisa vir depois dele na lista.
- **Shell**: evite crase e `$(` dentro de string passada ao bash — ele come.
  Escreva script em arquivo.

## Ao terminar

Deixe `npm run validate` verde, tudo commitado e pushado, e escreva um resumo
do que ficou pronto, do que não coube, e — especialmente — de qualquer coisa
que você suspeite que só vai aparecer quando rodar contra o banco de verdade.
