# ERP

> O segundo módulo de negócio. Ele não reimplementa nada do Core — quem é a
> pessoa está em [[../03-CORE/AUTHENTICATION|AUTHENTICATION]], o que ela pode
> em [[../12-SECURITY/AUTHORIZATION|AUTHORIZATION]], e o isolamento em
> [[../12-SECURITY/MULTI_TENANCY|MULTI_TENANCY]].
>
> E não duplica o CRM: **o cliente de uma venda é uma conta do CRM**. Não há
> cadastro paralelo de cliente aqui, que seria exatamente a duplicação que o
> `CLAUDE.md` proíbe entre módulos.

## ⚠️ O que este módulo não faz, e não deve fazer

Nada aqui emite nota fiscal, cobra cartão, gera boleto ou fala com banco.

| Tabela                | O que ela é                                      |
| --------------------- | ------------------------------------------------ |
| `erp_payment_methods` | **Catálogo** — como o cliente disse que pagou    |
| `erp_sale_payments`   | **Registro** — alguém anotou que o cliente pagou |
| `finance_entries`     | **Livro** de contas a pagar e a receber          |

Registrar que alguém pagou não é receber. Apresentar qualquer uma dessas
tabelas como emissão fiscal ou como cobrança é proibido, e é proibido porque
tem consequência legal — não estética. As telas repetem isso onde a confusão
seria cara, e não num rodapé.

## O que existe

| Tabela                   | O que guarda                               |
| ------------------------ | ------------------------------------------ |
| `erp_product_categories` | Categoria. Semeada pelo Blueprint          |
| `erp_products`           | Produto ou serviço (`track_stock` separa)  |
| `erp_payment_methods`    | Forma de pagamento. Semeada pelo Blueprint |
| `erp_stock_movements`    | **O razão do estoque**, append-only        |
| `erp_stock_balances`     | O saldo, mantido por gatilho               |
| `erp_sales`              | Venda. Nasce rascunho                      |
| `erp_sale_items`         | Item, com o preço do momento da venda      |
| `erp_sale_payments`      | Como foi pago                              |
| `finance_entries`        | Contas a pagar e a receber                 |

Telas: `/erp/produtos`, `/erp/estoque`, `/erp/vendas`, `/erp/vendas/[id]` e
`/erp/financeiro`.

