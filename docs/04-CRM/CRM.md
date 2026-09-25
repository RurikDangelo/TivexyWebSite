# CRM

> O primeiro módulo de negócio. Ele não reimplementa nada do Core — quem é a
> pessoa está em [[../03-CORE/AUTHENTICATION|AUTHENTICATION]], o que ela pode
> em [[../12-SECURITY/AUTHORIZATION|AUTHORIZATION]], e o isolamento em
> [[../12-SECURITY/MULTI_TENANCY|MULTI_TENANCY]].

## O que existe

| Tabela                | O que guarda                                          |
| --------------------- | ----------------------------------------------------- |
| `crm_companies`       | Conta: a empresa com quem se negocia                  |
| `crm_contacts`        | Pessoa. Pode pertencer a uma conta ou existir sozinha |
| `crm_leads`           | Contato ainda não qualificado                         |
| `crm_pipelines`       | Funil                                                 |
| `crm_pipeline_stages` | Etapa do funil, com o que ela significa               |
| `crm_deals`           | Oportunidade                                          |
| `crm_activity_types`  | Tipo de atividade — consulta, retorno, visita         |
| `crm_activities`      | A atividade em si                                     |

Telas prontas: **`/crm/leads`** e **`/crm/oportunidades`** — o quadro, a página
de cada oportunidade e o editor de funis. As outras rotas existem em
`routes.ts` e ainda não têm página — a navegação as mostra desabilitadas, de
propósito.

## A decisão estrutural: chave estrangeira composta

A revisão adversarial do Core encontrou três defeitos da **mesma família**: uma
linha apontando para outra de um tenant diferente. Vínculo com papel de outro
tenant, equipe com membro de outro tenant. O RLS não pega isso — ele decide
quais linhas alguém enxerga, não se os valores de uma linha fazem sentido
juntos.

No Core aquilo virou gatilho, porque papel de sistema tem `tenant_id` nulo e a
chave composta não fecharia. Aqui **toda** linha pertence a exatamente um
tenant, então dá para fazer melhor: cada tabela tem `unique (tenant_id, id)`, e
cada referência leva o `tenant_id` junto.

```sql
foreign key (tenant_id, pipeline_id)
  references public.crm_pipelines (tenant_id, id)
```

Apontar para outro tenant deixa de ser defeito a testar e passa a ser
**impossível de escrever**. Não há gatilho para esquecer de criar nem ordem de
execução para dar errado — é o Postgres recusando.

Há teste provando que a recusa vale **fora do RLS**, com privilégio total. Esse
é o caminho do provisionamento, que usa a chave de serviço: se só o RLS
protegesse, o provisionamento poderia escrever a referência cruzada.

### O que a chave composta não alcança

Dentro de um tenant há vários funis, e nada impediria a oportunidade do funil A
parar numa etapa do funil B. Aí sim existe gatilho
(`crm_deals_stage_do_pipeline`). O sintoma sem ele seria uma oportunidade que
some da tela do funil dela e aparece na de outro.

## A situação da oportunidade é a da etapa

`crm_deals` **não tem coluna de status**. A situação — aberta, ganha, perdida —
é o `kind` da etapa em que ela está.

Guardar as duas seria manter duas verdades, e elas divergiriam no dia em que
alguém movesse a etapa por importação, automação ou SQL. A divergência não
daria erro: só relatório errado.

`closed_at` é a única coisa que não dá para derivar, e quem a mantém é um
gatilho — não a aplicação. Deixar a data a cargo de quem escreve significa que
uma oportunidade movida para "Perdido" por importação fica sem data de
fechamento, e o relatório de ciclo de venda passa a mentir em silêncio.

## Atividade aponta para exatamente um alvo

Quatro colunas — `lead_id`, `contact_id`, `company_id`, `deal_id` — cada uma
com chave estrangeira de verdade, e um check exigindo que exatamente uma esteja
preenchida.

O caminho mais curto seria um par polimórfico `(subject_type, subject_id)`, que
nenhuma chave estrangeira consegue conferir: a referência quebra em silêncio
quando o alvo é apagado, e a agenda passa a mostrar atividade de gente que não
existe mais.

## O vocabulário do nicho

**Uma clínica lê "interessados" onde uma consultoria lê "leads"**, na mesma
tela, sem fork.

O Blueprint sempre pôde traduzir rótulos, e `checkBlueprint()` sempre validou
cada chave contra o catálogo. O que faltava era **gravar**: o plano de
provisionamento não tinha operação para isso, e o tenant nascia com módulos,
papéis e sementes do nicho — e sem o vocabulário.

Isso só apareceu quando esta tela precisou escolher entre dizer "Leads" e dizer
o que o nicho chama de lead. Antes não havia como perceber, porque não havia
tela que perguntasse.

Hoje o vocabulário vai para `tenants.terms` junto do tenant, e
`lib/crm/terms.ts` o lê. A leitura é do **tenant**, não do documento: o nicho
pode mudar no repositório depois do provisionamento, e ninguém quer que os
rótulos de um cliente mudem sozinhos num deploy.

