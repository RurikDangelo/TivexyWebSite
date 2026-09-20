# supabase/

Esquema do banco do Tivexy Core: migrations versionadas e os testes que provam
que elas funcionam.

O banco é infraestrutura **compartilhada**, não pertence a `apps/web`. Por isso
mora na raiz do monorepo, no diretório que o Supabase CLI espera.

## Estado

O projeto Supabase **existe**: `tivexy-core`, ref `lddpqizqjvtimxmorxux`,
região `sa-east-1`. As migrations ainda **não foram aplicadas nele** — ver
"Aplicar no projeto" abaixo.

O que já existe é mais forte do que "escrito": elas rodam contra um Postgres 18
de verdade e passam em 126 testes, incluindo os de isolamento entre tenants.

O que ainda não foi exercido: `auth.uid()` real vindo de um JWT, e o
comportamento sob concorrência real. O harness simula `auth.uid()` com uma
configuração de sessão, que é fiel ao contrato mas não ao transporte.

## Estrutura

```
supabase/
├── config.toml                gerado por `supabase init` — ver nota abaixo
├── migrations/
│   ├── 20260919020000_core_foundation.sql        tipos e trigger de updated_at
│   ├── 20260919020100_core_tenancy.sql           planos, módulos, tenants
│   ├── 20260919020200_core_identity_rbac.sql     usuários, papéis, permissões, vínculos
│   ├── 20260919020300_core_audit_provisioning.sql auditoria e provisionamento
│   ├── 20260919020400_core_rls.sql               Row Level Security
│   ├── 20260919020500_core_catalog.sql           catálogo da plataforma
│   ├── 20260919030000_core_viewer.sql            contexto de acesso da requisição
│   ├── 20260919040000_core_integrity_hardening.sql  privilégio de coluna e gatilhos
│   ├── 20260919050000_core_tenant_column_privileges.sql  colunas da plataforma
│   └── 20260920010000_core_mirror_auth_users.sql     o perfil nasce com a identidade
└── tests/
    ├── harness.mjs             sobe Postgres em WASM e simula o que o Supabase oferece
    ├── core.test.mjs           32 testes: esquema, RLS, isolamento, integridade
    ├── provisioning.test.mjs   18 testes: o fluxo, a retomada e a compensação
    ├── contracts.test.mjs      18 testes: TypeScript × catálogo, constraints e docs
    ├── viewer.test.mjs         17 testes: contexto de acesso e vazamento
    ├── integrity.test.mjs      21 testes: tentativas de burlar, não de usar
    └── blueprint-provisioning.test.mjs  20 testes: provisionar por nicho
```

## Testes

```bash
npm run test:db
```

Rodam em **PGlite**: Postgres compilado para WASM, dentro do Node. Sem Docker,
sem servidor, cerca de 1,7 s. Isso importa porque torna barato rodar o teste de
isolamento a cada mudança — e teste caro é teste que ninguém roda.

O harness recria o que o Supabase já entrega pronto: o schema `auth`, a função
`auth.uid()` e os papéis `anon`, `authenticated` e `service_role`. Todo o resto
é Postgres puro e se comporta igual em produção.

### O que os testes cobrem

**Esquema** — RLS habilitado em todas as tabelas; nenhuma tabela sem política;
`search_path` fixo em toda função `SECURITY DEFINER`.

**Isolamento entre tenants** — o teste obrigatório, nas quatro operações:

> Usuário do Tenant B tenta ler, inserir, atualizar e excluir recurso do
> Tenant A → negado nos quatro casos.

Mais: não vaza usuário de outro tenant, e não deixa forjar auditoria em nome de
outro tenant.

**Escopo de acesso** — convite pendente não dá acesso; Super Admin enxerga a
plataforma; visitante não lê nada; colaborador não altera o cadastro da empresa;
`has_permission` responde conforme o papel.

**Auditoria** — aceita inserção do próprio tenant e recusa edição e exclusão.

**Provisionamento** — chave de idempotência impede execução duplicada; só uma
execução viva por tenant; execução terminada exige data de fim; retomar não
duplica etapa; o tenant lê o próprio estado mas não escreve nele.

