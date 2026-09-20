# Provisionamento de tenant

> **Prioridade zero.** É o fluxo que transforma a plataforma em operação SaaS de
> verdade: sem ele, não existe cliente. Vem antes de qualquer módulo de negócio
> (ver [[../16-DECISIONS/ADR-002-ordem-de-construcao|ADR-002]]).
>
> **Estado:** o fluxo existe e roda contra Postgres. `planProvisioning()` decide
> e `apps/web/src/server/provisioning/execute.ts` escreve — os dois são código
> de produção, e o teste importa os mesmos módulos que o servidor vai importar.
> Falta o gatilho da interface, que depende de autenticação.
> Ver [[../PROJECT_STATE|PROJECT_STATE]].

## As duas metades

**Decidir** é puro e mora no Core: o que fazer, em que ordem, e o que recusar.
Testável sem banco, e conferido contra as constraints que o banco tem.

**Fazer** é o executor: só escreve, não decide. Não há um `if` de regra de
negócio nele. Recebe o cliente de banco por parâmetro, e é por isso que o teste
consegue rodar o **código de produção** contra um Postgres em WASM, sem
Supabase e sem credencial.

Enquanto as duas viviam juntas, o que rodava no teste era uma segunda
implementação que a produção teria que escrever de novo — e as duas podiam
divergir sem aviso.

### A identidade vem de fora

`IdentityPort` é a fronteira, e ela existe porque **não dá para criar usuário
por SQL**: a identidade vive em `auth.users`, que é do Supabase, e criá-la
envolve senha, confirmação e convite. Em produção isto é a Auth Admin API.

`public.users` é espelho, preenchido pelo gatilho `mirror_auth_user` — sem ele,
quem se cadastrasse existiria para a autenticação e não para a aplicação.

O método é `ensureUser`, não `createUser`: quem administra dois clientes é a
mesma pessoa, e criar um segundo usuário com o mesmo e-mail partiria a
identidade dela em duas.

## O fluxo

```
Super Admin autentica
   → cria tenant
   → dados da empresa
   → escolhe plano
   → habilita módulos
   → cria administrador do tenant
   → provisiona recursos e configurações padrão
   → registra auditoria
   → envia convite
   → administrador acessa
   → onboarding
   → tenant operacional
```

## Etapas

A execução é dividida em etapas nomeadas, uma linha por etapa em
`provisioning_steps`. É isso que permite retomar de onde parou.

| #   | Etapa            | O que faz                                       | O que a compensação desfaz |
| --- | ---------------- | ----------------------------------------------- | -------------------------- |
| 1   | `create_tenant`  | Cria o tenant em `status = 'provisioning'`      | Remove o tenant            |
| 2   | `apply_plan`     | Vincula o plano contratado                      | Desvincula                 |
| 3   | `enable_modules` | Habilita em `tenant_modules` o que o nicho pede | Desabilita                 |
| 4   | `create_roles`   | Cria os papéis do nicho e suas permissões       | Remove os papéis           |
| 5   | `create_admin`   | Garante a identidade e cria o vínculo `invited` | Remove vínculo e usuário   |
| 6   | `seed_defaults`  | Dados iniciais do nicho                         | Remove o que criou         |
| 7   | `send_invite`    | Dispara o convite e registra auditoria          | Invalida o convite         |

### Por que `create_roles` é etapa própria

Ela entrou quando o Blueprint passou a trazer papéis do nicho. Criá-los dentro
de `seed_defaults` faria uma falha ao criar papel aparecer como "falha ao semear
padrões" — o que manda quem está investigando olhar no lugar errado.

**Cada etapa existe para ser o nome de um problema.** Quando uma delas deixa de
distinguir dois problemas diferentes, é hora de separar.

`apply_plan` é o caso oposto e continua junto: o plano entra na mesma escrita
que cria o tenant. A etapa fica registrada como `skipped` — não rodou, e não era
para rodar. Deixá-la `pending` diria "faltou fazer" sobre algo já feito.

**O tenant só passa para `active` quando todas as etapas concluem.** Um tenant
que falhou no meio fica em `provisioning` — visível no painel, não operacional,
e retomável.

## As garantias, e onde elas moram

Nenhuma delas depende de a aplicação lembrar. Todas são sustentadas por
constraint no banco:

| Garantia            | Como o esquema sustenta                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Idempotência**    | `provisioning_runs.idempotency_key` UNIQUE. A mesma chave devolve a execução existente em vez de criar um segundo tenant. |
| **Exclusividade**   | Índice parcial: uma execução viva por tenant. Duas simultâneas se atropelariam.                                           |
| **Retomada**        | `UNIQUE (run_id, step)`. Retomar pula o que já concluiu.                                                                  |
| **Compensação**     | `provisioning_steps.result` guarda os ids criados — é o que o desfazer precisa.                                           |
| **Coerência**       | Execução terminada exige `finished_at`; execução viva exige que ele seja nulo.                                            |
| **Observabilidade** | `attempts`, `current_step`, `last_error` e `error` por etapa.                                                             |

