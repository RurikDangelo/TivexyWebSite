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

## Tela: `/erp/estoque`

🟡 testado, não verificado contra o banco real (25/09/2026).

O título é o nome do nicho: a cafeteria vê "Insumos".

- **Saldo** (aba padrão): cada produto que controla estoque, **ordenado pela
  urgência** — negativo, zerado, no mínimo, em dia —, porque quem abre esta tela
  quer saber o que repor. Busca sem acento ("acucar" acha "Açúcar").
- **Resumo no topo**, cada cartão é um filtro: pedem reposição, saldo
  negativo, em dia, e **valor a custo** — saldo positivo × custo, com
  `lineTotalCents`, a mesma conta da venda. Quem não tem custo fica fora da
  soma e o cartão diz quantos ficaram, em vez de somar como zero
  (`stockSummary()` no Core, com testes).
- **Registrar movimentação**: um formulário para entrada, saída e contagem,
  com o tipo escolhido em cartões (rádios nativos, foco visível). O rótulo da
  quantidade muda com o tipo e mostra a unidade do produto escolhido.
  **Contagem pede o que foi contado**, não a diferença — quem está na
  prateleira sabe quantos tem, e a conta de cabeça é onde o erro entra.
  Depois de registrar, a mensagem diz o saldo novo e o foco volta para a
  quantidade: numa entrega com dez produtos, é escolher o próximo e digitar.
- **Botões de entrada e contagem em cada linha**, que abrem o formulário já
  com o produto escolhido (`?produto=…&tipo=…#registrar`).
- **Movimentações** (aba, com `inventory.movements.read`): o razão de todos os
  produtos, filtrável por tipo e produto, com quem registrou; baixa e devolução
  de venda aparecem com o número da venda.
- A unidade que decide a fração é lida **do banco** na ação, não do
  formulário (`lib/erp/movement-input.ts`, 8 testes).

Resumo e ordenação precisam de todos os produtos controlados: a tela lê até
2.000 de uma vez e avisa quando há mais. Para o comércio pequeno é folga; um
catálogo maior pede o resumo numa função do banco.

Conferida na vitrine, claro e escuro, 1440 e 375 px, sem erro de página e sem
rolagem lateral.

## Permissões

| Permissão                   | Dá                                              |
| --------------------------- | ----------------------------------------------- |
| `inventory.stock.read`      | ver saldo (quem tem `erp.products.read` também) |
| `inventory.movements.read`  | ver o razão                                     |
| `inventory.movements.write` | registrar entrada, saída e contagem             |

## Pendente

| Item                               | Por quê                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Custo médio do produto             | A entrada guarda custo unitário; ninguém recalcula                     |
| Ficha técnica (insumo por produto) | A cafeteria vende café e controla grão: fica para quando houver pedido |
| Mais de um depósito                | Um saldo por produto por tenant, por ora                               |