**Provisionamento ponta a ponta** — `provisioning.test.mjs` roda um modelo do
fluxo real (criar tenant → aplicar plano → habilitar módulos → criar
administrador → configurações padrão → convite) e prova que o esquema sustenta
as garantias: o tenant só vira `active` no fim; a mesma chave não cria um
segundo tenant; uma falha no meio para o fluxo sem deixar o tenant ativo; a
retomada executa **só** as etapas que faltavam; cada etapa guarda o que a
compensação precisaria desfazer.

> Esse teste já pagou por si: a constraint `provisioning_runs_finished_consistency`
> recusou a primeira versão da retomada, que esquecia de limpar `finished_at` ao
> voltar para `running`. Um bug de estado inconsistente pego antes de existir
> aplicação.

**Compensação** — o caminho oposto da retomada: desfazer o que já teve efeito
quando a execução falhou e não vai continuar. Desfaz na **ordem inversa**; a
etapa desfeita vira `compensated` em vez de sumir (o histórico da falha é a
parte que mais interessa depois); etapa que nunca rodou não é compensada; o
tenant é **cancelado, não apagado**, porque `provisioning_runs.tenant_id` é
`on delete cascade` e apagar levaria junto a evidência.

Dois cortes de estado que só aparecem em teste: `compensating` entra no índice
parcial, então nenhuma execução nova começa durante o desfazer; e `compensated`
sai dele, então o cliente cujo provisionamento falhou pode tentar de novo.

> A mesma armadilha da retomada reaparece aqui, e há um teste só para ela:
> vindo de `failed`, entrar em `compensating` sem limpar `finished_at` é
> recusado pela constraint. `compensating` está desfazendo — ainda não terminou.

**Provisionamento por nicho** — `blueprint-provisioning.test.mjs` prova o marco
do ADR-003: provisionar a partir dos blueprints **reais** do repositório, e o
resultado diferir só no que o blueprint declara. Cafeteria e clínica nascem com
módulos e papéis diferentes; o mesmo nicho provisionado duas vezes nasce igual
(se divergisse, haveria decisão fora do documento).

Duas garantias que só aparecem aqui:

- **O blueprint não passa por cima do comercial.** Pedir módulo fora do plano é
  recusado, e recusado **antes** de criar o tenant — cortesia existe, mas é
  decisão comercial explícita, não algo que um nicho concede em silêncio para
  todos os clientes dele.
- **O papel do nicho pertence ao tenant.** `roles.tenant_id` nulo é papel de
  sistema, disponível para todo mundo; um papel de nicho vazando para lá daria
  "Barista" a uma clínica.

As sementes de negócio ficam **registradas como pendentes**, com o motivo: as
tabelas de CRM e ERP não existem ainda, e fingir que foram semeadas é
exatamente o que este projeto proíbe.

**Integridade** — formato de slug, documento só com dígitos, consistência de
data de entrada, pessoa não entra duas vezes no mesmo tenant, papel de sistema
não pertence a tenant.

**Contexto da requisição** — `current_viewer()` devolve o formato do `Viewer` de
`@tivexy/core` e alimenta `decideAccess()` sem adaptação. Como a função é
`SECURITY DEFINER` (roda por fora do RLS), o que a torna segura é o filtro por
`auth.uid()` — e cada corte tem teste: estranho não descobre nem que o tenant
existe; membro de um tenant não vê nada do outro; convite pendente vê o nome da
empresa mas não ganha permissão nem descobre os módulos contratados.

**Contratos** — `contracts.test.mjs` compara os códigos do catálogo com as
constantes de `@tivexy/core` nos dois sentidos. Compara também as regras que os
dois lados duplicam: `isActive()` contra o predicado do índice parcial, e
`isTerminal()` contra a constraint de `finished_at`. Se divergirem, a aplicação
diz "pode começar outra execução" e o banco recusa com violação de unicidade —
que chega ao usuário como falha genérica, no pior momento possível.

O do subdomínio é de forma diferente, e vale entender por quê. A propriedade
não é "os dois aceitam as mesmas entradas": o Core **normaliza** antes de
validar, então `CAFE` vira `cafe` e é `cafe` que chega ao banco. O que precisa
valer é mais fraco e mais útil:

> O Core nunca produz um slug que o banco recusaria.

Ser mais rígido que o banco é aceitável — é uma recusa mais cedo, com mensagem
melhor. Ser mais frouxo é o que produz violação de constraint no meio do
provisionamento, com o tenant já criado.

