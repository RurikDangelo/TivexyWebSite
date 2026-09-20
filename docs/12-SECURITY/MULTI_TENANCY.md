# Multi-tenancy e isolamento

> Como um cliente é impedido de ver o dado de outro. Esquema em
> [[../02-ARCHITECTURE/DATABASE|DATABASE]]; migrations e testes em `supabase/`.

## A regra

**O isolamento é garantido no banco.**

Não em filtro de frontend. Não em `where tenant_id = ?` espalhado pelo código
da aplicação. Basta esquecer o filtro **uma vez**, em um endpoint, para vazar
dado entre clientes — e esse tipo de esquecimento não aparece em code review,
aparece em incidente.

Row Level Security move a garantia para um lugar onde esquecer é impossível:
a política vale para toda consulta, venha de onde vier.

## Modelo

```
tenant  = a empresa cliente. Unidade de isolamento.
usuário = pessoa. Pode pertencer a mais de um tenant.
vínculo = tenant_users. É o que concede acesso, e carrega o papel.
```

Uma pessoa vê um tenant quando tem vínculo **ativo** com ele. Convite pendente
(`status = 'invited'`) não lê dado nenhum — só depois do primeiro acesso o
vínculo vira `active`.

Exceção única: o **Super Admin** da Tivexy, que não pertence a tenant nenhum e
enxerga a plataforma inteira. É um sinalizador em `public.users`, não um papel
de tenant — um papel capaz de "ver tudo" seria escalada de privilégio esperando
alguém atribuí-lo por engano.

## Funções auxiliares

Todas `SECURITY DEFINER`, `STABLE`, com `search_path` fixo:

| Função                            | Responde                         |
| --------------------------------- | -------------------------------- |
| `is_super_admin()`                | É da equipe Tivexy?              |
| `user_tenant_ids()`               | Em quais tenants é membro ativo? |
| `is_tenant_member(tenant_id)`     | É membro deste tenant?           |
| `has_permission(tenant_id, code)` | Tem esta permissão neste tenant? |

### Por que `SECURITY DEFINER`

Uma política em `tenant_users` que consultasse `tenant_users` sob RLS entraria
em **recursão infinita**: para saber se pode ler a linha, o banco precisaria ler
a linha. `SECURITY DEFINER` faz a função rodar com os privilégios do dono, que
lê a tabela sem passar pela política.

### Por que `search_path` fixo

Sem `set search_path = ''`, quem controla o search_path da sessão consegue
apontar nomes não qualificados (`users`, `tenant_users`) para tabelas próprias
e fazer a função responder o que quiser. Por isso **todo nome dentro dessas
funções é qualificado** (`public.users`, não `users`).

Um teste de esquema falha se alguma função `SECURITY DEFINER` aparecer sem
`search_path` fixo.

## Padrão das políticas

```sql
-- Leitura: membro do tenant, ou plataforma
using (public.is_super_admin() or tenant_id in (select public.user_tenant_ids()))

-- Escrita: membro COM a permissão
using (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'))
with check (public.is_super_admin() or public.has_permission(tenant_id, 'crm.leads.write'))
```

`using` decide quais linhas a operação enxerga; `with check` decide se a linha
resultante é válida. **As duas são necessárias** num `UPDATE`: sem `with check`,
um membro poderia atualizar uma linha sua trocando o `tenant_id` — movendo o
registro para outro tenant.

`auth.uid()` vai sempre dentro de um subselect — `(select auth.uid())` — para
o Postgres avaliar uma vez por statement em vez de uma vez por linha.

## O que o RLS **não** cobre

Esta seção existe porque três brechas reais passaram pela primeira rodada de
testes. Todas tinham a mesma causa:

> **RLS decide quais LINHAS alguém enxerga.** Ele não verifica quais COLUNAS
> foram escritas, nem se os valores dentro da linha fazem sentido juntos.

### Coluna: RLS não restringe

Uma política de `UPDATE` com `with check (id = auth.uid())` aprova a linha —
e aprova qualquer coluna dentro dela. Foi assim que `users_update_self` deixou
qualquer pessoa autenticada escrever `is_super_admin = true` na própria linha e
virar plataforma.

O primitivo certo é **privilégio de coluna**, que falha fechado: o que não foi
concedido não existe.

```sql
revoke update on public.users from authenticated;
grant update (full_name, avatar_url, last_seen_at) on public.users to authenticated;
```

**Regra:** toda tabela com coluna sensível — que concede privilégio, muda
cobrança ou define identidade — restringe `UPDATE` por coluna. Não confie na
política.

