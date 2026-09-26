# Clientes no Admin — editar, suspender, reativar, trocar plano

🟡 testado, não verificado contra o banco real (25/09/2026). Migration:
`20260925140000_admin_tenant_management`. Tela: `/admin/clientes/[id]`.

A lista de `/admin` leva à página de cada cliente, com cinco partes: situação,
plano e módulos, dados, provisionamentos e decisões da plataforma.

## Suspender corta a API, não só a tela

**O defeito que existia:** a suspensão só valia na aplicação.
`has_permission()` conferia o vínculo da pessoa e não a situação da empresa —
quem tinha sessão numa empresa suspensa era mandado para `/preparando` pela
tela, e continuava lendo e escrevendo CRM, vendas e financeiro pela API REST,
com o mesmo token. Suspensão que só a tela respeita é placa, não porta.

**Agora `has_permission()` exige empresa ativa.** Toda política de dado de
negócio passa por ela, então suspender corta a API junto com a tela. O que
continua legível é o que a pessoa precisa para entender o que aconteceu: a
linha da própria empresa (nome, situação e o motivo) e o próprio vínculo.
Nada é apagado; reativar devolve tudo.

O teste (`supabase/tests/admin.test.mjs`) lê e escreve pela sessão da empresa
antes e depois de suspender; tirar a linha nova de `has_permission()` faz ele
falhar.

## As operações

Cada uma é função do banco que confere `is_super_admin()` **dentro** dela — a
função é a porta, a conferência é a fechadura — e grava a auditoria na mesma
transação.

| Operação       | Função                              | Regras                                                                         |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Editar dados   | `admin_update_tenant` (INVOKER)     | nome obrigatório; documento CPF ou CNPJ (com letra também); o slug não muda    |
| Suspender      | `admin_set_tenant_status` (DEFINER) | só de ativa; **motivo obrigatório**, até 500 caracteres — é o que a empresa lê |
| Reativar       | `admin_set_tenant_status` (DEFINER) | só de suspensa; apaga o motivo                                                 |
| Trocar o plano | `admin_change_plan` (DEFINER)       | liga o que o plano novo inclui; desliga o que ficou fora **só quando pedido**  |

`status` e `plan_id` não têm privilégio de `update` para `authenticated`
(20260919050000) — nem o Super Admin chega a eles pela API. Por isso suspender e
trocar o plano são `SECURITY DEFINER`; editar dados, que são colunas que a
empresa já edita, é `INVOKER` e passa pelo RLS.

Empresa em provisionamento não se suspende nem troca de plano: tem o caminho
dela (retomar ou desfazer, na lista de clientes). Cancelar não mora aqui.

### Trocar o plano

O plano é o padrão de origem; `tenant_modules` é a verdade sobre acesso.
Trocar **liga** o que o plano novo inclui e a empresa não tem. **Desligar** o
que ficou fora é escolha explícita de quem troca — pode haver módulo vendido à
parte —, e desligar não apaga dado: o acesso sai, e religar devolve tudo. **O
Core nunca desliga.**

A tela mostra antes de confirmar o que vai ligar e o que fica fora, com
`previewPlanChange()` do Core. O teste do Admin roda a prévia e a função do
banco nos mesmos cinco cenários — subindo, descendo, pedindo e sem pedir — e
compara.

## O que a empresa suspensa vê

`/preparando` mostra **"Motivo informado pela Tivexy"** com o texto gravado, e
diz que os dados continuam guardados. Antes dizia "quem administra a conta
consegue ver o motivo" — e não havia motivo gravado em lugar nenhum.

## Histórico

- **Provisionamentos:** cada execução, com o Blueprint e a versão, início e fim,
  tentativas, e cada etapa com a situação e o erro. A que parou aparece aberta.
- **Decisões da plataforma:** da auditoria, que não se apaga — provisionada,
  dados editados (o que mudou, de quê para quê), suspensa (com o motivo),
  reativada, plano trocado (o que ligou e desligou).

## Auditoria

| Ação                  | Metadata                                             |
| --------------------- | ---------------------------------------------------- |
| `tenant.updated`      | `antes` e `depois` de nome, razão social e documento |
| `tenant.suspended`    | `de`, `para`, `motivo`                               |
| `tenant.reactivated`  | `de`, `para`                                         |
| `tenant.plan_changed` | `de`, `para`, `ligados`, `desligados`                |

## As onze exigências

UI (a página do cliente) · backend (`actions.ts`, cada uma com
`requireAccess('/admin')`) · banco (as três funções e as colunas do motivo) ·
autorização (Super Admin conferido na função; `status` e `plan_id` sem
privilégio de coluna) · validação (Core: documento; banco: motivo, transições,
plano) · erro (as mensagens do banco chegam como foram escritas) · carregando
(botões com estado) · vazio (sem execução, sem decisão — cada um diz) · 375 px
(conferido) · teste (14 de banco, com a prévia × a função; rótulos, formulário e
auditoria na aplicação) · documentação (este arquivo).

## Pendente

| Item                        | Por quê                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| Cancelar a empresa          | Decisão de outro tamanho — o que acontece com os dados, e quando |
| Ligar módulo avulso         | A troca de plano cobre o comum; módulo a módulo é outra tela     |
| Convidar usuário pelo Admin | Hoje o administrador da empresa convida em `/equipe`             |