### Sobre a chave de idempotência

Quem chama gera a chave, não o servidor. Um duplo clique no botão, um retry de
rede ou um reenvio de fila usam a **mesma** chave e obtêm a **mesma** execução.

Sem isso, o cliente ganha dois tenants e a cobrança fica errada.

## Retomada

Ao retomar uma execução que falhou:

1. `status` volta para `running`, `attempts` incrementa
2. `finished_at` volta a ser **nulo** — a execução deixou de estar terminada
3. As etapas `succeeded` são puladas
4. A execução recomeça da etapa que falhou

> O passo 2 não é detalhe. A primeira versão da retomada esquecia disso, e a
> constraint `provisioning_runs_finished_consistency` recusou a operação — um
> estado inconsistente pego pelo banco antes de existir aplicação.

## Compensação

Quando uma execução falha e não vai ser retomada, o que já teve efeito precisa
ser desfeito, na ordem inversa. Cada etapa concluída guarda em `result` o que
criou:

```json
{ "userId": "…", "membershipId": "…" }
```

A execução passa por `compensating` e termina em `compensated`. Etapas desfeitas
ficam com `status = 'compensated'`, não são apagadas — o histórico da falha é
parte da auditoria.

Três decisões que o esquema impõe:

1. **`compensating` não é terminal.** Vindo de `failed`, que é, `finished_at`
   precisa voltar a nulo — a mesma armadilha da retomada, e a constraint recusa
   de novo.
2. **O tenant é cancelado, não apagado.** `provisioning_runs.tenant_id` é
   `on delete cascade`: apagar o tenant levaria junto a execução e as etapas,
   ou seja, a evidência do que deu errado.
3. **Compensar ocupa o tenant.** `compensating` está no índice parcial, então
   nenhuma execução nova entra enquanto o desfazer acontece. Depois, como
   `compensated` é terminal e sai do índice, o cliente pode tentar de novo.

O fluxo inteiro está provado em `supabase/tests/provisioning.test.mjs`,
incluindo a ordem inversa e o que **não** se compensa: etapa que nunca rodou.

## Autorização

Provisionar é **operação de plataforma**. As políticas de RLS em
`provisioning_runs` e `provisioning_steps` permitem escrita apenas ao Super
Admin; a implementação roda no backend com `service_role`.

O tenant **lê** o próprio estado de provisionamento — o painel precisa mostrar
"preparando sua conta" e, se falhar, dizer isso em vez de mentir. Mas não
escreve nele.

## Auditoria

Toda operação do fluxo entra em `audit_logs` com `tenant_id`, ação, recurso e
metadados. Sem credencial, sem token, sem senha no `metadata`.

## Onboarding

O administrador recebe o convite, define a senha e faz o primeiro acesso. **Só
então** o vínculo passa de `invited` para `active` e ele enxerga dado — antes
disso, `user_tenant_ids()` não o retorna e o RLS não libera nada.

## Definition of Done

- [ ] Fluxo completo funcionando ponta a ponta
- [ ] Idempotência comprovada por teste
- [ ] Falha no meio não deixa tenant quebrado nem ativo
- [ ] Retomada não repete etapa concluída
- [ ] Compensação implementada para as etapas com efeito externo
- [ ] Estado visível no painel, incluindo falha
- [ ] Auditoria registrando cada transição
- [ ] **Teste E2E:** Super Admin cria tenant → administrador recebe convite →
      faz login → consegue operar
- [ ] Convite chegando na caixa de entrada, não em spam (🔒 depende de SPF/DKIM/DMARC)

## O que já está provado

**Com o código de produção.** `supabase/tests/blueprint-provisioning.test.mjs`
importa `planProvisioning` e `executeProvisioning` — os mesmos módulos que o
servidor vai importar — e os roda contra Postgres de verdade:

- cada nicho do repositório provisiona, e o resultado é o que o blueprint declara
- a mesma chave devolve a execução existente e não escreve de novo
- uma linha por etapa, inclusive as que nem chegaram a rodar
- falha no meio deixa o cliente em `provisioning` e o que já foi escrito fica
- a mesma pessoa administrando dois clientes é uma pessoa só

**Com um modelo.** `supabase/tests/provisioning.test.mjs` continua exercitando
retomada e compensação, que o executor ainda não implementa. O modelo prova que
o esquema as sustenta; quando o executor as ganhar, os testes migram para ele.

**O que ainda não foi exercido:** envio de e-mail de verdade, a Auth Admin API
do Supabase por trás do `IdentityPort`, e concorrência real.

## Dependências externas 🔒

| Dependência                           | Bloqueia                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Projeto Supabase                      | Aplicar as migrations, autenticação, tudo                                               |
| E-mail corporativo com SPF/DKIM/DMARC | O convite chegar. Sem isso o provisionamento "funciona" e o cliente não consegue entrar |
