# ADR-003 — Blueprint é configuração de provisionamento, não motor de esquema

**Data:** 19/09/2026 · **Status:** Aceita ·
**Altera:** [[ADR-002-ordem-de-construcao|ADR-002]], regra 2

## Contexto

O ADR-002 adiou o Blueprint Engine para depois de um módulo de negócio real,
com um argumento que continua correto: abstrair configuração antes de ter um
negócio concreto funcionando é adivinhar a forma da abstração.

Em 19/09/2026 o objetivo da semana foi definido: **provisionamento de clientes
funcionando com Blueprint**, documentado por inteiro.

Isso parece colidir com o ADR-002. Relendo, não colide — porque "Blueprint"
estava significando duas coisas diferentes, e só uma delas é prematura.

## A distinção

**Blueprint como configuração de provisionamento.** Um documento declarativo por
nicho que responde: quais módulos habilitar, que dados semear, que terminologia
usar, que papéis criar. É a entrada do fluxo que já existe — o `payload` de
`provisioning_runs`, hoje um `jsonb` sem forma, passa a ter forma e versão.

**Blueprint como motor de esquema em tempo de execução.** Entidades definidas
por dado, formulários gerados, campos criados pelo cliente, relacionamentos
dinâmicos. Um sistema que interpreta configuração para produzir estrutura.

O ADR-002 rejeita o segundo, e continua certo. O primeiro não é abstração sobre
um negócio que não existe — é **dar nome ao que o provisionamento já faz**. O
fluxo já habilita módulos e semeia padrões; hoje isso está espalhado entre
código e um `jsonb` livre.

## Decisão

Construir o Blueprint como **configuração declarativa de provisionamento**,
agora, junto com o provisionamento.

Não construir o motor de esquema em tempo de execução nesta semana. O ADR-002
segue valendo para ele: vem depois de um módulo de negócio real.

O limite entre os dois, escrito para não escorregar:

| Blueprint **pode** decidir                           | Blueprint **não** decide                 |
| ---------------------------------------------------- | ---------------------------------------- |
| Quais módulos o tenant nasce com                     | Que tabelas existem                      |
| Que papéis além dos de sistema, e com que permissões | Que permissões existem (isso é catálogo) |
| Como cada coisa se chama para aquele nicho           | O que cada coisa é                       |
| Que dados iniciais semear                            | Que campos um registro tem               |
| Que valores padrão as configurações assumem          | Que configurações existem                |

A regra de bolso: **Blueprint escolhe entre opções que o Core já oferece.** Se
uma escolha exige código novo no Core para funcionar, ela não é Blueprint —
é funcionalidade.

## Alternativas consideradas

**Manter o ADR-002 ao pé da letra e adiar tudo.** Rejeitada: adiaria também a
parte que não é prematura, e deixaria o `payload` de provisionamento como um
`jsonb` sem contrato — que é a forma mais cara de dívida, porque ninguém sabe
o que pode chegar ali.

**Construir o motor completo nesta semana.** Rejeitada pelo mesmo argumento do
ADR-002, agora com um agravante: prazo curto é exatamente quando abstração
prematura vira permanente, porque não sobra tempo para desfazer.

**Blueprint como código, um módulo TypeScript por nicho.** Rejeitada: forkar
código por nicho é o problema que o Tivexy existe para resolver. Um nicho novo
não pode exigir deploy.

## Consequências

**Boas:** o provisionamento ganha contrato tipado em vez de `jsonb` livre. Um
nicho novo vira um documento, não um deploy. E a fronteira fica escrita antes de
alguém precisar dela.

**Custo:** blueprints ficam limitados ao que o Core oferece. Quando um nicho
pedir algo que o Core não tem, a resposta é construir no Core — não é aumentar o
Blueprint para compensar. Isso vai parecer lento em algum momento, e a tabela
acima existe para esse momento.

**O que fica em aberto:** onde os blueprints moram. Começam versionados no
repositório, como dado de referência. Virar tabela editável pelo Super Admin é
decisão posterior, e só faz sentido depois que existir um segundo nicho de
verdade para comparar.

**Teste que define o marco:**

> Provisionar dois tenants de nichos diferentes a partir de blueprints, e o
> resultado diferir **só** no que o blueprint declara — mesmos módulos onde os
> blueprints coincidem, módulos diferentes onde divergem, e nenhuma diferença
> que não esteja escrita no blueprint.
