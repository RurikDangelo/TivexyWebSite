# Testes

> Como este projeto verifica o que afirma. A regra é uma só: **verificado por
> execução, não por leitura**.

## Comandos

```bash
npm run validate     # tudo: tipos, lint, build dos dois apps e todos os testes
npm run test:core    # regras puras de domínio
npm run test:web     # navegação × regras de rota
npm run test:db      # esquema, RLS, isolamento, provisionamento, contratos
```

O CI roda `validate` a cada push e pull request.

## As camadas

| Camada    | Onde                              | O que prova                                               | Custo         |
| --------- | --------------------------------- | --------------------------------------------------------- | ------------- |
| Domínio   | `packages/core/src/*.test.ts`     | Decisão de acesso, casamento de rota, leitura do contexto | milissegundos |
| Aplicação | `apps/web/src/**/*.test.ts`       | Navegação e regras de rota não divergem                   | milissegundos |
| Banco     | `supabase/tests/*.test.mjs`       | Esquema, RLS, isolamento, provisionamento, contratos      | ~2 s          |
| Navegador | manual, durante o desenvolvimento | Renderização, tema, responsividade, acessibilidade        | minutos       |

Os três primeiros rodam sem Docker, sem servidor e sem credencial nenhuma. Isso
não é detalhe de conforto: **teste caro é teste que ninguém roda**, e o teste de
isolamento entre tenants precisa rodar a cada mudança.

## Postgres de verdade, sem Docker

Os testes de banco usam **PGlite** — Postgres 18 compilado para WASM, dentro do
Node. As migrations rodam de verdade, as políticas de RLS valem de verdade, as
constraints recusam de verdade.

O harness (`supabase/tests/harness.mjs`) recria só o que o Supabase entrega
pronto: o schema `auth`, a função `auth.uid()` e os papéis `anon`,
`authenticated` e `service_role`. Todo o resto é Postgres puro.

`asUser(db, userId, fn)` executa como aquele usuário, sujeito ao RLS, dentro de
uma transação que sempre reverte — um teste que falha não contamina o seguinte.

### O que isto NÃO prova

Ser honesto sobre o limite importa tanto quanto o teste:

- `auth.uid()` real vindo de um JWT. O harness simula por configuração de
  sessão: fiel ao contrato, não ao transporte.
- Comportamento sob concorrência real.
- Qualquer coisa específica da infraestrutura do Supabase.

Assim que as migrations forem aplicadas no projeto (`tivexy-core`), o teste de
isolamento roda **também** contra ele. Até lá, `npm run test:db` é a rede — não
a garantia final.

## Os testes que não podem faltar

### Isolamento entre tenants

> Usuário do Tenant B tenta **ler, inserir, atualizar e excluir** recurso do
> Tenant A → negado nos quatro casos.

É a diferença entre um SaaS e um vazamento de dados entre clientes. Toda tabela
de negócio nova entra com esse teste no mesmo commit.

### Provisionamento ponta a ponta

Caminho feliz, idempotência, falha no meio, retomada sem repetir etapa
concluída, e os dados que a compensação precisaria para desfazer.

### Testes de esquema

Varrem o catálogo do Postgres procurando o que alguém esqueceu:

- Tabela em `public` sem RLS habilitado — ficaria totalmente aberta
- Tabela com RLS e **nenhuma** política
- Função `SECURITY DEFINER` sem `search_path` fixo — permite escalada de privilégio

Estes pegam a omissão, não o erro. É a diferença entre revisar o que foi escrito
e revisar o que foi esquecido.

### Contratos entre TypeScript e SQL

Os códigos do catálogo vivem nos dois lados. `contracts.test.mjs` compara **nos
dois sentidos**: conferir só um deixaria passar o caso mais provável — alguém
adiciona a permissão na migration e esquece do TypeScript, e a aplicação nunca
consegue verificá-la.

## O que já foi pego

Dois defeitos reais, achados por teste antes de existir aplicação:

1. **Retomada do provisionamento deixava estado inconsistente.** A constraint
   `provisioning_runs_finished_consistency` recusou uma execução que voltava
   para `running` sem limpar `finished_at`.
2. **`og.png.ts` montava caminho de dependência à mão.** Quebrou o build ao
   migrar para o monorepo, onde as dependências são içadas para a raiz.

E um diagnóstico corrigido: "90 arquivos fora do padrão de formatação" era, em
boa parte, **final de linha** — ausência de `.gitattributes` com
`core.autocrlf=true` no Windows.

## Como escrever teste aqui

**Teste a regra, não a implementação.** O nome do teste diz o que precisa ser
verdade, não que função foi chamada.

**A mensagem de falha explica o porquê.** `assert.deepEqual(x, y, 'convite
pendente não carrega permissão')` — quem vir o vermelho daqui a seis meses
precisa entender a intenção sem ler o código.

**Ordem de negação é contrato.** Quando há mais de um motivo para negar, qual
aparece é decisão de produto: um convidado de um tenant em provisionamento
precisa ouvir "aceite o convite", não "aguarde". Isso tem teste.

**Prove o negativo.** Metade dos testes daqui verifica que algo **não** acontece:
não vaza, não duplica, não escala privilégio, não abre por padrão.

**Comparação de build quando a mudança "não deveria mudar nada".** Reformatar 41
arquivos foi verificado comparando o `dist` antes e depois, arquivo a arquivo.
"Só formatação" é uma hipótese, não um fato.

## Fora de cobertura, e por quê

| O que                      | Por quê                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Testes de componente React | A casca ainda não tem lógica que justifique. Quando houver formulário e estado, entra.                       |
| E2E de navegador           | Depende de autenticação, que depende do Supabase.                                                            |
| Métricas de performance    | O README da landing registra Lighthouse e axe-core, medidos à mão. Automatizar quando houver o que regredir. |
| Carga e concorrência       | Depois de existir tráfego real para modelar.                                                                 |

Cobertura por porcentagem não é meta aqui. Um número alto com os testes errados
é pior que um número baixo com os certos.
