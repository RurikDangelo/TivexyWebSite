# ERP — cadastro e venda

> Estado: 🟡 **esquema testado, não verificado contra o banco real** (25/09/2026).
> Migrations `20260925070000` a `20260925100000`, pendentes de `npm run db:push`.
> Testes: `supabase/tests/erp.test.mjs` (37), contratos em
> `supabase/tests/contracts.test.mjs`. Estoque em [[INVENTORY]], financeiro em
> [[FINANCE]].

O segundo módulo de negócio. Ele não reimplementa nada do Core: tenant,
usuário, papel, permissão, configuração e auditoria vêm de lá. As decisões
estruturais são as do CRM — toda tabela tem `unique (tenant_id, id)` e toda
referência leva o `tenant_id` junto, então apontar para o produto de outro
tenant não é defeito a testar, é impossível de escrever.

## De onde veio cada decisão

O desenho foi comparado com ERPs que resolvem o mesmo problema há anos:

| Decisão                                        | Referência                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Estoque é razão imutável + saldo pronto        | ERPNext (Stock Ledger Entry + Bin), Odoo (stock.move + quant)     |
| Saldo negativo é permitido e aparece destacado | Odoo; o comércio pequeno vende antes de lançar a entrada          |
| Venda gera conta a receber sozinha             | Bling, Tiny, Conta Azul — o dono não lança a venda duas vezes     |
| Prazo por forma de pagamento (crédito em 30)   | Conta Azul, Omie — o previsto do caixa sai do prazo da maquininha |
| Cancelar venda é permissão separada            | Todo PDV: o golpe clássico é registrar, receber e cancelar        |
| Venda registrada não muda; cancela-se          | Documento fiscal e de caixa: a correção fica na história          |

## Dinheiro e quantidade

- **Dinheiro em centavos, inteiro** (`bigint`). Nunca ponto flutuante.
- **Quantidade em `numeric(14,3)`**: o mercado vende 0,350 kg.
- A **unidade decide se há fração**: `kg`, `g`, `l`, `ml`, `m` aceitam; `un`,
  `cx`, `pct` não. É regra, não formatação — vender 1,5 café é erro de
  digitação, e o banco recusa. A regra vive numa função só,
  `erp_unit_is_fractional()`, que a constraint do item e os gatilhos chamam; o
  teste de contratos compara com `UNIT_INFO` do Core, unidade por unidade.
- O **total da linha** é `round(quantidade × preço)`: meio centavo sobe.
  `lineTotalCents()` no Core faz a mesma conta em `BigInt` — em ponto
  flutuante, 12,345 kg × R$ 99.999,99 erraria no último centavo — e o teste de
  contratos confere os dois lados com casos de borda.

## Cadastro

| Tabela                   | O que é                                          | Permissão de escrita  |
| ------------------------ | ------------------------------------------------ | --------------------- |
| `erp_product_categories` | Categoria de produto; semeada pelo Blueprint     | `erp.products.write`  |
| `erp_products`           | Produto ou serviço vendável                      | `erp.products.write`  |
| `erp_customers`          | Cliente de venda — **não** é a pessoa do CRM     | `erp.customers.write` |
| `erp_payment_methods`    | Como o cliente paga, e em quantos dias o $ chega | `core.settings.write` |

