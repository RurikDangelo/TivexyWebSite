# Colocar em produção — passo a passo

Escrito em 25/09/2026, para o PR #1 (`monorepo-tivexy-core-ib09xt` → `main`).
Siga **na ordem**: o banco vem antes do SaaS, e o SaaS precisa do domínio e do
Supabase configurados antes de alguém entrar.

Cada passo diz onde clicar, o que colar e como saber que deu certo. Onde
aparece `SEU_REF`, é `lddpqizqjvtimxmorxux` (o projeto `tivexy-core`).

> **Nunca cole senha, chave `sb_secret_…`, token ou link de acesso em chat,
> issue ou print.** Tudo abaixo vai direto no `.env` da sua máquina ou no
> painel da Vercel/Supabase.

---

## Passo 0 — Preparar a sua máquina (uma vez)

Precisa de: Node 24, Git, e acesso ao painel do Supabase e da Vercel na conta
da Tivexy.

1. Abra o terminal na pasta do projeto e traga a branch do PR:
   ```bash
   git fetch origin
   git checkout monorepo-tivexy-core-ib09xt
   git pull
   npm ci
   ```
2. Crie o `.env` da raiz, se ainda não existir:
   ```bash
   cp .env.example .env
   ```
3. Preencha o `.env`. No Supabase, abra o projeto **tivexy-core**:
   - **Project Settings → Database → Connection string**, aba **URI**:
     - modo **Session** (porta **5432**) → cole em `DIRECT_URL`;
     - modo **Transaction** (porta **6543**) → cole em `DATABASE_URL` e
       acrescente `?pgbouncer=true` no fim.
     - Troque `[YOUR-PASSWORD]` pela senha do banco, **tirando os colchetes**.
       Cole a senha crua; o script faz a codificação sozinho.
     - Esqueceu a senha? Na mesma tela, **Reset database password**. Anote
       num gerenciador de senhas.
   - **Project Settings → API Keys**:
     - URL do projeto → `SUPABASE_URL`;
     - chave **Publishable** (`sb_publishable_…`) → `SUPABASE_PUBLISHABLE_KEY`;
     - chave **Secret** (`sb_secret_…`) → `SUPABASE_SECRET_KEY`.
4. Confira que tudo roda:
   ```bash
   npm run validate
   ```
   ✅ Deu certo se terminar sem erro (leva alguns minutos; os testes de banco
   rodam num Postgres local, não no seu projeto).

---

## Passo 1 — Aplicar as migrations no Supabase

O banco de produção está em `20260920040000`. Faltam 16 migrations, de
`20260925010000` a `20260925150000`.

1. Veja o que vai ser aplicado, **sem escrever nada**:
   ```bash
   npm run db:status
   ```
   ✅ Deve listar as 16 migrations de `20260925…`. Se listar outras coisas
   (mais antigas), **pare** e me chame — o banco divergiu do repositório.
2. Faça um backup antes (recomendado): Supabase → **Database → Backups**.
   No plano gratuito não há backup automático; no mínimo exporte pelo painel
   (**Database → Backups → Download**) ou rode
   `npx supabase db dump --db-url "$DIRECT_URL" -f backup-antes-do-deploy.sql`.
3. Aplique:
   ```bash
   npm run db:push
   ```
4. Confira:
   ```bash
   npm run db:list
   ```
   ✅ Local e remoto iguais, a última é `20260925150000_erp_sales_daily`.

**Deu erro?** Copie só a mensagem (o script já esconde a senha) e me mande.
Uma migration que falha não é aplicada pela metade: cada uma roda numa
transação.

---

## Passo 2 — Conferir o CI e o preview no PR

1. Abra https://github.com/RurikDangelo/TivexyWebSite/pull/1.
2. Desça até o quadro de verificações:
   - **CI / Tipos, lint, build e testes** → ✅ verde.
   - **Vercel** (preview da landing) → clique em **Visit Preview** e confira a
     home: menu, hero, formulário de contato.
3. Se algo estiver vermelho, me avise com o link — eu corrijo na branch.

---

## Passo 3 — Landing (`apps/site`) na Vercel

Já foi ajustado em 19/09; é só conferir antes do merge.

1. Vercel → escopo **tivexy** → projeto da landing → **Settings → Build and
   Deployment**.
2. **Root Directory** = `apps/site`. Se não estiver, clique em **Edit**,
   escreva `apps/site`, **Save**.
3. **Framework Preset** = Astro. Deixe _Build Command_ e _Output Directory_ no
   padrão.
4. **Settings → Environment Variables**: confirme que existem em _Production_
   `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`, `PUBLIC_CONTACT_EMAIL`,
   `PUBLIC_LEADS_ENDPOINT` (já estavam em 19/09).

