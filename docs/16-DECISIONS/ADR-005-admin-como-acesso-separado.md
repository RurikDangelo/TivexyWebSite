# ADR-005 — O painel administrativo é um acesso separado

**Data:** 26/09/2026 · **Status:** Aceita

## Contexto

O `CLAUDE.md` deste repositório diz, desde o primeiro dia:

> ERP, CRM e Admin **não são aplicações**. São módulos dentro de `apps/web`,
> sobre o Tivexy Core.

O sistema foi construído assim. Hoje `/admin` é o décimo sexto item da **mesma
sidebar** que o cliente vê, abaixo de "Configurações", sob o título
"Administração".

Em 26/09/2026 o dono do produto contestou isso, com um contraexemplo concreto —
o painel administrativo do seu outro sistema, a NIT, que vive em
`mundonit.com.br/adminpanel`, com navegação própria em abas (Clientes, Usuários,
Domínios, Ramos, Anúncios, Configurações), botão "Sair" próprio e nenhuma
sidebar de cliente:

> O painel de admin deverá ser um acesso SEPARADO, apenas eu irei ter acesso,
> por lá, eu deveria controlar usuários, associar a empresas, CRIAR empresas e
> sistemas por lá baseado no nicho (podendo escolher módulos, cores, logo do
> cliente e etc). Não era para ficar dentro do mesmo sistema.

O argumento dele é mais forte que o texto da regra, e por um motivo que a regra
não previu: **o admin não é um módulo do tenant — é o plano de controle de todos
os tenants.** Um módulo responde "o que esta empresa pode fazer". O admin
responde "que empresas existem". Pôr os dois na mesma sidebar mistura dois
planos que nunca compartilham dado, sessão nem público.

Há também a razão de erro humano: um Super Admin que também opera uma empresa
troca de contexto o tempo todo dentro da mesma casca. Um clique errado entre
"Configurações" e "Administração" é a diferença entre mudar uma preferência e
mudar a plataforma.

## Decisão

**Separar o acesso. Não separar o deploy.**

O admin passa a ser uma superfície própria:

- route group próprio, fora de `(app)` — não herda o `AppShell` do cliente;
- casca própria: navegação em abas no topo, sem a sidebar do tenant;
- entrada própria, com sessão verificada contra `is_super_admin()`;
- some da navegação do cliente: o item "Administração" sai da sidebar;
- acessível por host próprio quando o domínio existir (`admin.tivexy.com.br`),
  e por caminho enquanto não existir.

E ganha o que o dono pediu e hoje não existe:

- associação de usuários a empresas;
- criação de empresa por nicho **com escolha de módulos**;
- marca do cliente: **logo e cores**, que exigem colunas novas no banco.

Continua **um app só** (`apps/web`) por baixo.

## Alternativas consideradas

**Manter como está, um item na sidebar do cliente.** Rejeitada: é exatamente o
que o dono contestou, e o argumento dele procede — plano de controle e plano de
tenant não são o mesmo plano.

**Criar `apps/admin`, um segundo Next.js com deploy próprio.** Rejeitada, por
ora. Daria a separação, mas ao preço de uma segunda cópia de autenticação, uma
segunda sessão Supabase para manter em sincronia, um segundo projeto na Vercel e
um segundo pipeline. O ganho sobre a solução escolhida é o isolamento de build —
que não é o problema que o dono relatou. Ele relatou um problema de **acesso e
de interface**, e acesso e interface se resolvem sem um segundo deploy.

Esta alternativa continua aberta: como o admin nasce em route group próprio, com
casca própria e sem dependência do shell do cliente, movê-lo para `apps/admin`
depois é recortar um diretório — não reescrever.

## Consequências

- O `CLAUDE.md` passa a valer com uma exceção declarada: ERP e CRM continuam
  módulos; o **Admin é uma superfície separada dentro do mesmo app**. A regra de
  fronteira que importa — não duplicar auth, tenants, usuários e permissões — é
  preservada, porque o Core continua único.
- `apps/web` ganha um segundo route group de topo. A direção de dependência não
  muda: continua `apps/* → packages/*`.
- Surge trabalho de banco que não existia: colunas de marca em `tenants`
  (logo e cor), e a escolha de módulos por tenant deixa de ser implícita no
  blueprint para virar dado consultável.
- O Super Admin passa a entrar por uma porta, não por um item de menu. Se ele
  também operar uma empresa, são dois contextos distintos — que é o objetivo.

## Relacionadas

- [[ADR-003-blueprint-como-configuracao]] — o nicho já é configuração; a escolha
  de módulos e de marca estende essa mesma ideia.