- **Produto:** código interno (`sku`) e código de barras, os dois opcionais e
  únicos por tenant quando existem — dois produtos com o mesmo código de barras
  fazem o leitor do caixa escolher um. `track_stock` desligado é serviço ou item
  preparado na hora: não é baixado na venda. **Produto com venda ou
  movimentação não se apaga** — a chave estrangeira recusa; desativa-se.
  Apagar exige `erp.products.delete`, em política própria (ver
  [[../12-SECURITY/AUTHORIZATION#`for all` inclui `delete`]]).
- **Cliente:** cadastro próprio, por três motivos registrados em
  [[../16-DECISIONS/ADR-004-cliente-do-erp-nao-e-pessoa-do-crm|ADR-004]].
  Documento com o padrão do Core — CPF, ou CNPJ alfanumérico —, único por
  tenant. Quem vende (`erp.sales.write`) lê cliente, para escolher na venda.
- **Forma de pagamento:** `settlement_days` é quando o dinheiro chega. Zero é à
  vista: a venda já entra no caixa como recebida. Mais que zero é a prazo: a
  venda gera conta a receber. **Nada aqui cobra, recebe ou fala com banco** —
  boleto e maquininha integrados são externos (🔒) e não existem. Configura quem
  tem `core.settings.write`: o prazo decide quando a venda vira dinheiro, e isso
  não é decisão de balcão.

### O que o Blueprint semeia

`erp.product_categories` e `erp.payment_methods` entraram em
`TABELA_DA_SEMENTE` (`apps/web/src/server/provisioning/execute.ts`). O mercado
nasce com Hortifruti, Mercearia, Frios e laticínios, Bebidas, Limpeza e
Higiene, e com Dinheiro, Pix, Débito, Crédito e Vale-alimentação.

O nicho declara a forma pelo código (`cash`, `pix`, `debit`, `credit`,
`voucher`) e pode declarar o prazo. Quando não declara, vale o usual:
à vista para dinheiro e Pix, 1 dia para débito, 30 para crédito e vale. É
configuração, não número de negócio — a tela de vendas deixa corrigir para o
prazo da maquininha de cada um.

## Tela: `/erp/produtos`

🟡 testado, não verificado contra o banco real (25/09/2026).

| Parte                     | Onde                                   | O que faz                                                                                    |
| ------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Lista                     | `erp/produtos/page.tsx`                | Busca em nome, código e código de barras; filtro por categoria e situação, no endereço       |
| Cadastro e edição         | `product-form.tsx`, `actions.ts`       | Preço, custo com prévia da margem, unidade, categoria, códigos, controle e mínimo de estoque |
| Página do produto         | `erp/produtos/[id]/page.tsx`           | Fatos, últimas dez movimentações, tirar de venda, apagar de vez                              |
| Categorias                | `erp/produtos/categorias/`             | Criar, renomear, apagar — com quantos produtos cada uma tem                                  |
| Conferência do formulário | `lib/erp/product-input.ts` (10 testes) | As regras do Core: `parseCents`, `parseQuantity`, `checkQuantity`                            |

- **O nome é o do nicho.** Título, botão e estado vazio usam `erp.products`:
  a cafeteria cadastra "item do cardápio".
- **Saldo ao lado do preço**, quando o tenant tem estoque, com a situação
  escrita e um ícone — "no mínimo", "sem estoque", "saldo negativo". Cor nunca
  sozinha. A regra é `stockStatus()` no Core: o mínimo é o ponto de repor,
  então chegar nele já alerta.
- **Margem** é `grossMargin()` no Core, sobre o preço, com uma casa. Sem custo
  não há margem — travessão, não "0%". Abaixo do custo aparece em vermelho **e**
  escrito.
- **Tirar de venda, não apagar.** Produto com venda ou movimentação a chave
  estrangeira não deixa apagar, e a mensagem diz o caminho. Apagar de vez
  aparece só para quem tem `erp.products.delete`, e confirma antes.
- **Sem o módulo de estoque**, o interruptor e o mínimo nem aparecem — e salvar
  não mexe em `track_stock`, para não desligar o controle de todo produto no dia
  em que o módulo for contratado.
- Código interno e código de barras repetidos voltam como erro **no campo**,
  pelo nome do índice na mensagem do banco (`campoRepetido()`).

Conferida na vitrine (componentes reais, dados de exemplo, Playwright): claro e
escuro, 1440 e 375 px, sem erro de página e sem rolagem lateral. No celular o
selo "Fora de venda" desce de linha — ao lado do nome, ele engolia o nome.

## Venda

### Quem escreve o quê

Venda, itens e pagamentos só fazem sentido juntos, e o PostgREST não tem
transação. `erp_register_sale()` grava os três numa chamada, **SECURITY
INVOKER** — como `crm_convert_lead()`: cada `insert` passa pelo RLS como se a
aplicação o tivesse escrito.

O que a venda **provoca fora dela** não é escrito pela função: é derivado por
gatilho, no módulo a que pertence.

```
erp_register_sale()  ──►  erp_sales ─► erp_sale_items ─► erp_sale_payments
   (INVOKER, RLS)              │              │                  │
                               │              ▼                  ▼
                               │   inventory_on_sale_item  finance_on_sale_payment
                               │     baixa de estoque        conta a receber
                               ▼
                 cancelamento ─► inventory_on_sale_cancelled ─► devolve o que baixou
                               ─► finance_on_sale_cancelled  ─► cancela o aberto,
                                                                 devolução do recebido
```

Dois motivos. Quem vende não tem, e não deve ter, permissão de escrever no
financeiro — o operador de caixa registra venda, não lança conta; com INVOKER a
função não conseguiria, e com DEFINER seria um buraco com nome amigável. E a
venda não sabe que o financeiro existe: um tenant sem estoque vende do mesmo
jeito, e o gatilho do estoque é que não age.

### O que o banco carimba

- **Número por tenant**, sequencial — "venda nº 42" é o que vai no recibo.
  `erp_counters` trava a linha do tenant até o fim da transação, então duas
  vendas simultâneas recebem números diferentes. Tabela interna: RLS sem
  política e sem privilégio nenhum.
- **Preço, nome e unidade vêm do cadastro.** O preço digitado no item é
  ignorado. Preço de balcão é a porta mais comum de erro e de fraude de caixa;
  desconto é outra coisa — `discount_cents`, na venda, visível na lista e na
  auditoria. Quem quer vender por outro preço muda o cadastro, com a permissão
  de quem cuida dele.
- **Data é agora.** `sold_at` vindo de fora é ignorado: venda com data passada
  é a porta para mexer no caixa de um dia já fechado.
- **Forma de pagamento é retrato**: nome e prazo copiados no pagamento.
  Renomear "Crédito" ou mudar o prazo amanhã não reescreve quando o dinheiro de
  hoje chega.
- **"Venda exige cliente"** (`erp.sales_requires_customer`, padrão ligado) é
  conferida no banco, pelo gatilho da venda — para qualquer caminho, não só o
  da tela. Para isso o banco passou a saber o padrão das configurações:
  `setting_defaults`, comparada com `TENANT_SETTINGS` pelo teste de contratos
  nos dois sentidos.

### Venda registrada não muda

Errou: cancela e registra de novo. Isso não depende de a aplicação se
comportar:

- `authenticated` não tem `update` em item nem em pagamento; na venda, só em
  `status` e `cancel_reason`. Apagar: em nenhuma das três.
- Item e pagamento **só entram na transação em que a venda nasce**
  (`created_at = now()`, que é o início da transação). Sem isso, um item de
  preço zero pendurado numa venda de ontem passaria na conferência de totais —
  e baixaria estoque sem venda nenhuma.
- **No commit**, gatilhos adiados conferem que os itens somam o subtotal e os
  pagamentos somam o total. Uma venda escrita à mão pelo PostgREST, em três
  chamadas avulsas, não fecha. A função força a conferência antes de devolver,
  para o erro sair como erro da chamada.

Cada uma dessas garantias foi conferida quebrando o código de propósito: com o
trecho removido, o teste dela falha.

### Cancelar

`erp.sales.cancel` é permissão própria — Administrador e Gestor têm,
Colaborador não. Exige motivo, carimba quando e quem, grava `sale.cancelled`
na auditoria e não volta atrás. `erp_cancel_sale()` existe pela mensagem; a
garantia é a política de `update`, e um teste cancela direto na tabela para
provar.

## Pendente

| Item                         | Por quê                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| Tela `/erp/vendas`           | Vem depois do estoque                                           |
| Reordenar categorias         | Novas entram no fim; a ordem do nicho vem do Blueprint          |
| Fornecedor e compra          | `erp.suppliers.*` e `erp.purchases.*` são permissões sem tabela |
| Custo médio                  | A entrada guarda custo unitário; ninguém recalcula o do produto |
| Nota fiscal da venda         | 🔒 provedor fiscal + certificado — ver `11-FISCAL/`             |
| Venda ligada à pessoa do CRM | Coluna opcional, quando houver pedido — ADR-004                 |
