# Automações — gatilho, condição, ação

🟡 testado, não verificado contra o banco real (25/09/2026). Migration:
`20260925130000_automation_engine`. Contratos: `packages/core/src/automation.ts`.

**Motor interno.** Um evento do próprio sistema passa por condições simples e
dispara uma ação do próprio sistema. Nada sai do Tivexy: não há e-mail,
WhatsApp nem webhook aqui — dependem de credencial e de provedor (🔒, ver
[[PROJECT_STATE#6. Dependências externas — 🔒 BLOCKED — EXTERNAL]]) e não
existem nem simulados.

```
Quando  Vendas — registro novo
Se      total é pelo menos R$ 1.000,00
Então   avisar quem vê contas a receber: "Venda nº {{numero}}: {{total}}"
```

## As três decisões

1. **O evento nasce no banco.** Gatilhos nas tabelas de domínio chamam
   `automation_emit()`. A automação dispara por qualquer caminho — a tela, a
   API, a conversão de um lead — e não só quando a aplicação lembra de chamar.
2. **Automação nunca derruba o negócio.** Cada regra roda num bloco próprio
   (`begin … exception`). Se a ação falha, o erro vai para `automation_runs` e a
   venda continua registrada. O contrário — uma venda recusada porque um aviso
   falhou — seria o motor valendo mais que o negócio.
3. **Quem escreve a regra precisa poder fazer o que ela faz.** A ação roda como
   o banco (é gatilho), então a permissão é conferida ao **escrever** a regra:
   uma regra que cria atividade no CRM pede `crm.activities.write` de quem a
   cria, edita ou liga. Sem isso, `automation.rules.write` seria porta lateral
   para escrever onde a pessoa não pode.

E um freio: **automação não dispara automação.** A variável de transação
`tivexy.automation_running` marca que o motor está rodando, e eventos nascidos
dentro dele são ignorados. Laço infinito é o defeito clássico de todo motor de
regras (o Odoo trata com contexto; o Zapier, com limite de passos).

## Gatilhos

| Código                   | Quando                                     | Condições sobre        | Variáveis                               | Responsável    |
| ------------------------ | ------------------------------------------ | ---------------------- | --------------------------------------- | -------------- |
| `crm.lead.created`       | lead cadastrado                            | origem, nome           | `nome`, `origem`                        | dono do lead   |
| `crm.deal.stage_changed` | oportunidade muda de etapa                 | situação, etapa, valor | `titulo`, `etapa`, `valor`              | dono           |
| `erp.sale.registered`    | venda registrada                           | total, cliente         | `numero`, `total`, `cliente`            | quem registrou |
| `inventory.stock.low`    | saldo **cruza** o mínimo (de acima para ≤) | nome do produto        | `produto`, `saldo`, `minimo`, `unidade` | —              |

**Saldo no mínimo só na travessia.** Avisar a cada venda de um produto que já
está no mínimo seria ruído, e ruído é o que faz as pessoas desligarem os
avisos. Uma venda que leva dois produtos ao mínimo avisa duas vezes — uma por
produto —, e o freio de laço não engole o segundo (há teste).

Módulo desligado não emite: `automation` precisa estar ligado na empresa, e a
tela só oferece gatilhos dos módulos que ela tem.

## Condições

Todas valem ao mesmo tempo (E), no máximo dez.

| Tipo do campo | Comparações                  |
| ------------- | ---------------------------- |
| texto         | é, não é, contém             |
| opção         | é, não é                     |
| dinheiro      | é pelo menos, é no máximo, é |

- Texto compara **sem caixa**: "Instagram" e "instagram" são o mesmo.
- Dinheiro é guardado em **centavos**. "5.50" digitado no celular é R$ 5,50 —
  a regra de `normalizeDecimal`, a mesma dos campos de valor.
- **Campo ausente ou nulo não satisfaz nada — nem "não é".** "Cliente não é
  Rita" não vale para venda sem cliente: a pessoa que escreveu a regra pensava
  em vendas com cliente.

## Ações

| Ação                  | O que faz                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `core.notify`         | Aviso no sistema — o sino. Para a pessoa responsável, para uma pessoa, ou para quem tem uma permissão.        |
| `crm.activity.create` | Atividade no CRM, ligada ao lead ou à oportunidade do evento, com prazo em N dias (23h59 no fuso da empresa). |

**Aviso "para quem tem a permissão"** é o jeito de mandar para "o financeiro"
sem existir cadastro de setor: quem vê contas a receber é, na prática, o
financeiro — e continua sendo quando a equipe muda. A tela oferece só as
permissões de **ver**, dos módulos da empresa.

Atividade só nasce de evento do CRM — precisa de um lead ou de uma oportunidade
a que se ligar. O banco recusa a combinação (`automation_rules_activity_needs_crm_event`).

### Título e texto

`{{variavel}}` troca pelo valor do evento. Dinheiro sai formatado (R$ 1.234,56),
número sai com vírgula e sem zeros à direita (2,5), variável ausente vira vazio.
**Uma passada só:** o valor que entra não é relido como modelo — um lead chamado
`{{origem}}` aparece como `{{origem}}`, e o dado de quem preenche não vira
modelo.

A tela mostra a prévia do título com **valores de exemplo, rotulados como
exemplo** — não são dado de ninguém.

## O Core e o banco dizem a mesma coisa

A tela prevê o que o banco vai fazer com `automationMatches` e
`renderAutomationTemplate`; o banco executa com `automation_matches()` e
`automation_render()`. O teste de contratos roda os dois lados **nos mesmos
casos** — 22 de condição, 17 de texto — e compara gatilhos, ações e que ação
cabe em que gatilho, par por par, contra as constraints. Divergir faria a
prévia mentir. Duas divergências apareceram assim, antes de existir tela: o
banco tirava vírgula do fim de qualquer texto, e aceitava condição com valor
`null`.

## O registro de execuções

`automation_runs` guarda cada vez que uma regra rodou: o que fez ("2 avisos",
"atividade criada", "ninguém para avisar") ou, quando falhou, **o motivo**. É o
que responde "por que o aviso não chegou?" sem abrir o banco. Só o motor
escreve; quem vê automações lê. Excluir a regra leva o registro dela junto.

## Avisos

`notifications` é do Core: o aviso é da pessoa — só ela lê, só ela marca como
lido (a única coluna que se escreve de fora é `read_at`). Nasce só de função
do banco. O link é sempre caminho interno (`^/[A-Za-z0-9/_-]*$`): um aviso não
leva ninguém para fora do sistema.

- **Sino** no cabeçalho, com o número de não lidos. O número vem do banco a
  cada página carregada — **não há tempo real**; Realtime do Supabase não foi
  ligado.
- **`/avisos`**: lista paginada, abrir (marca como lido e leva ao registro —
  por formulário, porque o navegador pré-carrega link e o aviso ficaria lido
  sem ninguém ter olhado), marcar um, marcar todos.

## Tela: `/automacoes`

🟡 testado, não verificado contra o banco real (25/09/2026).

- **Modelos** — os quatro casos que todo CRM e ERP pequeno automatiza primeiro
  (primeiro contato com lead novo, aviso de ganho, venda acima de um valor,
  saldo no mínimo). Escolher preenche o editor; nada é criado sem "Salvar e
  ligar". Só aparecem os dos módulos da empresa, e o de atividade só para quem
  pode criar atividade.
- **Editor** — quando, se, então. O gatilho decide os campos; o tipo do campo
  decide as comparações; a ação decide o que se pergunta. Variáveis entram no
  cursor com um clique. A frase da regra se monta embaixo enquanto se edita, e
  os erros voltam para o campo certo (`condicoes.1`, `destino`…).
- **Lista** — cada regra em frase, no vocabulário do nicho ("Atendimentos —
  registro novo" na clínica), com a última execução, interruptor em vigor/em
  pausa, editar no lugar e excluir com confirmação.
- **Últimas execuções** — ícone e palavra (a cor não carrega sozinha o "deu
  certo"), o motivo da falha, o evento em uma linha e o link para ele.
- Quem só vê automações vê tudo isso sem os controles.

As onze exigências, onde estão: UI (esta seção) · backend (`actions.ts`,
`parseRuleForm`) · banco (a migration) · autorização (RLS por permissão, e a
composta para atividade) · validação (`checkAutomationRule`, a mesma dos dois
lados) · erro (por campo e por ação; falha de leitura avisa) · carregando
(botões com estado, interruptor otimista) · vazio (explica o que é e aponta os
modelos) · 375 px (conferido, sem rolagem lateral) · teste (12 de banco, 4 de
contrato, 13 do Core, 14 da aplicação) · documentação (este arquivo).

## Permissões

| Permissão                | Dá                                                                   |
| ------------------------ | -------------------------------------------------------------------- |
| `automation.rules.read`  | ver regras e o registro de execuções                                 |
| `automation.rules.write` | criar, editar, ligar, excluir — e, para atividade, também a de baixo |
| `crm.activities.write`   | exigida de quem escreve regra que cria atividade                     |

## Pendente

| Item                                             | Por quê                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Gatilho por tempo ("conta vence amanhã")         | Precisa de agendador (`pg_cron` ou função agendada) — o motor hoje só reage |
| E-mail, WhatsApp, webhook como ação              | 🔒 SMTP, Meta, e um destino que receba — ver `10-INTEGRATIONS/`             |
| Mais gatilhos (lead convertido, venda cancelada) | Cabem no mesmo desenho: um gatilho de tabela e uma linha no catálogo        |
| Condição com "ou"                                | Duas regras cobrem o caso hoje                                              |
| Aviso em tempo real                              | Realtime do Supabase, com a política de `notifications` já pronta para isso |
| Auditoria da regra                               | Quem mudou a regra fica em `updated_at`, não em `audit_logs` — ainda        |
