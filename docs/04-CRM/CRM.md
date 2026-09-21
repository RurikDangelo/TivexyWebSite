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

Tela pronta: **`/crm/leads`**. As outras rotas existem em `routes.ts` e ainda
não têm página — a navegação as mostra desabilitadas, de propósito.

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

**A conversão ainda não existe.** É o próximo passo do módulo.

## Dinheiro

`value_cents bigint`, inteiro. `numeric` também serviria; ponto flutuante não
serve, e é o engano que só aparece quando a soma do relatório fecha um centavo
fora do extrato.

`parseCents()` trata **ponto como separador de milhar** e vírgula como decimal.
Lido ao contrário, `1.234` vira R$ 1,23 — um erro de mil vezes que passa
despercebido porque o número continua plausível na tela. Entrada inválida vira
`null`, nunca zero: zero grava uma oportunidade de R$ 0,00 que ninguém pediu.

## O que falta

- Telas de contatos, contas, funil e atividades
- Conversão de lead
- Busca e filtro (hoje a listagem traz as 200 mais recentes)
- Importação
- Atendimento e conversas — dependem das credenciais Meta/WhatsApp 🔒
