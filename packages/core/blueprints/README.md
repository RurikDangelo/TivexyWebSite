# Blueprints de nicho

Um nicho é um **documento**, não um fork. É isto que impede o Tivexy de virar
uma coleção de sistemas parecidos mantidos em paralelo.

Cada arquivo aqui descreve como um tipo de negócio nasce: quais módulos vêm
ligados, como as coisas se chamam, que papéis existem além dos três de sistema,
e que dados o cliente encontra no primeiro acesso em vez de uma tela vazia.

A decisão de escopo está em
[[../../../docs/16-DECISIONS/ADR-003-blueprint-como-configuracao|ADR-003]]. O
contrato está em `../src/blueprint.ts`. O portão está em
`../src/blueprints.test.ts`.

## A regra que define o limite

> **Blueprint escolhe entre opções que o Core já oferece.** Se uma escolha
> exige código novo no Core para funcionar, ela não é Blueprint — é
> funcionalidade.

| Blueprint **pode** decidir                  | Blueprint **não** decide                 |
| ------------------------------------------- | ---------------------------------------- |
| Quais módulos o tenant nasce com            | Que tabelas existem                      |
| Que papéis criar, e com que permissões      | Que permissões existem — isso é catálogo |
| Como cada coisa se chama para aquele nicho  | O que cada coisa é                       |
| Que dados iniciais semear                   | Que campos um registro tem               |
| Que valores padrão as configurações assumem | Que configurações existem                |

Quando um nicho pedir algo fora da coluna da esquerda, a resposta é construir no
Core — não aumentar o Blueprint para compensar. Vai parecer lento em algum
momento, e esta tabela existe para esse momento.

## O formato

```jsonc
{
  "code": "cafeteria", // kebab-case, igual ao nome do arquivo
  "name": "Cafeteria", // como aparece ao Super Admin
  "description": "...", // uma linha sobre para quem serve
  "version": 1, // sobe quando o conteúdo muda de forma relevante
  "plan": "profissional", // sugestão; o Super Admin pode trocar
  "modules": ["core", "erp"], // `core` é obrigatório
  "terms": { "erp.products": { "singular": "...", "plural": "..." } },
  "roles": [{ "code": "barista", "name": "Barista", "permissions": ["..."] }],
  "seeds": [{ "entity": "erp.payment_methods", "values": { "name": "Pix" } }],
  "settings": { "erp.sales_requires_customer": false },
}
```

### Detalhes que já causaram confusão

**`core` é obrigatório.** É onde vivem tenant, usuários e permissões. Sem ele o
provisionamento pararia na etapa de criar o administrador.

**Singular e plural são separados.** Português não pluraliza por regra única
— "cliente/clientes", mas "cliente final/clientes finais". Concatenar "s"
produz erro que a pessoa vê todo dia na interface.

**Permissão de papel precisa ser de módulo habilitado.** Um papel com
`crm.leads.write` num blueprint sem CRM cria gente com permissão para uma tela
que não existe: o RLS nega por módulo, e a pessoa vê "módulo não contratado"
com a permissão no bolso. A validação recusa.

**`version` é do documento, não do formato.** Serve para responder depois
"este tenant nasceu com qual configuração?".

### Rótulo e configuração precisam existir

As duas são validadas contra o Core, e por um motivo específico: **chave errada
não dá erro, só não tem efeito.** `erp.produtos` em vez de `erp.products`
simplesmente nunca aplicaria o rótulo, e a tela mostraria o nome genérico como
se estivesse tudo certo. É o defeito que ninguém encontra, porque não há
sintoma — só ausência.

**Rótulos** (`terms`): a chave é `modulo.recurso`, e a lista vem das próprias
permissões do catálogo. Tudo que o Core protege pode ser renomeado:

```
core.tenant  core.users  core.roles  core.teams  core.audit  core.settings
crm.leads  crm.contacts  crm.companies  crm.deals  crm.activities
erp.products  erp.customers  erp.suppliers  erp.sales  erp.purchases
inventory.stock  inventory.movements
finance.payables  finance.receivables  finance.cashflow
fiscal.documents  automation.rules  ai.assistant  integrations.connections
```

