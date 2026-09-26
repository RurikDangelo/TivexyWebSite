# Prompt — sessão autônoma

> O briefing de uma sessão longa e sem supervisão. Versionado porque a sessão
> precisa poder reler, e porque o que se pede a um agente autônomo é decisão de
> projeto como qualquer outra.
>
> Reescrito em 24/09/2026 para uma noite inteira sem interrupção: construir
> **todas as telas** que não dependem de credencial externa.

---

Você vai trabalhar sozinho a noite inteira no Tivexy. Ninguém vai responder
pergunta. Leia `CLAUDE.md` e `docs/PROJECT_STATE.md` antes da primeira linha —
eles valem mais que este documento em qualquer discordância.

## Regra de operação: não pare

O escopo abaixo está **aprovado**. Não peça confirmação para nada dele.

- **Não faça perguntas.** Diante de uma escolha de produto, decida pela opção
  mais simples que atende, escreva a decisão num comentário ou num ADR em
  `docs/16-DECISIONS/`, e siga.
- **Não pare para revisão.** Não existe revisor acordado.
- **Bloqueou? Pule.** Se um item depender de algo que não existe, registre em
  `PROJECT_STATE.md` e vá para o próximo. Não fique tentando contornar.
- **Não peça mais escopo.** Quando terminar a lista, melhore o que já está lá:
  vazios, erros, acessibilidade, responsividade, testes.
- **Commit e push a cada tela pronta.** Não acumule. O que estiver commitado
  sobrevive ao fim do crédito; o resto evapora.

O que **continua valendo** e não é negociável: não construir funcionalidade
falsa, não inventar credencial, não mexer em `main`, não usar `--force`, não
apagar dado.

## O alvo: todas as telas

Uma tela só conta como pronta quando tem **as onze**: UI, backend, banco,
autorização, validação, erro, carregando, estado vazio, responsividade a 375px,
teste e documentação. É a Definition of Done do `CLAUDE.md`.

Meia tela vale menos que uma tela a menos. Se o crédito acabar, é melhor ter
seis prontas do que doze pela metade.

### Já prontas — não refazer

`/entrar` · `/recuperar` · `/definir-senha` · `/painel` · `/acesso-negado` ·
`/onboarding` · `/preparando` · `/empresas` · `/admin` ·
`/admin/clientes/novo` · `/crm/leads`

### A construir, nesta ordem

| #   | Rota                 | O que é                                                                                                                                                                                     |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/convite`           | Existe e não tem botão de aceitar. Precisa de função `SECURITY DEFINER` que confira o convite — o RLS nega essa escrita a quem ainda não é membro, que é exatamente quem está nessa página. |
| 2   | `/crm/oportunidades` | O funil em kanban. Colunas por etapa, arrastar entre elas, total por coluna. A situação vem da etapa; a oportunidade não tem status próprio.                                                |
| 3   | `/crm/contatos`      | Pessoas. Lista, busca, criar, editar, ver uma.                                                                                                                                              |
| 4   | `/crm/empresas`      | Contas. O mesmo, mais as pessoas e oportunidades ligadas.                                                                                                                                   |
| 5   | `/crm/atividades`    | Agenda: o que vence, o que atrasou, marcar como feita.                                                                                                                                      |
| 6   | `/configuracoes`     | **`TENANT_SETTINGS` e `resolveSettings()` já existem em `packages/core` e nenhuma tela os usa.** Moeda, fuso, baixa de estoque na venda, venda exige cliente.                               |
| 7   | `/equipe`            | Membros do tenant, papéis, convidar, remover. Convite não sai por e-mail (SMTP 🔒) — gere o link de acesso, como o Admin já faz.                                                            |
| 8   | `/conta`             | O próprio perfil: nome, e-mail, trocar senha, sair.                                                                                                                                         |
| 9   | `/erp/produtos`      | Produtos e categorias. Esquema novo.                                                                                                                                                        |
| 10  | `/erp/estoque`       | Saldo, movimentação, ajuste.                                                                                                                                                                |
| 11  | `/erp/vendas`        | Venda, itens, formas de pagamento.                                                                                                                                                          |
| 12  | `/erp/financeiro`    | A receber, a pagar, fluxo de caixa.                                                                                                                                                         |
| 13  | `/automacoes`        | Motor interno: gatilho → condição → ação. Nada que dependa de canal externo.                                                                                                                |
| 14  | `/integracoes`       | Lista honesta do que existe e do estado de cada uma. Todas em "não configurado", com o que falta. **Não simule conexão.**                                                                   |
| 15  | `/tutorial`          | Guia interativo ponta a ponta: criar cliente pelo Admin com Blueprint → primeiro acesso → CRM → ERP. Diz o que ainda é externo.                                                             |
| 16  | Admin                | Editar cliente, suspender e reativar, trocar plano, histórico de provisionamentos.                                                                                                          |

Ao criar as tabelas do ERP, **inclua `erp.product_categories` e
`erp.payment_methods` em `TABELA_DA_SEMENTE`**
(`apps/web/src/server/provisioning/execute.ts`). Hoje essas sementes do
Blueprint ficam pendentes; quando a tabela existir elas passam a aplicar, e o
teste que afirma que continuam pendentes vai falhar. Reescrevê-lo é a resposta
certa.

### O painel do tenant vira painel de verdade

Com CRM e ERP existindo, `/painel` deixa de ser "o estado da plataforma" e
passa a mostrar o negócio do cliente: oportunidades por etapa, valor no funil,
vendas do mês, contas a receber.

