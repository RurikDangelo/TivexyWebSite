# Tutorial — do Admin à primeira venda

🟡 testado, não verificado contra o banco real (25/09/2026). Tela: `/tutorial`.
Passos: `apps/web/src/lib/tutorial/steps.ts`.

O guia de ponta a ponta de uma empresa nova, na ordem em que ela acontece:

| #   | Passo                            | Onde                 | Feito quando                            |
| --- | -------------------------------- | -------------------- | --------------------------------------- |
| 1   | Criar a empresa com um Blueprint | Admin (Super Admin)  | a empresa existe                        |
| 2   | Entregar o acesso                | Admin → link         | a empresa existe (quem lê entrou)       |
| 3   | Conferir os dados da empresa     | `/configuracoes`     | razão social e documento cadastrados    |
| 4   | Chamar a equipe                  | `/equipe`            | há mais alguém além de quem entrou      |
| 5   | Cadastrar lead                   | `/crm/leads`         | um lead existe                          |
| 6   | Levar oportunidade pelo funil    | `/crm/oportunidades` | uma oportunidade existe                 |
| 7   | Agendar atividade                | `/crm/atividades`    | uma atividade existe                    |
| 8   | Cadastrar produto                | `/erp/produtos`      | um produto existe                       |
| 9   | Dar entrada no estoque           | `/erp/estoque`       | uma entrada ou contagem existe          |
| 10  | Registrar venda                  | `/erp/vendas/nova`   | uma venda existe                        |
| 11  | Ver o dinheiro no financeiro     | `/erp/financeiro`    | um lançamento existe — o da venda conta |
| 12  | Ligar automação                  | `/automacoes`        | uma regra existe                        |

Os nomes seguem o vocabulário do nicho: na clínica, o passo 10 é "Registrar
atendimento".

## "Feito" é contado, não marcado

Um passo está feito quando o que ele pede **existe no banco** — uma contagem
por tabela, com a sessão da pessoa (passando pelo RLS). Não há botão "marcar
como feito": seria o tutorial dizendo que a empresa vende quando ela nunca
vendeu.

A contagem que falha vira "não consegui conferir", nunca zero. Zero é "ainda
não fez", e as duas coisas pedem respostas diferentes.

## Quem vê o quê

O acesso a cada passo é o da própria rota (`routeRules`) — o tutorial não tem
uma segunda lista de quem pode o quê.

| Situação                          | O passo diz                             | Conta no progresso? |
| --------------------------------- | --------------------------------------- | ------------------- |
| Existe                            | Feito                                   | sim                 |
| Falta, e a pessoa alcança a tela  | "Fazer agora", o primeiro com destaque  | sim                 |
| Falta, e a tela é de outra pessoa | "Quem faz é outra pessoa da equipe"     | sim                 |
| Módulo não contratado             | Uma linha pela seção inteira            | não                 |
| A pessoa não lê o que se contaria | "Não dá para conferir com o seu acesso" | não                 |

Contar como pendente o módulo que a empresa não tem seria cobrar o que ela não
contratou.

## O que ainda é externo

A última seção lista as integrações do catálogo de
[[10-INTEGRATIONS/INTEGRATIONS|INTEGRAÇÕES]], com o que funciona hoje sem cada
uma, e leva a `/integracoes` para quem pode ver. O passo 2 diz o externo que
mais pesa no começo: **sem SMTP não sai e-mail**, e o Super Admin repassa o
link de acesso pelo canal que já usa com o cliente.

## As onze exigências

UI (esta tela) · backend (a página conta e lê a origem) · banco (contagens
reais; o Blueprint de origem lido de `provisioning_runs`) · autorização (rota
`member`; cada passo pela regra da rota dele) · validação (não há entrada) ·
erro (contagem que falha não vira zero) · carregando (o esqueleto do grupo) ·
vazio (empresa nova: tudo a fazer, com o primeiro em destaque; módulo que não
há, uma linha) · 375 px (conferido) · teste (`steps.test.ts`: estados,
progresso, rotas declaradas, vocabulário) · documentação (este arquivo).
