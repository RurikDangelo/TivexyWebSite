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

Telas prontas: **`/crm/leads`**, **`/crm/empresas`**, **`/crm/contatos`**,
**`/crm/oportunidades`** e **`/crm/atividades`**. As cinco rotas do módulo
existem.

> As três telas novas são de 24/09/2026 e estão **testadas, não verificadas
> contra o banco real**: foram construídas em sessão de nuvem, que recebe o
> repositório e não os segredos. Ver [[../PROJECT_STATE#6.2]].

## As três telas que faltavam à conversão

Converter um lead sempre criou conta, pessoa e oportunidade numa transação só.
Até aqui, **duas das três não tinham onde ser vistas**. O dado estava certo no
banco e invisível para quem trabalha — uma forma silenciosa de o sistema
mentir sobre o que faz, porque a tela de leads dizia "convertido" e não havia
para onde ir olhar.

| Tela                 | O que faz                                              |
| -------------------- | ------------------------------------------------------ |
| `/crm/empresas`      | Lista e cadastra contas                                |
| `/crm/contatos`      | Lista e cadastra pessoas, com vínculo opcional à conta |
| `/crm/oportunidades` | O quadro do funil, e move oportunidade entre etapas    |

### O quadro é de servidor, sem estado de cliente

Cada movimento é um `form` com Server Action. Arrastar-e-soltar é mais bonito
e traz duas coisas de graça que a alternativa não traz: funcionar sem
JavaScript e ser operável pelo teclado. Quando o arrastar vier, vem por cima
disto — não no lugar.

No celular as colunas viram seções empilhadas. Quadro com rolagem horizontal
em 375px esconde metade do funil atrás de um gesto que ninguém descobre.

### O quadro nunca escreve `closed_at`

Quem mantém essa coluna é o gatilho `sync_deal_closed_at`: entrou em etapa
terminal, carimba; saiu, limpa. A aplicação carimbar junto seria a segunda
verdade que o esquema recusou ter — e a que diverge no dia em que alguém mover
a etapa por importação.

Pelo mesmo motivo o funil **não é campo de formulário**: ele é lido da etapa,
no servidor. `crm_deals` guarda `pipeline_id` e `stage_id`, e o gatilho
`assert_deal_stage_in_pipeline` recusa a linha em que os dois discordam.
Receber os dois do formulário seria deixar o navegador escolher se eles
combinam.

### O teto de 500, e por que ele é anunciado

Uma coluna "Ganhas" acumula para sempre. O quadro carrega no máximo 500
oportunidades por funil — e **diz quando cortou**, porque os totais de cada
coluna somam o que veio, não o que há. Teto silencioso produziria um número
plausível e errado em cima de dinheiro, que é a pior mentira que este sistema
pode contar.

### O documento subiu para o Core

`checkDocument()`, `onlyDigits()` e `formatDocument()` vivem em
`packages/core/src/documento.ts`, junto de `parseCents` e pelo mesmo motivo: o
ERP vai cadastrar cliente e fornecedor com os mesmos CPF e CNPJ, e uma segunda
implementação num formulário é a que grava com pontuação — aí a mesma empresa
cadastrada de dois jeitos parece duas.

Grava-se só dígito, porque `crm_companies_document_digits` exige. Isso tem
teste dos dois lados: contra a expressão em `documento.test.ts`, e contra o
Postgres em `supabase/tests/crm.test.mjs`, que também prova que a colagem
pontuada — a mais comum — seria recusada sem a limpeza.

**O dígito verificador não é conferido.** `11111111111` passa. Está escrito no
código para não ser confundido com validação de verdade; conferir o dígito é
decisão separada, e dizer que existe seria pior do que não ter.

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

## A agenda

`/crm/atividades` mostra o que precisa ser feito, agrupado em **atrasadas,
hoje, próximas, sem prazo e concluídas**.

### O alvo é um campo só, porque a constraint diz que é um alvo só

`crm_activities_one_target` exige exatamente uma das quatro colunas de alvo
preenchida. Quatro campos na tela poderiam discordar entre si, e a pessoa
descobriria no erro de constraint.

A tela usa um `select` com `<optgroup>` por tipo, e o valor carrega o tipo
junto: `lead:<uuid>`. Não há como escolher dois, nem nenhum. O servidor
decodifica e decide a coluna — conferindo o tipo **contra a lista**, nunca
contra o que veio, porque nome de coluna montado a partir da rede é como se
escreve injeção sem perceber.

### "Atrasada" depende do fuso do cliente, não do servidor

Esta é a parte que parece detalhe e não é.

`due_at` é `timestamptz`, e `<input type="datetime-local">` manda hora de
parede sem fuso: `2026-09-24T14:30`. `new Date()` interpretaria no fuso do
**servidor**, que na Vercel é UTC — a atividade das duas e meia da tarde
entraria como 11:30 e **nasceria atrasada**.

O fuso certo é o do tenant (`core.timezone`), e quem converte é
`zonedToUtc()`, em `packages/core/src/tempo.ts`. Três coisas que aquele
arquivo resolve e que uma implementação apressada erra:

| Armadilha                   | O que acontece sem tratar                               |
| --------------------------- | ------------------------------------------------------- |
| Horário de verão            | O deslocamento **muda com a data**; constante não serve |
| `hour12: false`             | Alguns runtimes dizem 24h, e 24h vira o dia seguinte    |
| `Date.UTC` normaliza calado | Mês 13 vira janeiro do ano que vem, sem erro nenhum     |

Os três têm teste, e quase todos usam `America/New_York` em vez de São Paulo
— o Brasil não tem mais horário de verão desde 2019, então um código errado
passaria em todo teste brasileiro e quebraria no primeiro cliente de fora.

### "Hoje" é dia de calendário, não 24 horas

`faixaDe()` classifica com `calendarDaysBetween`, não com subtração de
milissegundos. Uma atividade marcada para hoje às 23:00 não é "amanhã" só
porque faltam menos de 24 horas, e a de hoje às 09:00, olhada às 18:00, é
atrasada — de hoje, mas atrasada.

**Concluída ganha de tudo.** Uma atividade feita ontem com prazo de anteontem
não é atrasada: ela foi feita. Manter no vermelho o que já foi resolvido
treina quem usa a ignorar o vermelho.

### Apagar o alvo apaga a agenda dele

`on delete cascade` nas quatro colunas de alvo, e `set null` no tipo. A
diferença é o que cada um significa: sem alvo a atividade não quer dizer nada
— e `set null` ali produziria justamente o que a constraint de alvo único
recusa, fazendo o `delete` do lead falhar por causa de uma atividade. Sem
tipo, ela continua sendo "ligar para o cliente na terça".

## O que falta

- **Editar e excluir** — as quatro telas cadastram e listam; nenhuma altera
  linha existente. Corrigir um telefone errado ainda exige SQL
- Detalhe de conta e de pessoa — hoje não há para onde clicar a partir da
  listagem, então o histórico de uma conta não tem onde aparecer
- Busca e filtro (hoje a listagem traz as 200 primeiras por nome, e o quadro
  do funil as 500 mexidas mais recentemente)
- Responsável (`owner_id`) — a coluna existe em todas as tabelas e nenhuma
  tela a preenche
- `crm.contact_requires_document`: a configuração está no catálogo do Core e
  **nada a consome**. `crm_contacts` não tem coluna de documento — só
  `crm_companies` tem. Honrá-la exige migration, então ligá-la hoje não faria
  efeito nenhum, que é o defeito sem sintoma que o próprio catálogo existe
  para evitar
- Importação
- Atendimento e conversas — dependem das credenciais Meta/WhatsApp 🔒
