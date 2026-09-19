# Provisionamento de tenant

> **Prioridade zero.** É o fluxo que transforma a plataforma em operação SaaS de
> verdade: sem ele, não existe cliente. Vem antes de qualquer módulo de negócio
> (ver [[../16-DECISIONS/ADR-002-ordem-de-construcao|ADR-002]]).
>
> **Estado:** esquema pronto e provado por teste; implementação na aplicação
> ainda não existe. Ver [[../PROJECT_STATE|PROJECT_STATE]].

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

| #   | Etapa            | O que faz                                        | O que a compensação desfaz |
| --- | ---------------- | ------------------------------------------------ | -------------------------- |
| 1   | `create_tenant`  | Cria o tenant em `status = 'provisioning'`       | Remove o tenant            |
| 2   | `apply_plan`     | Vincula o plano contratado                       | Desvincula                 |
| 3   | `enable_modules` | Habilita em `tenant_modules` os módulos do plano | Desabilita                 |
| 4   | `create_admin`   | Cria o usuário e o vínculo como `invited`        | Remove vínculo e usuário   |
| 5   | `seed_defaults`  | Configurações e equipe inicial                   | Remove o que criou         |
| 6   | `send_invite`    | Dispara o convite e registra auditoria           | Invalida o convite         |

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

`supabase/tests/provisioning.test.mjs` roda um **modelo** do fluxo contra
Postgres de verdade e prova que o esquema sustenta as garantias: caminho feliz,
idempotência, falha no meio, retomada sem repetir etapa, e dados de compensação.

O modelo não é a implementação de produção — não envia e-mail, não chama
serviço externo. Mas a ordem das etapas e as garantias são exatamente estas, e
a implementação real vai poder ser conferida contra ele.

## Dependências externas 🔒

| Dependência                           | Bloqueia                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Projeto Supabase                      | Aplicar as migrations, autenticação, tudo                                               |
| E-mail corporativo com SPF/DKIM/DMARC | O convite chegar. Sem isso o provisionamento "funciona" e o cliente não consegue entrar |