Quando o nicho não traduz uma chave, cai no rótulo genérico. Um nicho que não
traduz tudo continua funcionando.

## As sementes deixaram de ficar pendentes

`crm.pipelines`, `crm.pipeline_stages` e `crm.activity_types` estavam
declarados na clínica odontológica desde antes de existir tabela, e ficavam
registrados como pendentes. Agora viram linha.

As etapas citam o funil **pelo nome** — o documento é escrito à mão e não tem
como conhecer um uuid. Isso exige que o funil venha antes na lista, e
`checkBlueprint()` recusa o documento em que não vem: sem essa checagem, trocar
duas linhas de lugar no JSON passa na validação e quebra no meio de um
provisionamento real, com o cliente já criado.

As sementes de ERP continuam pendentes, porque as tabelas do ERP não existem. A
diferença entre os dois é o que prova que "pendente" não é preguiça.

## O RLS é o piso, não o filtro

Toda consulta desta tela filtra por `tenant_id` explicitamente, **apesar** do
RLS.

O RLS garante que nada de outra empresa volte. Ele não escolhe entre as
empresas de **quem está pedindo**: quem participa de duas tem permissão nas
duas, e a consulta sem filtro devolveria as duas listas misturadas.

Vale também na escrita. `moverLead()` carrega o tenant no `where` pelo mesmo
motivo, mais o estado de origem — que faz dois cliques rápidos não aplicarem a
transição duas vezes.

## Módulo desabilitado não é fronteira de segurança

As políticas checam pertencimento e permissão, e **não** checam
`tenant_modules.is_enabled`.

Desabilitar um módulo é evento comercial, não de segurança: o dado continua
sendo do cliente e precisa seguir alcançável para exportação, suporte e
reativação. Quem esconde o módulo é `decideAccess()`, com texto que manda falar
com o comercial em vez de com o administrador da empresa.

## Converter não é trocar de estado

`nextLeadStatuses()` nunca oferece `converted`. Converter cria conta, pessoa e
oportunidade numa transação, e quem faz isso é o servidor — oferecer como
transição solta deixaria o lead marcado como convertido sem nada do outro lado,
e o relatório de origem passaria a contar clientes que não existem.

### `crm_convert_lead()`, no banco

São quatro escritas que só fazem sentido juntas, e o cliente PostgREST **não
tem transação**: cada chamada é a sua. Quatro chamadas seguidas significam
quatro pontos onde a rede pode cair, e cada um deixa um estrago diferente:

| Cai depois de… | O que fica                                         |
| -------------- | -------------------------------------------------- |
| a conta        | conta órfã, sem pessoa e sem oportunidade          |
| a pessoa       | pessoa sem oportunidade, lead ainda "qualificado"  |
| o negócio      | oportunidade real, lead que não sabe que converteu |

O terceiro é o pior, porque **não parece defeito**: a oportunidade aparece no
funil, e o lead continua na fila esperando alguém ligar de novo.

Dentro de uma função, o corpo inteiro é uma transação. Há teste que faz a
conversão falhar **no meio** — com um papel que escreve conta e não escreve
pessoa — e confere que a conta não ficou.

### `SECURITY INVOKER`, e por quê

Diferente das funções auxiliares do RLS, que precisam de `DEFINER` para não
recorrer. Com `INVOKER`, cada `insert` passa pela política da tabela como se
a aplicação o tivesse escrito.

Uma função `DEFINER` aqui seria um buraco com nome amigável: capaz de criar
conta, pessoa e oportunidade para quem só podia ler lead. Trocar uma palavra
por outra quebra dois testes — o de isolamento entre tenants e o de
atomicidade.

A checagem de permissão logo no começo **não é a garantia** — a garantia é o
RLS. É a mensagem: sem ela, quem não tem `crm.deals.write` também não tem
`crm.deals.read`, a política esconde a etapa, e a função responderia "etapa não
encontrada". A pessoa procuraria a etapa, que está lá.

### Conta existente é reaproveitada

Por nome, ignorando caixa, **a mais antiga**. É troca consciente: reaproveitar
pode grudar o negócio na empresa errada quando há duas homônimas, e não
reaproveitar enche a base de duplicatas — o defeito clássico de CRM e o mais
caro de limpar. Os dois enganos são visíveis na tela da conta; duplicata é o
que ninguém percebe até ter trezentas.

`order by created_at` e não `limit 1` solto: sem ordem, qual homônima leva o
negócio depende do plano de execução, e mudaria sozinho quando a tabela
crescesse.

Lead sem nome de empresa não cria conta nenhuma. Pessoa física é caso normal.

## Dinheiro

`value_cents bigint`, inteiro. `numeric` também serviria; ponto flutuante não
serve, e é o engano que só aparece quando a soma do relatório fecha um centavo
fora do extrato.

