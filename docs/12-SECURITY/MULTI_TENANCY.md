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

**Estado atual:** 40 testes passando contra Postgres 18 em WASM.

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