**Configurações** (`settings`): a lista está em `packages/core/src/settings.ts`,
com tipo, padrão e descrição de cada uma. O valor é conferido contra o tipo —
`"sim"` onde se espera booleano é recusado com a mensagem certa.

| Chave                           | Tipo     | Padrão              |
| ------------------------------- | -------- | ------------------- |
| `core.currency`                 | BRL      | `BRL`               |
| `core.timezone`                 | texto    | `America/Sao_Paulo` |
| `crm.contact_requires_document` | booleano | `false`             |
| `erp.sales_requires_customer`   | booleano | `true`              |
| `inventory.deduct_on_sale`      | booleano | `true`              |

**Adicionar uma configuração é mudança de Core, não de Blueprint.** É a regra
do ADR-003 funcionando na prática: quando um nicho precisa de algo que não está
na lista, a resposta é construir no Core — não inventar uma chave no documento.

Só entra no blueprint o que for **diferente do padrão**. O que fica gravado no
tenant é a diferença, não o resultado: assim um padrão novo alcança quem já
existe, sem migração, e continua dando para responder "o que este cliente mudou
de propósito?".

### Os módulos precisam caber no plano

`checkBlueprint` valida contra o catálogo, mas não sabe qual plano inclui quais
módulos — isso é dado do banco. O provisionamento **recusa** um blueprint que
peça módulo fora do plano declarado:

| Plano          | Módulos                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `essencial`    | core, crm                                                                |
| `profissional` | core, crm, erp, inventory, finance, automation                           |
| `avancado`     | core, crm, erp, inventory, finance, automation, fiscal, ai, integrations |

Declarar **menos** que o plano é normal e esperado: `cafeteria` usa
`profissional` e fica sem CRM e sem automação, porque uma cafeteria não precisa
deles.

Declarar **mais** é recusado. O esquema permite um tenant ter módulo além do
plano — cortesia, piloto, migração —, mas isso é decisão comercial explícita e
auditada, não algo que um documento de nicho concede em silêncio para todo
cliente daquele nicho. Se um blueprint precisa de um módulo, o plano dele é
outro.

### As sementes ainda não são aplicadas

Os módulos de negócio não têm tabela: `crm.pipelines` e
`erp.product_categories` não existem. As sementes ficam **registradas como
pendentes** no resultado da etapa `seed_defaults`, com o motivo — não são
aplicadas, e o provisionamento não finge que foram.

Vale escrevê-las mesmo assim: são a especificação do que o nicho precisa, e
quando as tabelas existirem elas já estarão lá para serem aplicadas.

## Adicionar um nicho

1. Copie o JSON mais próximo e **revise rótulo por rótulo**. Copiar sem revisar
   é o erro mais comum, e há um teste que o pega: se todos os rótulos forem
   genéricos, o nicho não está sendo configurado.
2. O nome do arquivo precisa ser igual ao `code`.
3. `npm run test:core` — a validação roda sobre todos os arquivos da pasta,
   então o seu é coberto por existir, sem registro em lista nenhuma.

A validação relata **todos** os problemas de uma vez, com o caminho dentro do
documento (`roles[1].permissions[3]`). Escrever blueprint não deveria ser um
jogo de tentativa e erro com um ciclo por engano.

## Nichos existentes

| Arquivo                     | Módulos                       | O que caracteriza                         |
| --------------------------- | ----------------------------- | ----------------------------------------- |
| `cafeteria.json`            | core, erp, inventory, finance | Venda no balcão, baixa de insumo, sem CRM |
| `clinica-odontologica.json` | core, crm, finance            | Paciente, convênio, funil de tratamento   |

Os dois diferem em módulo **e** em vocabulário — é isso que um teste verifica,
porque se todos os nichos habilitassem o mesmo, o Blueprint não estaria
configurando nada.

## Onde eles vão morar

Hoje: versionados aqui, como dado de referência — igual ao catálogo.

Depois: possivelmente uma tabela editável pelo Super Admin. É decisão em aberto,
e só vale a pena depois que existir um terceiro nicho de verdade para comparar.
O formato é o mesmo nos dois casos, e `checkBlueprint` valida igual venha de
arquivo ou de linha.
