# Rodar o sistema nesta máquina

> Como subir o SaaS, entrar nele e ter o que olhar. Deploy é outra história e
> ainda está bloqueado — ver [[../PROJECT_STATE#6. Dependências externas]].

## O mínimo

```bash
npm install
npm run dev:web      # http://localhost:4390
```

A landing é `npm run dev:site`, na porta 4380. São dois apps independentes: um
não precisa do outro para subir.

**Nada aqui usa Docker.** Os testes de banco rodam em PGlite — Postgres
compilado para WASM — e o CLI do Supabase é dependência do monorepo.

## O que você precisa antes de conseguir entrar

Três coisas, e a ordem importa.

### 1. `.env` na raiz

Não está no git, e não pode estar. Copie de `.env.example` e preencha com o
painel do Supabase. As duas armadilhas estão descritas lá dentro — o colchete
que sobra do `[YOUR-PASSWORD]` e os caracteres que precisam de percent-encoding.

`apps/web/.env.local` sai das mesmas variáveis, com os prefixos que o Next
exige. A chave secreta vai **sem** `NEXT_PUBLIC_`.

### 2. Banco aplicado

```bash
npm run db:status    # confere sem escrever
npm run db:push      # aplica o que falta
```

### 3. O primeiro Super Admin

`is_super_admin` só pode ser escrito por quem já é Super Admin — a política
existe para ninguém se promover sozinho, e não abre exceção para o primeiro.
Então ele nasce de fora, uma vez:

```bash
node scripts/super-admin.mjs voce@email.com "Seu Nome"
```

O script cria a conta, marca como Super Admin e imprime um **link de acesso**.
Ele não manda e-mail: o projeto ainda não tem SMTP próprio, e o servidor
embutido do Supabase só escreve para membros da equipe.

> O link é credencial. Vale uma vez, vence, e não deve ser colado em chat,
> issue ou log.

Depois de entrar, defina uma senha em `/definir-senha`. A partir daí o login é
normal, em `/entrar`.

## Ter o que olhar: `scripts/demo.mjs`

Sistema novo não tem cliente nem dado, e as telas vazias mostram só os estados
vazios. Este script monta um cenário:

```bash
node scripts/demo.mjs voce@email.com   # monta e imprime o link
node scripts/demo.mjs --limpar         # remove tudo que ele criou
```

O que ele faz:

1. cria (ou reaproveita) sua conta e a marca como Super Admin
2. provisiona **`Clínica Sorriso (Demo)`** com o Blueprint da clínica
   odontológica, usando o executor de produção — o mesmo caminho da tela
3. liga você a esse cliente como `tenant_admin` ativo, para um login só ver as
   duas visões
4. põe quatro interessados na fila, em estados diferentes
5. imprime o link de acesso

### O que ele deliberadamente não faz

Não inventa faturamento, não cria oportunidade fechada, não preenche gráfico.
Os nomes carregam "Demo" e os e-mails usam `.invalid` — TLD reservado que
nunca resolve, então nenhum e-mail sai dali por acidente.

Dado de demonstração apresentado como dado real é o que o `CLAUDE.md` proíbe, e
um gráfico bonito com número inventado é a forma mais convincente de quebrar
essa regra.

### O cliente é da clínica por um motivo

É o nicho que mais **mostra** o Blueprint. Abra `/crm/leads` depois de entrar:
o título diz **"Interessados"**, não "Leads", e o botão diz "Novo interessado".
Isso vem do documento do nicho, gravado em `tenants.terms` no provisionamento.
Mesma tela, mesma tabela, sem fork.

Ver [[../04-CRM/CRM#O vocabulário do nicho]].

## Qual conta usar

**Esta máquina é das contas pessoais.** O notebook é o da NIT. Um Super Admin
criado com o e-mail corporativo aqui é engano — aconteceu em 24/09/2026 e a
conta teve de ser removida do projeto.

Os endereços de cada serviço **não ficam neste repositório**, de propósito: ele
é público, e mapear serviço → e-mail de login entrega metade do trabalho a quem
estiver tentando entrar. Identificador de projeto (`ref`, `team_…`) é público
por desenho e pode ficar.

## O que não dá para fazer daqui

|                              | Por quê                     |
| ---------------------------- | --------------------------- |
| Receber o convite por e-mail | SMTP 🔒                     |
| Publicar na Vercel           | conector na conta errada 🔒 |
| Rodar o CI                   | PR não aberto 🔒            |

Todos estão na tabela de dependências externas do
[[../PROJECT_STATE#6. Dependências externas]].

## Conferir que está tudo de pé

```bash
npm run validate
```

Tipos, lint, build dos dois apps e a suíte inteira. Verde antes de commitar, e
verde depois.