**Todo número sai de consulta ao banco do tenant.** Nada inventado, nada de
`Math.random()`, nada de série fixa "para dar exemplo". Sem dado, estado vazio
que diz o que fazer para haver dado.

## A régua visual

Qualidade visual é requisito. O dono pediu o melhor e mais completo ERP/CRM/
Admin que couber.

- **Estenda o design system que existe** — `apps/web/src/app/globals.css`,
  tokens semânticos, claro e escuro, Manrope/Inter/Geist Mono. Não invente um
  segundo, não instale biblioteca de componentes.
- **Gráficos**: SVG próprio ou biblioteca leve. Legíveis nos **dois temas**.
  Cor não pode ser a única portadora de informação — use rótulo, padrão ou
  forma junto.
- **Animação** com propósito: entrada de lista, transição de estado, número
  que sobe. Respeita `prefers-reduced-motion`; a regra global já zera duração.
- **375px sem scroll horizontal**, em toda tela.
- Foco visível, `aria-label` no que é só ícone, `role="alert"` em erro.

## O defeito aberto, conserte primeiro

`docs/PROJECT_STATE.md` seção 3: **o menu lateral diz "Leads" enquanto a página
diz "Interessados"**. O vocabulário do Blueprint chega na tela e não chega na
navegação, que é a superfície mais visível do sistema.

`navigation.ts` é estático e precisa resolver os termos do tenant, como
`lib/crm/terms.ts` já faz na página. Isso vale para **todas** as telas novas:
nenhuma deve escrever o rótulo à mão.

## O que é proibido

`CLAUDE.md`, seção "não fingir funcionalidade". Não construa, nem rotulado:

- emissão fiscal, boleto, pagamento, certificado digital
- integração Meta/WhatsApp, webhook apresentado como real
- envio de e-mail que não sai
- número de negócio inventado, em tela ou gráfico

Fora de escopo por dependerem de credencial: SMTP, OpenAI, Meta, provedor
fiscal, deploy na Vercel, CI. Não tente contornar nenhum.

## A restrição desta sessão

**Você não tem `.env`.** Ele é gitignored e precisa ser.

Você **pode** rodar `npm run validate` inteiro — tipos, lint, build dos dois
apps e a suíte (519 testes hoje). O PGlite não precisa de credencial.

Você **não pode** aplicar migration no projeto real, entrar no sistema, nem
abrir tela contra o Postgres de verdade.

Por isso: **tudo que você entregar entra em `PROJECT_STATE.md` como 🟡, com a
frase "testado, não verificado contra o banco real". Nunca ✅.** Ver §6.2. Os
dois defeitos mais sérios de 20/09 não foram pegos por teste nenhum —
apareceram contra o banco de verdade, e o dono vai fazer uma passada antes do
deploy.

O banco de produção tem as migrations até `20260920040000`. O que você criar
fica pendente até ele rodar `npm run db:push`.

## Como trabalhar

**A ordem:** esquema → testes de banco → contratos em `packages/core` (com
teste comparando contra o SQL) → tela → documentação.

**Garantia crítica se confere quebrando o código de propósito** para ver o
teste falhar. Teste que passa com o código quebrado não testa nada.

**`PROJECT_STATE.md` e o documento do módulo em `docs/` entram no mesmo commit
da entrega.** O Trello está desconectado (§6.1) — registre ali o que iria para
ele.

Commit em português, explicando **por que** e não o quê, terminando com:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Quando um teste existente falhar por causa da sua mudança, decida qual dos dois
está errado — o código ou o teste — e **diga qual** no commit. Os dois casos já
aconteceram aqui.

## Armadilhas já pagas

Cada uma destas custou tempo. Não repita nenhuma:

- **jsonb**: parâmetro JSON vai como `$n::text::jsonb`. Sem o `::text` os
  drivers divergem — o PGlite analisa, o de produção serializa de novo — e
  nenhum teste pega.
- **Chave composta**: tabela nova de tenant leva `unique (tenant_id, id)`, e
  toda referência carrega o `tenant_id`. Use `on delete set null (coluna)`:
  sem nomear a coluna, ele tenta anular `tenant_id`, que é `not null`.
- **`'use server'`** só exporta função assíncrona. Estado inicial e constantes
  em arquivo separado. Não quebra no build — quebra ao enviar o formulário.
- **RLS é piso, não filtro.** Toda consulta filtra `tenant_id` explicitamente:
  quem participa de duas empresas tem permissão nas duas.
- **`asUser()`** do harness faz rollback; escrita que precisa persistir usa
  `asUserCommitting()`.
- **Blueprint**: funil precisa de etapa `won` e `lost`; etapa cita o funil pelo
  nome e vem depois dele na lista.
- **Transação**: o cliente PostgREST não tem. Operação com várias escritas que
  só fazem sentido juntas vira função no banco, `SECURITY INVOKER` — ver
  `crm_convert_lead()`.
- **Cache do Next** corrompe e o build acusa erro de fonte do Google. `rm -rf
apps/web/.next` resolve.
- **Shell**: crase e `$(` dentro de string passada ao bash somem. Escreva
  script em arquivo.

## Ao terminar

`npm run validate` verde, tudo commitado e pushado. Escreva um resumo com:

1. cada tela entregue, e as onze exigências que ela cumpre
2. o que não coube, e por quê
3. **o que você suspeita que só vai aparecer contra o banco real** — esta é a
   parte mais útil para quem acordar
