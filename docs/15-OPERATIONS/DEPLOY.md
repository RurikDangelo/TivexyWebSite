# Deploy do SaaS na Vercel

> O primeiro deploy do `apps/web`. A landing (`apps/site`) já está no ar e tem
> projeto próprio — são **dois projetos Vercel**, e é assim que deve ser.
>
> Para rodar na sua máquina, ver [[RODAR-LOCAL]].

## Antes de começar

Duas coisas precisam ser verdade, e nenhuma das duas se resolve por código.

### 1. Estar logado na conta certa

Tudo do Tivexy — GitHub, Vercel — vive na conta **pessoal**. Nada disto é da
NIT. Se a Vercel responder

```
Not authorized: Trying to access resource under scope "tivexy".
You must re-authenticate to this scope
```

é conta errada, não permissão faltando. Sair e entrar resolve.

### 2. Decidir de qual branch sai a produção

O trabalho está em `monorepo-tivexy-core`. `main` não tem nada disso.

Por padrão a Vercel publica em produção o que chega na branch de produção —
normalmente `main` — e gera **preview** para as outras. Três saídas:

| Saída                                                    | Quando faz sentido                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Abrir o PR e mesclar em `main`                           | O certo. O CI roda pela primeira vez e valida os commits em máquina limpa. |
| Apontar a branch de produção para `monorepo-tivexy-core` | Para ver no ar hoje, sabendo que é provisório.                             |
| Não mexer e usar o preview                               | Para só olhar. O preview tem URL própria e não vira o endereço oficial.    |

Preview é o mais seguro para o primeiro deploy: se algo quebrar, não quebra
nada que já esteja no ar.

## Passo 1 — criar o projeto

Na Vercel, **Add New → Project**, importe `RurikDangelo/TivexyWebSite`.

O repositório já tem um projeto (a landing). Importar de novo cria um
**segundo**, e é isso que se quer: dois apps, dois builds, dois deploys.

Na tela de configuração:

| Campo                                                  | Valor                            | Por quê                                         |
| ------------------------------------------------------ | -------------------------------- | ----------------------------------------------- |
| Project Name                                           | `tivexy-web` (ou o que preferir) | Não pode colidir com o da landing               |
| Framework Preset                                       | Next.js                          | Detecta sozinho                                 |
| **Root Directory**                                     | `apps/web`                       | Sem isto ele tenta construir a raiz do monorepo |
| **Include source files outside of the Root Directory** | **ligado**                       | Ver abaixo                                      |

### Por que "include source files outside" é obrigatório aqui

`apps/web` depende de `@tivexy/core`, que é um workspace do monorepo, e do
`package-lock.json` da raiz. Com a opção desligada, a Vercel envia só a pasta
`apps/web` — e o build falha em `Cannot find module '@tivexy/core'`.

A landing tem o mesmo arranjo e funciona assim.

## Passo 2 — as variáveis de ambiente

O `apps/web` lê **quatro**, e só quatro. Elas saem de
Supabase → Project Settings.

| Variável                               | Onde achar          | Cuidado                                      |
| -------------------------------------- | ------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Settings → API      | `https://<ref>.supabase.co`                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API      | Começa com `sb_publishable_`                 |
| `SUPABASE_SECRET_KEY`                  | Settings → API      | Começa com `sb_secret_`                      |
| `DATABASE_URL`                         | Settings → Database | Pooler em **modo transação**, porta **6543** |

São as mesmas do seu `apps/web/.env.local`. Cadastre em **Production** e
**Preview** — preview sem variável constrói e não abre.

### Os dois enganos que o código recusa

**A chave secreta nunca leva `NEXT_PUBLIC_`.** Com o prefixo ela vai no pacote
do navegador e qualquer visitante lê o banco inteiro, todos os tenants. O
`lib/env.ts` recusa a subir se achar uma chave `sb_secret_` na variável
pública — mas não conte com isso: confira ao colar.

**`DATABASE_URL` é a porta 6543, não a 5432.** A 5432 é modo sessão e serve
para migration; em função serverless ela esgota conexão. A 6543 é modo
transação, que é o que o provisionamento usa.

