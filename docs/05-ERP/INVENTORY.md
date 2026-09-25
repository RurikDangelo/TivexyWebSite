# Estoque — movimentação e saldo

> Estado: 🟡 **esquema testado, não verificado contra o banco real** (25/09/2026).
> Migration `20260925090000_erp_inventory`. Testes em `supabase/tests/erp.test.mjs`,
> seção "estoque". Módulo `inventory`; cadastro e venda em [[ERP]].

## Razão e saldo

Toda mudança de estoque é uma linha em `inventory_movements`, que **nunca** se
edita nem se apaga — `authenticated` não tem `update` nem `delete` nela. O saldo
é a soma dessas linhas, guardada pronta em `inventory_stock_levels` por um
gatilho, na mesma transação. Ninguém de fora escreve no saldo, nem quem
administra.

É o desenho do ERPNext (Stock Ledger Entry + Bin) e do Odoo (stock.move +
quant). Só o saldo não diria se "tinha 12, tem 9" foram três vendas, uma perda
ou um erro de contagem. Só o razão obrigaria a somar a história inteira para
responder a pergunta mais feita do módulo.

## Os cinco tipos

| Tipo          | Sinal    | Quem escreve                 | Exige              |
| ------------- | -------- | ---------------------------- | ------------------ |
| `in`          | positivo | `inventory.movements.write`  | —                  |
| `out`         | negativo | `inventory.movements.write`  | motivo             |
| `adjustment`  | qualquer | `inventory.movements.write`  | quantidade contada |
| `sale`        | negativo | só o gatilho da venda        | item da venda      |
| `sale_return` | positivo | só o gatilho do cancelamento | item da venda      |

- **Saída sem motivo é recusada** — é o furo que ninguém explica no fim do mês.
- **Contagem:** grava-se o que foi contado (`counted_quantity`); o banco
  calcula a diferença contra o saldo daquele instante, com a linha do saldo
  presa até o fim da transação. Contagem que confere também fica registrada,
  com diferença zero: "conferido em 25/09" é informação.
- **Baixa e devolução de venda não se escrevem à mão.** A política de `insert`
  só aceita `in`, `out` e `adjustment`, sem venda ligada. Sem ela, uma
  "devolução" avulsa de venda que ninguém cancelou poria mercadoria no estoque
  pela porta dos fundos, com ligação de aparência legítima. Há teste com venda
  e item de verdade, para que só o RLS possa recusar.
- Uma baixa e uma devolução **por item vendido** (índice único): cancelar duas
  vezes não mexe no saldo duas vezes.

## A venda, vista pelo estoque

A venda baixa quando as três coisas valem: o tenant tem o módulo `inventory`, a
configuração `inventory.deduct_on_sale` está ligada, e o produto controla
estoque. Com qualquer uma desligada, a venda acontece e o estoque não se mexe
— que é o que a tela de configurações promete.

Cancelar devolve **exatamente o que baixou**. Se a baixa estava desligada no
dia da venda, não há o que devolver. Se o produto deixou de controlar estoque
ou mudou de unidade depois, a devolução acontece mesmo assim — conferir o
cadastro de hoje travaria o cancelamento de uma venda de ontem.

## Saldo negativo é permitido

A decisão do Odoo, e não a do ERPNext. No comércio pequeno a mercadoria é
vendida antes de alguém lançar a entrada; recusar a venda porque o estoque _do
sistema_ está zerado trava o caixa por um erro de cadastro. O saldo negativo
aparece destacado na tela, que é onde ele pode ser corrigido — com uma entrada
ou uma contagem.

## Permissões

| Permissão                   | Dá                                              |
| --------------------------- | ----------------------------------------------- |
| `inventory.stock.read`      | ver saldo (quem tem `erp.products.read` também) |
| `inventory.movements.read`  | ver o razão                                     |
| `inventory.movements.write` | registrar entrada, saída e contagem             |

## Pendente

| Item                               | Por quê                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Tela `/erp/estoque`                | Vem depois de `/erp/produtos`                                          |
| Custo médio do produto             | A entrada guarda custo unitário; ninguém recalcula                     |
| Ficha técnica (insumo por produto) | A cafeteria vende café e controla grão: fica para quando houver pedido |
| Mais de um depósito                | Um saldo por produto por tenant, por ora                               |
