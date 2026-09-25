# Painel do negócio — `/painel`

🟡 testado, não verificado contra o banco real (25/09/2026). Migration nova:
`20260925150000_erp_sales_daily`. Tela: `apps/web/src/app/(app)/painel/`.

Até 25/09/2026 o `/painel` mostrava o estado da plataforma — "nenhum número
aqui é métrica", porque não havia CRM nem ERP para medir. Agora há, e ele
virou o painel do negócio.

## A regra

**Todo número é consulta ao banco da empresa, feita quando a página abre.**
Nada de `Math.random`, de série fixa, de estimativa ou de número de exemplo.
Um dia sem venda aparece como zero porque o banco disse zero — a função
devolve todo dia do período, com ou sem venda.

Cada seção só aparece para quem tem o módulo **e** pode ler o que ela soma. O
que a pessoa não lê não é contado como zero: a seção some. Leitura que falha
diz que falhou — nunca vira zero, que seria "não há".

## As seções

| Seção    | Permissão               | De onde vem                                                                |
| -------- | ----------------------- | -------------------------------------------------------------------------- |
| Vendas   | `erp.sales.read`        | `erp_sales_summary()` para hoje e para o mês; `erp_sales_daily()`, 14 dias |
| Dinheiro | `finance.cashflow.read` | `finance_summary()`: saldo do mês, a receber vencido, 30 dias de cada lado |
| CRM      | `crm.*.read`            | leads do mês; funil padrão por etapa; ganhos do mês; a minha agenda        |
| Estoque  | `inventory.stock.read`  | `stockSummary()` do Core sobre produtos controlados e saldos               |

"Hoje" e "o mês" são do fuso da empresa. Ganho do mês é oportunidade fechada
no mês numa etapa de ganho de **qualquer** funil; o funil por etapa mostra o
padrão, só etapas em andamento — ganho e perda são resultado, não funil.

### Vendas por dia — `erp_sales_daily()`

`(tenant, de, até, fuso)` → um registro por dia, com contagem e total das
vendas concluídas. `SECURITY INVOKER`: passa pelo RLS de `erp_sales`, como
`erp_sales_summary` — quem não vê venda recebe zeros, e a empresa alheia
também. O fuso vem como parâmetro porque `tenant_setting()` é interna
(revogada de `authenticated`). Período de um dia a três meses. Quatro testes:
dia sem venda presente, 23h30 de São Paulo no mesmo dia, cancelada fora,
empresa alheia com zeros — e três mutações pegas.

## Vazio

Empresa nova não vê fileiras de R$ 0,00. Cada seção sem dado diz como passar a
ter: "o gráfico aparece com o primeiro registro — no balcão, leva segundos";
"o dinheiro aparece com o primeiro pagamento"; "marque 'controla estoque' no
cadastro". Quem não pode ler nenhuma seção vê isso dito, com o caminho para o
tutorial.

## Movimento

Os números chegam contando (`CountUp`), 700 ms, terminando exatamente no valor
do banco. O servidor já entrega o valor final — sem JavaScript, é ele que
aparece —, e o leitor de tela lê o valor final uma vez: a contagem fica
escondida dele. Com movimento reduzido não há contagem, e as barras aparecem
prontas (`animation-delay` também zera, desde 25/09/2026).

O gráfico é SVG próprio, em duas larguras (o SVG escala o texto com a figura).
Hoje tem cor **e** rótulo; cada barra tem título com o valor; "Ver os números
de cada dia" abre a tabela.

## As onze exigências

UI (as quatro seções) · backend (leituras por seção, em paralelo) · banco
(`erp_sales_daily` e as funções que já existiam) · autorização (seção por
permissão e módulo; RLS abaixo) · validação (não há entrada) · erro (leitura
que falha diz, e não vira zero) · carregando (o esqueleto do grupo) · vazio
(cada seção diz como passar a ter dado) · 375 px (conferido, indicadores em
duas colunas) · teste (4 de banco, 5 da conta do painel) · documentação (este
arquivo).
