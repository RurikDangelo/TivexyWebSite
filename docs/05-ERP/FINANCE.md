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

## Tela: `/erp/financeiro`

🟡 testado, não verificado contra o banco real (25/09/2026). Migration das
somas: `20260925120000_finance_reports` (`finance_summary`, `finance_cashflow`,
INVOKER, com quatro testes).

Três abas no endereço — **Visão**, **A receber**, **A pagar**.

- **Visão**: quatro números — saldo do mês (entrou − saiu, com sinal),
  a receber e a pagar em aberto com o **vencido escrito em vermelho** e o
  cartão levando à lista já filtrada, e o saldo dos próximos 30 dias.
- **Fluxo de caixa em SVG próprio**, nove semanas (quatro para trás, a atual,
  quatro para frente). **Entrada sobe, saída desce** — a posição diz o que é
  antes da cor; realizado cheio, previsto hachurado; a semana atual com fundo e
  rótulo; a mesma escala para cima e para baixo, senão o gráfico mentiria sobre
  o saldo. Cada barra tem título com os valores, e **"Ver os números de cada
  semana"** abre a tabela — para quem não vê o gráfico. As barras crescem do
  eixo; movimento reduzido zera a animação. Dois desenhos, um estreito e um
  largo: o SVG escala o texto com a figura, e o desenho largo num celular dava
  rótulos de cinco pixels.
- **Vencendo até daqui a 7 dias**, das duas direções, vencidos primeiro.
- **A receber / A pagar**: filtro por situação (em aberto, vencidos, pagos,
  cancelados), busca em descrição, contraparte e categoria. Cada linha diz o
  prazo como se fala ("venceu há 3 dias", "vence amanhã"), e o que nasceu de
  venda leva à venda.
- **Registrar recebimento/pagamento** pede o dia — hoje por padrão, nunca no
  futuro; **desfazer** confirma antes; **cancelar** só o avulso, com motivo —
  o da venda, cancela-se a venda, e o botão nem aparece.
- **Lançar** conta avulsa: descrição, valor, vencimento, contraparte e
  categoria (sugere as já usadas, para não nascer "aluguel" e "Aluguel");
  "já pago" registra o que aconteceu e ficou sem lançar.
- As somas são do banco, sobre tudo, e "hoje" é o dia do tenant.

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
| Fornecedor cadastrado        | Contraparte é texto livre até `erp.suppliers` ter tabela     |
| Plano de contas              | Categoria é texto livre por ora                              |
| Conciliação bancária, boleto | 🔒 banco / provedor — ver `10-INTEGRATIONS/`                 |
| Parcelamento                 | Crédito em N vezes vira N lançamentos — quando houver pedido |
