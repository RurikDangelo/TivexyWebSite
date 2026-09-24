# Automações

> Gatilho → condição → ação. **Só ação interna**, e a fronteira é decisão, não
> atraso.

## ⚠️ Por que não existe ação de e-mail, WhatsApp ou webhook

O projeto não tem SMTP próprio nem credencial da Meta. Uma automação que
dissesse "notifiquei o cliente" sem notificar ninguém é **pior do que
automação nenhuma** — ela faz a pessoa parar de conferir, e o cliente que não
foi avisado só descobre quando reclama.

Há teste travando isso: nenhum código de ação pode casar com
`/mail|whatsapp|sms|webhook|notify|push/`. Quando houver canal, a ação nova
entra no catálogo com execução de verdade.

## A decisão mora no Core; a escrita, na aplicação

`packages/core/src/automation.ts` é puro: recebe um evento e as regras,
devolve a lista de ações. Sem banco, sem relógio, sem rede.

Não é preferência de estilo. Um motor que decide e escreve junto só pode ser
testado com banco, e aí cada combinação de operador e valor custa uma
transação — então ninguém escreve os casos, e o motor dispara errado em
produção. Aqui cada caso custa milissegundos, e há 38 deles.

É a mesma divisão de `planProvisioning()` e `executeProvisioning()`.

## As duas armadilhas de comparação

### Campo ausente nunca casa

A resposta intuitiva está errada. Tratar ausente como string vazia faria
"origem **é diferente de** Instagram" disparar para todo lead **sem origem** —
o contrário do que quem escreveu a regra quis dizer.

`exists` e `empty` são os operadores que respondem sobre ausência; os outros
recusam campo nulo.

### Número é comparado como número

`"900" > "1000"` é **verdadeiro** em texto. Sem tratar isso, "venda acima de
mil reais" dispararia para vendas de novecentos, e ninguém perceberia.

Texto que parece número é convertido — quem digita na tela manda texto. E
comparação de ordem exige que **os dois** lados sejam número: "valor maior que
abc" não vira comparação de texto que às vezes dá verdadeiro.

## `checkRule()` pega o que o banco não pegaria

Condição sobre um campo que aquele gatilho **nunca traz**. Sem isso a regra é
salva, nunca dispara e não dá erro — o defeito sem sintoma. A tela oferece só
os campos do gatilho escolhido, e o servidor confere de novo.

Relata **todos** os problemas de uma vez, como `checkBlueprint()`: corrigir um
por vez, salvando e vendo o próximo, é o que faz alguém desistir no terceiro.

## Uma automação nunca derruba o que a provocou

Quem dispara acabou de cadastrar um lead ou confirmar uma venda. Se a
automação falhar, **a operação original continua valendo**. A falha vira linha
em `automation_runs`, com o motivo.

O contrário seria pior de um jeito difícil de explicar: uma regra mal escrita
impediria de cadastrar lead, com uma mensagem sobre automação para quem só
queria anotar um telefone.

Por isso também as automações rodam **depois** da transação de
`erp_confirm_sale`, não dentro dela: dentro, uma regra ruim faria a venda
inteira voltar atrás com o estoque já baixado no cliente.

## O histórico é parte do produto

Sem ele, automação é mágica: o cliente vê uma atividade que ninguém criou e
não tem como descobrir de onde veio. `automation_runs` responde "por que isso
apareceu na minha agenda?" — e guarda **as falhas junto**, porque automação
que falha calada é pior que automação nenhuma.

O histórico sobrevive à regra: `rule_id` é `on delete set null`, e o **nome**
fica gravado à parte. Sem o nome, apagar a regra deixaria uma linha órfã que
não responde nada.

## O defeito que um teste encontrou

A primeira versão protegia o histórico com um gatilho
`before update or delete` que levantava exceção. Um teste de apagar tenant
derrubou a ideia: **o gatilho bloqueia também as ações referenciais do próprio
Postgres.** `on delete set null` é um `update`, e o `on delete cascade` de
`tenants` é um `delete` — com o gatilho, apagar um cliente falharia, com uma
mensagem sobre histórico de automação.

A correção é revogar `update, delete` de `authenticated`: protege exatamente
quem precisa ser protegido — a aplicação — e deixa o Postgres cuidar das
próprias referências.

**O mesmo defeito estava latente em `erp_stock_movements`**, escrito no mesmo
dia com o mesmo gatilho, e sem teste de apagar tenant para expô-lo. Os dois
foram corrigidos juntos, e o teste que faltava entrou.

E os testes desses dois passaram a rodar **como usuário**, não com a conexão
dona: a garantia que importa é "a aplicação não consegue", e é `authenticated`
que a aplicação usa. Testar com o dono passava e escondia o defeito.

## `{{campo}}` é substituição, não linguagem

"Comissão da venda #{{number}}" vira "Comissão da venda #7". Sem isso, toda
atividade criada por automação teria o mesmo assunto.

Não avalia expressão, não tem condicional, não chama função — parar aqui é
decisão. Um mecanismo de modelo com expressões vira uma linguagem, e uma
linguagem dentro de um campo de formulário é superfície que ninguém consegue
validar nem explicar.

Campo inexistente vira **vazio**, não fica como está: deixar `{{inventado}}`
aparecer na agenda do cliente mostraria a implementação a quem não tem nada
com isso — e como um defeito, que é o que é.

## O que falta

- Mais de uma condição e mais de uma ação **na interface** (o esquema e o
  motor já aceitam)
- Condição "qualquer uma" — hoje todas precisam valer
- Gatilho por tempo ("três dias sem contato"), que exige varredura periódica
- Ações de e-mail e WhatsApp 🔒 — dependem de SMTP e da Meta, e **não devem
  ser simuladas**
