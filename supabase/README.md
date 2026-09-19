# supabase/

Esquema do banco do Tivexy Core: migrations versionadas e os testes que provam
que elas funcionam.

O banco é infraestrutura **compartilhada**, não pertence a `apps/web`. Por isso
mora na raiz do monorepo, no diretório que o Supabase CLI espera.

## Estado

As migrations **não foram aplicadas em nenhum projeto Supabase** — ele ainda não
existe (ver `docs/PROJECT_STATE.md` §6). O que já existe é mais forte do que
"escrito": elas rodam contra um Postgres 18 de verdade e passam em 68 testes,
incluindo os de isolamento entre tenants.

O que ainda não foi exercido: `auth.uid()` real vindo de um JWT, e o
comportamento sob concorrência real. O harness simula `auth.uid()` com uma
configuração de sessão, que é fiel ao contrato mas não ao transporte.

## Estrutura

```
supabase/
├── migrations/
│   ├── 20260919020000_core_foundation.sql        tipos e trigger de updated_at
│   ├── 20260919020100_core_tenancy.sql           planos, módulos, tenants
│   ├── 20260919020200_core_identity_rbac.sql     usuários, papéis, permissões, vínculos
│   ├── 20260919020300_core_audit_provisioning.sql auditoria e provisionamento
│   ├── 20260919020400_core_rls.sql               Row Level Security
│   ├── 20260919020500_core_catalog.sql           catálogo da plataforma
│   └── 20260919030000_core_viewer.sql            contexto de acesso da requisição
└── tests/
    ├── harness.mjs             sobe Postgres em WASM e simula o que o Supabase oferece
    ├── core.test.mjs           32 testes: esquema, RLS, isolamento, integridade
    ├── provisioning.test.mjs    8 testes: o fluxo ponta a ponta
    ├── contracts.test.mjs      11 testes: TypeScript × catálogo SQL
    └── viewer.test.mjs         17 testes: contexto de acesso e vazamento
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
constantes de `@tivexy/core` nos dois sentidos.

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

## Quando o projeto Supabase existir

1. `supabase link --project-ref <ref>`
2. `supabase db push` — aplica as migrations
3. Conferir os avisos de segurança e performance no painel
4. Gerar os tipos: `supabase gen types typescript` → `packages/types`
5. Rodar o teste de isolamento **contra o projeto real**, não só no PGlite

Enquanto isso, `npm run test:db` é a rede de segurança. Toda mudança de esquema
entra junto com o teste que a prova.
