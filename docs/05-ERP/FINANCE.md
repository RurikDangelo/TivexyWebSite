# Financeiro — contas a receber e a pagar

> Estado: 🟡 **esquema testado, não verificado contra o banco real** (25/09/2026).
> Migration `20260925100000_erp_finance`. Testes em `supabase/tests/erp.test.mjs`,
> seção "financeiro". Módulo `finance`; a venda que gera lançamento está em [[ERP]].

**Nada aqui cobra, paga, emite boleto ou fala com banco.** É o registro do que
a empresa tem a receber e a pagar, e de quando o dinheiro se moveu. Conciliação
bancária e boleto dependem de banco (🔒 externo) e não existem — nem simulados.

## Regime de caixa, e o lançamento não guarda situação

`finance_entries` tem direção (`receivable` entra, `payable` sai), valor em
centavos e vencimento. Quando o dinheiro de fato se move, ganha `paid_on` — um
dia, no calendário do tenant.

- **Realizado** é a soma de `paid_on`.
- **Previsto** é o vencimento do que está em aberto.
- **Vencido** não é coluna: é vencimento antes de hoje num lançamento em
  aberto, lido na hora — `financeStatus()` no Core. Coluna de situação
  precisaria de alguém atualizando à meia-noite; no dia em que falhasse, a tela
  mostraria em dia o que venceu. É a mesma decisão da oportunidade do CRM.

Lançamento errado **não se apaga** — não há privilégio de `delete`. Cancela-se,
com motivo, e fica na história. Pago não se cancela: desfaz-se a baixa antes.
Cancelado não muda mais. Data de pagamento no futuro é recusada: pagamento é
o que aconteceu.

## A venda vira dinheiro sozinha

Cada pagamento de venda vira um lançamento a receber, pelo gatilho
`finance_on_sale_payment` — quem vende não precisa, nem pode, escrever no
financeiro. O prazo da forma de pagamento decide:

| Forma             | Prazo | O lançamento nasce             |
| ----------------- | ----- | ------------------------------ |
| Dinheiro, Pix     | 0     | já recebido, no dia da venda   |
| Cartão de débito  | 1     | em aberto, vencendo amanhã     |
| Cartão de crédito | 30    | em aberto, vencendo em 30 dias |

A descrição usa o vocabulário do nicho — "Venda nº 12 — Pix", ou "Pedido nº 12
— Pix" onde venda se chama pedido.

O lançamento que nasceu da venda **segue a venda**: valor, vencimento e
descrição não se editam, e ele não se cancela sozinho — cancela-se a venda. O
que se faz nele é registrar que o dinheiro chegou. A regra distingue "alguém
atualizou" de "o cancelamento da venda atualizou" por `pg_trigger_depth()`: o
gatilho do financeiro reagindo à venda chega com profundidade 2; o PostgREST,
com 1.

Sem o módulo `finance`, a venda não gera lançamento.

## Venda cancelada

- O que **ainda não entrou** deixa de ser esperado: o lançamento em aberto é
  cancelado, com o motivo "Venda nº N cancelada".
- O que **já entrou** não some — o dinheiro se moveu, e apagar reescreveria o
  caixa de um dia já fechado. Nasce, no lugar, uma **conta a pagar**: a
  devolução ao cliente, em aberto, vencendo hoje. Quem devolver o dinheiro
  registra a baixa; se o cliente trocou por outro produto, cancela com esse
  motivo. Os dois lados ficam visíveis.

## Permissões

A receber e a pagar são separados: o encarregado do mercado vê o que a loja
deve, e não o que ela tem a receber.

| Permissão                   | Dá                                      |
| --------------------------- | --------------------------------------- |
| `finance.receivables.read`  | ver contas a receber                    |
| `finance.receivables.write` | lançar a receber; registrar recebimento |
| `finance.payables.read`     | ver contas a pagar                      |
| `finance.payables.write`    | lançar a pagar; registrar pagamento     |
| `finance.cashflow.read`     | ver os dois — o fluxo de caixa é a soma |

Lançamento avulso com cara de venda (`sale_id` preenchido à mão) é recusado
pela política de `insert`: seria dinheiro inventado com origem de aparência
legítima.

## Pendente

| Item                         | Por quê                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| Tela `/erp/financeiro`       | Vem depois de `/erp/vendas`                                  |
| Fornecedor cadastrado        | Contraparte é texto livre até `erp.suppliers` ter tabela     |
| Plano de contas              | Categoria é texto livre por ora                              |
| Conciliação bancária, boleto | 🔒 banco / provedor — ver `10-INTEGRATIONS/`                 |
| Parcelamento                 | Crédito em N vezes vira N lançamentos — quando houver pedido |