A mesma forma apareceu em `public.tenants`: a política aprova a linha de quem
tem `core.tenant.write`, e liberava qualquer coluna. Um tenant **suspenso por
inadimplência se reativava sozinho** escrevendo no próprio `status`; `plan_id`
trocaria de plano sem passar pelo comercial; `slug` é o subdomínio e mudá-lo
quebra todos os links.

| Tabela    | `authenticated` atualiza                     | Fora de alcance                   |
| --------- | -------------------------------------------- | --------------------------------- |
| `users`   | `full_name`, `avatar_url`, `last_seen_at`    | `is_super_admin`, `email`, `id`   |
| `tenants` | `name`, `legal_name`, `document`, `settings` | `status`, `plan_id`, `slug`, `id` |

Um teste consulta `has_column_privilege` e falha se essa tabela mudar — cobre a
superfície, não só os casos que ocorreram a alguém.

### Coerência entre colunas: constraint, não política

A política olha o `tenant_id` da linha. Ela não sabe que o `role_id` ao lado
pertence a outro tenant.

Dois casos reais: um vínculo da Aurora carregando um papel próprio da Base (as
permissões desse papel valeriam na Aurora), e uma equipe da Base recebendo um
membro da Aurora.

Chave estrangeira composta não resolve quando um dos lados é opcional — papel de
sistema tem `tenant_id` nulo, e `MATCH SIMPLE` nunca casaria com ele. Nesses
casos, gatilho `BEFORE INSERT OR UPDATE`.

**Regra:** toda referência cruzada entre duas tabelas com `tenant_id` verifica
que os dois lados são do mesmo tenant.

### E vale para o `service_role`

O backend provisiona com `service_role`, que ignora RLS por definição. Um defeito
no código de provisionamento grava a linha com o `tenant_id` certo e valores
cruzados dentro — e nenhuma política é consultada. Só a constraint pega.

Por isso os testes de integridade rodam **sem RLS**, como superusuário: é o
cenário do backend.

## Regras para código novo

Toda tabela de negócio nasce com:

1. `tenant_id uuid not null references public.tenants (id)`
2. Índice em `tenant_id`
3. `alter table ... enable row level security`
4. Política de leitura por pertencimento
5. Política de escrita por permissão
6. **Teste de isolamento no mesmo commit**

Tabela sem RLS habilitado fica totalmente aberta. Um teste de esquema falha se
alguma tabela em `public` aparecer sem RLS ou sem nenhuma política.

## Autorização em duas camadas

RLS é a **última** linha de defesa, não a única.

| Camada      | Responsabilidade                                                                              |
| ----------- | --------------------------------------------------------------------------------------------- |
| Aplicação   | Verifica permissão antes de agir, devolve erro claro, não mostra o que a pessoa não pode usar |
| Banco (RLS) | Impede o acesso mesmo se a aplicação errar                                                    |

Esconder botão **não é** autorização. A verificação acontece no servidor, e o
teste de autorização chama a API direto, sem passar pela interface.

## Testes obrigatórios

Rodam em Postgres de verdade, a cada mudança (`npm run test:db`):

> **Isolamento** — usuário do Tenant B tenta **ler, inserir, atualizar e
> excluir** recurso do Tenant A → negado nos quatro casos.

Mais: não vaza usuário de outro tenant; não deixa forjar auditoria em nome de
outro tenant; convite pendente não dá acesso; visitante não autenticado não lê
nada; colaborador não altera o cadastro da empresa.

**Estado atual:** a suíte inteira passa contra Postgres 18 em WASM — contagem
atual em [[../PROJECT_STATE|PROJECT_STATE]].

**O que ainda não foi exercido:** `auth.uid()` real vindo de um JWT, e
comportamento sob concorrência real. O harness simula `auth.uid()` com uma
configuração de sessão — fiel ao contrato, não ao transporte. Quando o projeto
Supabase existir, o teste de isolamento roda também contra ele.

## O que nunca fazer

- Confiar em filtro de frontend para isolamento
- Criar tabela de negócio sem `tenant_id`
- Criar tabela sem habilitar RLS
- Usar `service_role` em código que roda no navegador — ela ignora RLS por
  definição, e vazar essa chave expõe todos os tenants de uma vez
- Dar `UPDATE` ou `DELETE` em `audit_logs`
- Escrever `SECURITY DEFINER` sem `search_path` fixo
- Deixar `UPDATE` de coluna sensível sem privilégio de coluna
- Referenciar outra tabela com `tenant_id` sem verificar que os dois lados são
  do mesmo tenant