`parseCents()` trata **ponto como separador de milhar** e vírgula como decimal.
Lido ao contrário, `1.234` vira R$ 1,23 — um erro de mil vezes que passa
despercebido porque o número continua plausível na tela. Entrada inválida vira
`null`, nunca zero: zero grava uma oportunidade de R$ 0,00 que ninguém pediu.

## Todo funil precisa de por onde sair

Cada etapa tem um `kind`: `open`, `won` ou `lost`. Um funil sem `won` nunca
fecha negócio; sem `lost`, não há onde registrar quem não comprou.

Os dois são erros de **dado** e nenhum quebra nada — o funil funciona, recebe
negócio, e o relatório nunca fecha. `checkBlueprint()` recusa o documento, que
é o único momento em que dá para avisar.

Isso apareceu na verificação: a clínica odontológica tinha cinco etapas, todas
`open`. O funil estava lá, bonito na tela, e nenhum tratamento teria como ser
dado por concluído.

## O quadro — `/crm/oportunidades`

Desde 25/09/2026 🟡 _testado, não verificado contra o banco real._

As colunas são as etapas do funil, na ordem de `orderStages()`: as em
andamento pela posição, depois ganho, depois perda. **O tipo vence a
posição** — um funil semeado com "Perdido" na posição 3 desenharia a perda no
meio do caminho.

**Duas formas de mover, pela mesma função.** Arrastar é o gesto com mouse, e o
arrastar do HTML não existe em toque, teclado nem leitor de tela. "Mover
para…", em cada cartão, é um `<details>` com um botão por etapa: alcançável por
qualquer um, e anunciado numa região `aria-live`. O cartão muda de coluna na
hora (`useOptimistic`) e volta sozinho se o servidor recusar.

**A etapa de origem vai no `where`.** Dois cliques rápidos, ou duas pessoas
arrastando o mesmo cartão, não aplicam o movimento duas vezes.

**As colunas de ganho e perda mostram 30 dias.** Sem corte, a coluna de ganho
cresceria para sempre e esconderia o funil que está andando. São dias de
calendário do tenant (`core.timezone`), não 30 × 24 h.

O cartão mostra só fato: previsão (vencida em vermelho, com texto — cor não é a
única portadora), e **"sem mudança há N dias"** a partir de 7, contado de
`updated_at` no calendário do tenant. Não é "esfriando" nem "em risco": é a
medida, e quem lê tira a conclusão.

Os totais — por coluna e no resumo — saem de `stageTotals()` e `boardTotals()`,
em centavos inteiros, sobre o **mesmo** estado otimista dos cartões. A soma
anda junto com o cartão arrastado, e o filtro "Sou responsável" filtra os dois.

### O editor de funis — `/crm/oportunidades/funis`

| O que se muda                         | O que protege                                            |
| ------------------------------------- | -------------------------------------------------------- |
| Criar funil                           | `crm_create_pipeline()` — nasce com Ganho e Perdido      |
| Trocar o padrão                       | `crm_set_default_pipeline()` — uma transação, não duas   |
| Tipo ou funil de etapa com negócio    | gatilho `crm_pipeline_stages_keeps_deals` recusa         |
| Excluir etapa ou funil com negócio    | `on delete restrict` da chave composta                   |
| Excluir a última etapa de ganho/perda | a action recusa, pela mesma `missingExits()` do quadro   |
| Reordenar                             | só entre etapas em andamento; ganho e perda ficam no fim |

**Por que o gatilho de tipo existe.** `closed_at` é carimbado quando a
oportunidade **muda de etapa**. Se a etapa mudasse de `open` para `won`, as
oportunidades dela passariam a ganhas sem data de fechamento — o relatório de
ciclo de venda deixaria de fechar, sem erro. Propagar seria pior: carimbaria
`now()` em negócios que fecharam em outro dia. Recusar é o certo, e a
mensagem da recusa **fala o vocabulário do tenant**: o gatilho lê
`tenants.terms` e diz "ainda tem tratamentos" para a clínica.

Salvar o tipo de etapa é um clique à parte, não a troca do seletor: com
teclado, cada seta muda o valor, e salvar na troca gravaria um tipo por tecla.

### Conferido numa vitrine, não contra o banco

Sem `.env` na sessão de nuvem, o quadro foi montado com dados de fixture num
Chromium de verdade (Playwright), a 1440 e 375 px, nos dois temas: arrastar,
mover pelo teclado, recusa do servidor voltando o cartão, e o filtro levando o
resumo junto. **Foi a vitrine que achou o defeito mais sério da tela:** o texto
`sr-only` é `position: absolute`, e escapava do contêiner que rola porque ele
não era o bloco de contenção — a página inteira ganhava 500 px de rolagem
horizontal no desktop. Nenhum teste de unidade veria isso.

A vitrine não entrou no repositório: ela carrega número inventado em tela, e o
`CLAUDE.md` não deixa isso existir nem rotulado.

## O que falta

- Telas de contatos, contas e atividades
- Busca e filtro (hoje a listagem traz as 200 mais recentes)
- Importação
- Atendimento e conversas — dependem das credenciais Meta/WhatsApp 🔒
