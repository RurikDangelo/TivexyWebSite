# ADR-001 — Monorepo no repositório existente

**Data:** 18/09/2026 · **Status:** Aceita

## Contexto

O briefing declarava `C:\Users\rurik\Repositorios\TivexyWebSite\TivexyCortex` como
"o repositório oficial do ecossistema TIVEXY".

A auditoria encontrou outra coisa: `TivexyCortex/` não era um repositório. Era um
cofre Obsidian recém-criado e vazio (`TivexyCortex/Tivexy/`, com a nota "Bem-vindo.md"
padrão), não versionado, **dentro** do repositório git da landing page.

O repositório git real — com histórico, remote no GitHub e a landing em produção —
era a raiz `TivexyWebSite`.

O monorepo oficial não existia em lugar nenhum.

## Decisão

Transformar o **repositório existente** (`TivexyWebSite`) no monorepo oficial:

- Landing movida para `apps/site/` com `git mv` (histórico preservado)
- `apps/web/` reservado para o SaaS
- `packages/` para o que for realmente compartilhado
- `docs/` para a knowledge base, que passa a ser o cofre Obsidian versionado
- `TivexyCortex/` removido

## Alternativas consideradas

**Criar um repositório novo em `TivexyCortex/`.** Rejeitada: perderia o histórico
git da landing, exigiria novo remote no GitHub e novo projeto Vercel, e deixaria
`TivexyWebSite` órfão — um repositório git dentro de outro repositório git é uma
fonte permanente de confusão.

**Manter a landing na raiz e criar `apps/web/` ao lado.** Rejeitada: `src/` da
landing conviveria com `apps/` do SaaS, tornando a fronteira entre os projetos
ambígua exatamente no ponto que este monorepo existe para deixar claro.

## Consequências

**Boas:** histórico preservado; remote e deploy continuam existindo; fronteiras
explícitas desde o primeiro dia; documentação versionada junto com o código.

**Custo:** 🔒 **o projeto Vercel da landing precisa ter o Root Directory alterado
para `apps/site`.** Sem isso, o próximo deploy falha. Só o dono da conta pode fazer.

**Pendência menor:** o repositório ainda se chama `TivexyWebSite`, nome que ficou
estreito para um monorepo. Renomear no GitHub é opcional e externo.

## Notas

O nome **Tivexy Cortex** continua válido como nome do ecossistema e do produto.
Ele simplesmente não corresponde a um diretório.