✅ O preview do Passo 2 abrindo a home é a prova de que isto está certo.

---

## Passo 4 — Fazer o merge

1. No PR, **Merge pull request → Create a merge commit** (não use _Squash_ nem
   _Rebase_: o commit de junção com o `main` antigo precisa ser preservado).
2. A Vercel publica a landing em produção sozinha. Acompanhe em Vercel →
   projeto da landing → **Deployments**: o do `main` deve ficar **Ready**.
3. Abra o site de produção e confira a home.

**Algo errado na landing?** Vercel → **Deployments** → o deploy anterior →
**⋯ → Promote to Production**. Volta em segundos, sem mexer no código.

---

## Passo 5 — Domínio e DNS

O SaaS vive em subdomínios: `app.tivexy.com.br` é a plataforma, e cada empresa
tem o seu (`cafe-central.tivexy.com.br`). Isso exige um **domínio curinga**
(`*.tivexy.com.br`), e a Vercel só emite certificado para curinga quando o DNS
do domínio está com ela.

1. **Se o domínio ainda não é seu:** registre `tivexy.com.br` em
   https://registro.br (CNPJ ou CPF do titular).
2. **Aponte o DNS para a Vercel:** Vercel → escopo **tivexy** → **Domains →
   Add** → `tivexy.com.br`. Ela mostra dois _nameservers_
   (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
3. No registro.br: **Domínios → tivexy.com.br → DNS → Alterar servidores DNS**
   → cole os dois da Vercel → salvar. Propaga em minutos a algumas horas.
   - ⚠️ Se o domínio já tem e-mail (Google Workspace, Zoho…), **recrie antes**
     os registros MX, SPF e DKIM na aba DNS da Vercel — senão o e-mail para
     de chegar quando os servidores mudarem.
4. Na Vercel, ligue o domínio raiz (`tivexy.com.br` e `www.tivexy.com.br`) ao
   **projeto da landing** (projeto → **Settings → Domains → Add**).

✅ `tivexy.com.br` abre a landing com cadeado.

---

## Passo 6 — Projeto do SaaS (`apps/web`) na Vercel

1. Vercel → escopo **tivexy** → **Add New… → Project** → importe o
   repositório **RurikDangelo/TivexyWebSite**.
2. Na tela de configuração:
   - **Project Name**: `tivexy-web`;
   - **Framework Preset**: Next.js;
   - **Root Directory**: clique em **Edit** → `apps/web`;
   - **Include source files outside of the Root Directory**: **ligado**;
   - _Build Command_ e _Install Command_: deixe o padrão.

   > O "include source files" não é detalhe. `apps/web` depende de
   > `@tivexy/core`, que é workspace do monorepo, e do `package-lock.json` da
   > raiz. Desligado, a Vercel envia só a pasta `apps/web` e o build morre em
   > `Cannot find module '@tivexy/core'`. A landing tem o mesmo arranjo.

3. **Environment Variables** (marque _Production_ e _Preview_):

   | Nome                                   | Valor                                                                  |
   | -------------------------------------- | ---------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://lddpqizqjvtimxmorxux.supabase.co`                             |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | a chave `sb_publishable_…`                                             |
   | `SUPABASE_SECRET_KEY`                  | a chave `sb_secret_…` — marque **Sensitive**                           |
   | `DATABASE_URL`                         | a URL do modo Transaction (6543) com `?pgbouncer=true` — **Sensitive** |

   São **quatro**, e só quatro — conferido no código, não de memória.
   `NEXT_PUBLIC_APP_URL` está no `.env.local` e **nenhuma linha a lê**: é
   sobra, não cadastre. `OPENAI_API_KEY` fica de fora enquanto a IA não
   existir.

4. **Não rode `vercel` na raiz do repositório.** O `.vercel/project.json` da
   raiz está ligado ao projeto **da landing** — o comando ali manda o deploy do
   SaaS para o projeto errado. Pela CLI, entre em `apps/web` antes.

5. **Deploy**. ✅ Termina **Ready**.
6. **Settings → Domains → Add**, um de cada vez:
   - `app.tivexy.com.br`
   - `*.tivexy.com.br`

   ✅ Os dois ficam com **Valid Configuration** (o curinga depende do Passo 5).

> A landing fica com `tivexy.com.br` e `www`; o SaaS com `app` e o curinga.
> Os nomes reservados (`app`, `www`, `admin`, `api`…) nunca viram empresa — o
> Core recusa esses subdomínios no cadastro.

---

## Passo 7 — Endereços de login no Supabase

Sem isto, entrar, recuperar senha e aceitar convite param no redirecionamento.

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: `https://app.tivexy.com.br`
3. **Redirect URLs → Add URL**, uma por vez:
   - `https://app.tivexy.com.br/**`
   - `https://*.tivexy.com.br/**`
   - (desenvolvimento, se quiser manter) `http://localhost:4390/**` — é a
     porta do `npm run dev:web`, não a 3000
4. **Save**.

---

## Passo 8 — E-mail de verdade (SMTP)

Sem SMTP o convite não sai por e-mail: o servidor embutido do Supabase só
entrega para a equipe da própria organização, poucas mensagens por hora.
Enquanto isso, o Admin gera o link e você repassa — funciona, não escala.

Exemplo com **Resend** (qualquer provedor SMTP serve):

1. Crie a conta em https://resend.com → **Domains → Add Domain** →
   `tivexy.com.br`.
2. Ela mostra registros **SPF (TXT)**, **DKIM (TXT)** e **MX** de retorno.
   Crie cada um na aba **DNS** do domínio na Vercel (Passo 5). Acrescente um
   **DMARC**: tipo TXT, nome `_dmarc`, valor
   `v=DMARC1; p=quarantine; rua=mailto:dmarc@tivexy.com.br`.
3. Espere o Resend marcar o domínio como **Verified**.
4. Resend → **API Keys → Create** (permissão _Sending access_). Copie a chave.
5. Supabase → **Authentication → Emails → SMTP Settings → Enable Custom SMTP**:
   - Sender email: `nao-responda@tivexy.com.br` · Sender name: `Tivexy`
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend` · Password: a chave do passo 4
   - **Save**.
6. Em **Authentication → Rate Limits**, suba o limite de e-mails por hora
   (ex.: 100).

✅ Teste: em `/recuperar`, peça a recuperação da sua própria conta — o e-mail
chega em minutos, fora do spam.

---

## Passo 9 — O primeiro Super Admin de produção

Se você já entra em `/admin` com a sua conta, pule este passo.

1. Na sua máquina, com o `.env` do Passo 0:
   ```bash
   npm run db:super-admin -- voce@tivexy.com.br "Seu Nome"
   ```
2. O terminal imprime um **link de acesso**. É credencial: abra você mesmo,
   no navegador, e não guarde nem cole em lugar nenhum. Vale uma vez.
3. Defina a senha na tela que abre.

✅ `https://app.tivexy.com.br/admin` abre a lista de clientes.

---

## Passo 10 — Conferir contra o banco real (o que tira o 🟡)

Faça com uma empresa de teste, não com cliente.

1. `/admin/clientes/novo` → crie **Café Teste** com o Blueprint _Cafeteria_,
   slug `cafe-teste`, e você como responsável (outro e-mail seu).
2. Copie o link de acesso da tela de sucesso, abra numa **janela anônima**,
   defina a senha. ✅ Cai no painel de `cafe-teste.tivexy.com.br`.
3. Faça o caminho do `/tutorial`: produto → entrada no estoque → venda no
   balcão → financeiro. ✅ Cada passo vira **Feito**, e o `/painel` mostra a
   venda de hoje.
4. **Suspensão:** no Admin, suspenda o Café Teste com um motivo. ✅ Na janela
   anônima, recarregue: aparece "Acesso suspenso" com o motivo. Reative.
5. Se qualquer coisa falhar, anote a tela e o texto do erro e me mande. A
   lista do que eu espero que possa falhar está em
   [[PROJECT_STATE#O que eu espero ver só contra o banco real]].
6. Deu tudo certo: em `docs/PROJECT_STATE.md` §4.2, troque 🟡 por ✅ nas
   entregas conferidas (ou me peça).

---

## Passo 11 — Segurança pendente

1. **Revogar o token da Vercel** colado em chat em 18–19/09: Vercel → avatar →
   **Account Settings → Tokens** → revogar os que você não reconhece. No
   projeto da landing, **Settings → Deployment Protection → Protection
   Bypass for Automation** → revogar o segredo gerado.
2. **Limpar variáveis que sobraram no projeto da landing**
   (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`,
   `STORE_TIMEZONE`, `SESSION_TTL_DAYS`): a landing não usa nenhuma. Remova
   só depois de confirmar que o SaaS (Passo 6) tem as suas próprias.
3. Supabase → **Advisors → Security Advisor**: rode e me mande o que aparecer.

---

## Depois — quando quiser (🔒 externos)

| Integração         | O que você providencia                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| WhatsApp / Meta    | Meta Business verificado, número dedicado, modelos de mensagem           |
| Emissão fiscal     | Certificado A1, inscrição estadual/municipal, CSC, contrato com provedor |
| Banco (Pix/boleto) | Conta PJ com API, credenciais e certificado do banco                     |
| IA                 | Chave da OpenAI com limite de gasto na conta                             |

O que falta de cada uma, lado a lado, está em `/integracoes` e em
[[10-INTEGRATIONS/INTEGRATIONS|INTEGRAÇÕES]].