**Tentativas de burlar** — `integrity.test.mjs` não pergunta se o RLS funciona;
pergunta o que ele **não** cobre. Foi assim que seis falhas apareceram, uma
delas crítica: qualquer pessoa autenticada podia se tornar Super Admin
escrevendo na própria linha, porque RLS aprova a linha e não olha a coluna.

Parte dele roda **sem RLS**, como superusuário — que é como o backend roda com
`service_role`. Nesse caminho nenhuma política é consultada, e só a constraint
pega um dado cruzado entre tenants.

Inclui uma guarda para a classe inteira: um teste consulta
`has_column_privilege` e fixa quais colunas o papel `authenticated` pode
atualizar. Coluna sensível nova sem privilégio pensado falha ali.

## Decisões que valem saber

**Isolamento é no banco.** Nunca em filtro de frontend, nunca em
`where tenant_id = ?` espalhado pelo código. Esquecer o filtro uma vez vaza
dado entre clientes; esquecer uma política é pego pelo teste de esquema.

**Super Admin não é papel de tenant.** É um sinalizador em `public.users`. Um
papel de tenant capaz de "ver tudo" seria escalada de privilégio esperando
alguém atribuí-lo por engano.

**Permissão é dado, não código.** `permissions` é catálogo e `role_permissions`
é a ligação — um tenant pode ter papel próprio sem deploy.

**As funções auxiliares são `SECURITY DEFINER` com `search_path` fixo.** Sem
`SECURITY DEFINER`, uma política em `tenant_users` que consulta `tenant_users`
entra em recursão infinita. Sem `search_path` fixo, quem controla o search_path
da sessão redireciona os nomes e escala privilégio. Um teste verifica isso.

**Idempotência mora no esquema.** `idempotency_key` com UNIQUE é o que impede
uma requisição repetida criar dois tenants. Um índice parcial impede duas
execuções vivas no mesmo tenant. Regra que depende de a aplicação lembrar não
é regra.

**Catálogo em migration, demo em seed.** Módulos, permissões, papéis e planos
são dados de referência: o sistema não funciona sem eles, nem em produção. Dado
fictício de tenant demo é outra coisa e vai para `seed.sql`.

## Aplicar no projeto

O CLI do Supabase está no monorepo como devDependency — não precisa de
instalação global, nem de Docker (Docker só é exigido por `supabase start`,
que não usamos).

```bash
npx supabase login    # abre o navegador; a credencial fica na sua máquina
npm run db:link       # vincula ao ref lddpqizqjvtimxmorxux
npm run db:push       # aplica as 9 migrations, na ordem dos nomes
npm run db:types      # gera apps/web/src/lib/database.types.ts
```

`db:link` pede a senha do banco. Ela é sua: não passa pelo chat, não entra em
arquivo do repositório, não vira variável de ambiente aqui.

Depois do push:

1. Conferir os avisos de segurança e performance no painel
2. Rodar o teste de isolamento **contra o projeto real**, não só no PGlite
3. Confirmar a versão do Postgres do projeto — os testes rodam em 18, e nada
   do esquema depende de recurso exclusivo dele, mas divergência silenciosa
   entre o que se testa e o que roda é como bug de produção começa

### Por que `config.toml` tem 400 linhas que não usamos

`supabase init` gera o arquivo inteiro, com os padrões do stack local. O `link`
e o `push` exigem que ele exista. Podar à mão criaria divergência a cada
atualização do CLI e ganharia pouco: o arquivo é gerado, não escrito.

Só duas coisas ali são decisão nossa: `project_id = "tivexy"` (prefixo dos
contêineres locais) e `[db] major_version`. O resto vale para `supabase start`,
que este projeto não usa.

A configuração de **auth do projeto remoto** mora no painel, não aqui. O que
está em `[auth]` neste arquivo só afeta o stack local.

### Onde vão os tipos gerados

`apps/web/src/lib/database.types.ts` — não em `packages/`. Hoje há um único
consumidor, e a regra do monorepo é clara: package só quando houver
compartilhamento real, não para deixar organizado. Quando um segundo consumidor
aparecer (um serviço, um worker), aí o arquivo sobe para um package.

---

Até o push acontecer, `npm run test:db` é a rede de segurança. Toda mudança de
esquema entra junto com o teste que a prova.