> Tudo de 24/09/2026 e **testado, não verificado contra o banco real** — foi
> construído em sessão de nuvem, que recebe o repositório e não os segredos.
> As migrations estão pendentes de `npm run db:push`. Ver
> [[../PROJECT_STATE#6.2]].

## A decisão estrutural: estoque é razão, não coluna

A tentação é uma coluna `quantidade` em `erp_products`. Ela é rápida de ler e
produz o pior tipo de defeito: no dia em que alguém corrigir o estoque por
SQL, por importação, ou em que uma venda falhar no meio, a coluna passa a
discordar do que de fato entrou e saiu — **sem erro nenhum**. O sintoma é o
inventário do mês não fechar, meses depois, sem ninguém saber desde quando.

É a mesma família de erro que o CRM já evitou com "a oportunidade não guarda
situação própria, ela é a da etapa".

A verdade é `erp_stock_movements`. `erp_stock_balances` existe para não somar
o razão inteiro a cada listagem, e é mantido **por gatilho**.

Não são duas verdades: é uma verdade e um índice dela.

### Três coisas sustentam isso, e nenhuma é "a gente toma cuidado"

1. **A aplicação não consegue escrever o saldo.** O privilégio foi revogado de
   `authenticated` — quem tentar recebe `permission denied`, não "nenhuma
   linha afetada". Política ausente negaria de qualquer jeito; revogar é a
   regra direta.
2. **O razão não se edita nem se apaga.** Gatilho recusando `update` e
   `delete`. Corrigir é lançar ajuste, e o ajuste fica no histórico — que é o
   que se quer poder auditar depois.
3. **A quantidade é sempre positiva**, com constraint. O sinal vem do `kind`:
   quantidade negativa com tipo `in` seria uma saída disfarçada de entrada, e
   nenhuma soma perceberia.

Há teste do invariante — saldo igual à soma do razão — e ele foi conferido
quebrando o código: devolvendo a escrita do saldo à aplicação, um teste cai.

### `adjustment` é separado de `in` e `out`

Inventário e correção não são compra nem venda. Misturá-los faz o relatório de
giro contar ajuste como movimento comercial — o produto parece vender o dobro
no mês em que alguém acertou a contagem.

## O total da venda também é derivado

`erp_sales.total_cents` não é digitado: é a soma dos itens menos o desconto,
mantida por gatilho. Guardar um total que alguém digita ao lado de itens que
alguém edita é manter duas verdades, e elas divergem no primeiro item
corrigido.

Dois gatilhos, e o segundo é fácil de esquecer: um recalcula quando o **item**
muda, outro quando o **desconto** muda. Sem o segundo, o total ficaria com o
desconto antigo até alguém mexer num item — e ninguém mexe depois de fechar.

`greatest(soma - desconto, 0)`: desconto maior que os itens não vira total
negativo, que a constraint recusaria — e a recusa apareceria como erro ao
editar um item, longe de onde o desconto foi digitado.

### O preço é copiado para o item

`erp_sale_items.unit_price_cents` não é redundância. Ler o preço atual do
produto num relatório de seis meses atrás mostraria o faturamento de então com
os preços de hoje.

## A venda nasce rascunho

Montar uma venda item a item **precisa** de um estado em que nada aconteceu no
mundo. Sem ele, cada linha acrescentada mexeria no estoque, e desistir no meio
deixaria o inventário errado.

**O número sai na confirmação, não no rascunho.** Desistir de uma venda
deixaria um buraco na sequência, e buraco em sequência de venda é a primeira
coisa que um contador pergunta. Cancelada preserva o número: ela aconteceu e
foi desfeita.

### `erp_confirm_sale()` — quatro escritas numa transação

Número, estado, baixa de estoque e recebimento. O cliente PostgREST não tem
transação, então daqui seriam quatro chamadas, com quatro pontos onde a rede
pode cair. O pior desfecho parcial não parece defeito: o estoque baixa e a
venda continua rascunho, ou o recebimento entra sem venda confirmada do outro
lado.

`SECURITY INVOKER`: cada escrita passa pelo RLS como se tivesse partido da
aplicação. Não é atalho para escrever o que a pessoa não poderia.

**Serviço não baixa estoque.** Sem o filtro por `track_stock`, "hora de
consultoria" apareceria no inventário com saldo negativo eterno. Conferido
quebrando.

### Venda confirmada não se edita

Ela já baixou estoque e gerou recebimento. Desfazer as duas tem consequência
contábil — é outro caminho, não o oposto simétrico de confirmar. A tela diz
isso em vez de oferecer um botão que faria metade.

## As duas configurações que ninguém consumia

`inventory.deduct_on_sale` e `erp.sales_requires_customer` estavam no catálogo
do Core desde o começo e **nada as lia**. Configuração que ninguém consome é o
defeito sem sintoma que o próprio catálogo existe para evitar.

`erp_confirm_sale()` respeita as duas, com o padrão valendo quando a chave não
está gravada — `resolveSettings()` só grava o que o nicho mudou, de propósito,
para que um padrão novo alcance todo tenant que já existe sem migração.

## O financeiro é um livro só

Um enum `kind` numa tabela, e não duas tabelas quase iguais: duas dobrariam
toda consulta de fluxo de caixa e fariam o saldo precisar de `union` — e
`union` esquecido de um lado é relatório errado que parece certo.

A política de leitura separa por `kind`: quem cuida de contas a pagar não
precisa ver o faturamento.

`due_date` é `date`, não `timestamptz`. Vencimento é um dia no calendário do
cliente, e um instante faria "vence dia 10" mudar de dia conforme o fuso de
quem olha.

## O gráfico de previsão de caixa

### As cores foram medidas, não escolhidas

`--tvx-blue-500` e `--tvx-danger-500`, as duas já do sistema. Passam nos seis
testes do validador de paleta **nos dois temas**: separação sob daltonia
ΔE 24,8 (protanopia), visão normal ΔE 34,5, contraste ≥ 3:1.

**O par óbvio — verde e vermelho — foi medido e recusado:** ΔE 8,0 no
deuteranopia, dentro da banda-piso que só valeria com codificação secundária.
Azul e vermelho dizem a mesma coisa e continuam legíveis para quem não
distingue verde de vermelho, que é cerca de um homem em doze.

### As outras regras que ele segue

- **Um eixo só.** As duas séries são da mesma unidade.
- **A escala é a maior barra, não a soma.** Somar receber e pagar daria um
  teto que nenhuma barra alcança, e todas ficariam achatadas embaixo.
- **Cor não é a única portadora:** legenda sempre presente, rótulo direto só
  onde há movimento, e a tabela equivalente num `<details>` logo abaixo.
- **O atrasado entra na primeira barra**, em vez de sumir. Atraso é caixa que
  ainda vai acontecer, e escondê-lo faria a previsão parecer melhor do que é.
- **O gráfico ignora o filtro da lista.** Um gráfico que mudasse com o recorte
  da tabela mostraria "previsão de caixa" de um pedaço do caixa — e ninguém lê
  a legenda antes de tirar conclusão de um gráfico.
- **Nenhum número inventado.** Sem lançamento em aberto, nenhuma barra é
  desenhada.
- A animação é `transform`, não `height` — animar altura recalcula layout a
  cada quadro e faz o eixo tremer. `prefers-reduced-motion` zera a duração.

## O que falta

- **Compras e fornecedores.** As permissões `erp.purchases.*` e
  `erp.suppliers.*` existem no catálogo e nenhuma tabela as usa
- Editar e excluir produto (hoje só desativa), editar lançamento financeiro
- Cancelar venda confirmada, com estorno de estoque e do recebimento
- Responsável (`owner_id`) — a coluna existe em todas as tabelas e nenhuma
  tela a preenche
- Custo médio e margem por venda — hoje a margem é do cadastro, não da venda
- Relatórios: curva ABC, giro, ponto de pedido
- Emissão fiscal 🔒 — depende de provedor e certificado digital, e **não deve
  ser simulada**