> A senha do banco costuma ter `]`, `*`, `#` ou `?`. Cole **crua** —
> `connection-url.ts` faz o percent-encoding. E confira que não sobrou o `]`
> do marcador `[YOUR-PASSWORD]`: isso responde `password authentication
failed`, que parece senha errada e não é.

### Uma que **não** precisa

`NEXT_PUBLIC_APP_URL` está no `.env.local` e **nenhum código a lê**. É sobra.
Não cadastre; e um dia vale tirar do arquivo.

## Passo 3 — ensinar o Supabase sobre o endereço novo

**Este é o passo que todo mundo esquece, e ele quebra o login.**

O fluxo de entrada volta para `/auth/callback`. O Supabase só redireciona para
endereços que estão na lista de permitidos — qualquer outro é recusado, e a
pessoa fica presa numa tela que não explica nada.

Em Supabase → Authentication → URL Configuration:

- **Site URL**: o endereço de produção, ex. `https://tivexy-web.vercel.app`
- **Redirect URLs**: acrescente
  - `https://tivexy-web.vercel.app/**`
  - `http://localhost:4390/**` — para continuar entrando na sua máquina
  - o padrão de preview, se for usar: `https://*-tivexy.vercel.app/**`

A recuperação de senha monta o retorno a partir do host da requisição, então
ela passa a apontar para o domínio de produção sozinha — desde que ele esteja
nessa lista.

## Passo 4 — publicar

Clique **Deploy** e acompanhe o log.

Pela CLI, **de dentro de `apps/web`**:

```bash
cd apps/web
npx vercel link
npx vercel        # preview
npx vercel --prod # produção
```

> **Não rode `vercel` na raiz do repositório.** O `.vercel/project.json` da
> raiz está ligado ao projeto **da landing** — rodar ali manda o comando para
> o projeto errado.

## Passo 5 — conferir que subiu de pé

Na ordem, porque cada um depende do anterior:

1. **Abre?** A raiz redireciona para `/entrar`. Se aparecer erro de
   configuração nomeando uma variável, é o passo 2.
2. **Entra?** Rode `node scripts/super-admin.mjs seu@email.com "Seu Nome"` —
   ele imprime um link de acesso. Se o link devolver para o lugar errado, é o
   passo 3.
3. **`/admin` abre?** Só Super Admin alcança. Se cair em `/painel`, a conta
   não foi promovida.
4. **Criar cliente funciona?** É o teste que exercita `DATABASE_URL`. Falhar
   aqui com "DATABASE_URL não está definida" é o passo 2.
5. **`/crm/leads` do cliente diz o vocabulário do nicho?** Se a clínica ler
   "Interessados", o Blueprint chegou inteiro até a produção.

## O que **não** vai funcionar depois do deploy

Não é defeito. São dependências externas, e estão na tabela do
[[../PROJECT_STATE#6. Dependências externas]].

|                         | Por quê                                            | O que fazer                                                       |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Convite por e-mail      | SMTP embutido do Supabase só escreve para a equipe | Cadastrar SMTP próprio; até lá, repassar o link de acesso à mão   |
| Domínio `tivexy.com.br` | Não registrado/apontado                            | Registrar e apontar o DNS                                         |
| Subdomínio por cliente  | Depende do domínio                                 | `acme.tivexy.com.br` só funciona com wildcard no DNS e no projeto |
| WhatsApp, IA, fiscal    | Credenciais                                        | Cada um na sua vez                                                |

O **subdomínio por cliente** merece atenção: `tenantSlugFromHost()` já lê o
primeiro rótulo do host, e em `vercel.app` isso não funciona — o endereço é
`tivexy-web.vercel.app`, e `tivexy-web` não é tenant. Até o domínio próprio
existir, quem participa de uma empresa só cai nela automaticamente, e quem
participa de várias escolhe em `/empresas`. O sistema já trata os dois casos.

## Depois do primeiro deploy

Atualize [[../PROJECT_STATE]]: o item "Projeto Vercel do `apps/web`" sai da
tabela de dependências externas, e a seção do SaaS ganha a URL.
