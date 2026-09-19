# Tivexy Core — aplicação SaaS

Aplicação autenticada do Tivexy: ERP, CRM e Admin sobre um núcleo multi-tenant.

> **Estado: casca.** Não há banco, autenticação nem dado real. O que existe é a
> estrutura, o design system e a navegação. Estado por módulo em
> [`docs/PROJECT_STATE.md`](../../docs/PROJECT_STATE.md).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript estrito · Tailwind v4 ·
Supabase (previsto) · Vercel.

## Comandos

Da raiz do monorepo:

| Comando                | O que faz                             |
| ---------------------- | ------------------------------------- |
| `npm run dev:web`      | Servidor de desenvolvimento           |
| `npm run build:web`    | Build de produção                     |
| `npm run check:web`    | Gera tipos de rota e checa TypeScript |
| `npm run lint:web`     | ESLint                                |
| `npm run validate:web` | Tipos + lint + build                  |

`check` roda `next typegen` antes do `tsc`: os tipos `LayoutProps` e `PageProps`
são **gerados** a partir das rotas, não vêm do pacote. Sem o typegen, um
`tsc --noEmit` em repositório limpo falha.

## Estrutura

```
src/
├── app/
│   ├── layout.tsx        Raiz: fontes, metadados, tema antes da primeira pintura
│   ├── page.tsx          Redireciona para /painel
│   ├── globals.css       Design system (tokens + tema claro/escuro)
│   └── (app)/            Área autenticada — casca da aplicação
│       ├── layout.tsx
│       └── painel/
├── components/
│   ├── brand/            Logo oficial
│   ├── shell/            Cabeçalho, navegação, gaveta mobile
│   └── ui/               Primitivos: botão, card, badge, campo
├── config/
│   └── navigation.ts     Estrutura de menu + estado real de cada rota
└── lib/
    └── utils.ts          `cn()`
```

Grupos de rota previstos, ainda não criados: `(auth)` para login/convite e
`(admin)` para o Super Admin.

## Design system

Os tokens estão em `src/app/globals.css` e espelham
`apps/site/src/styles/tokens.css` — os valores estão **duplicados de propósito**.
Enquanto houver um único consumidor React, copiar custa menos que a abstração
errada. Quando `packages/config` nascer, os dois passam a ler da mesma fonte.

Camada semântica (`--surface-*`, `--content-*`, `--border-*`) definida em `:root`
e redefinida em `.dark`, exposta ao Tailwind por `@theme inline`. Trocar de tema
não gera um segundo conjunto de classes.

Utilidades disponíveis: `bg-surface`, `bg-surface-muted`, `bg-surface-brand`,
`text-content`, `text-content-muted`, `text-content-accent`, `border-line`,
`text-danger`, `text-success`, `text-warning`, entre outras.

### Tema

Três estados: claro, escuro e seguir o sistema. A preferência fica no
`localStorage` e é lida com `useSyncExternalStore` — é estado externo ao React,
e esse é o jeito correto de ler com SSR sem descompasso de hidratação.

Um script inline no `<head>` aplica a classe `dark` **antes** da primeira
pintura. Sem ele a página pisca em claro antes de virar escura.

## Navegação

`src/config/navigation.ts` declara a estrutura de menu com o estado real de cada
rota: `ready`, `pending` ou `blocked`. Itens que ainda não existem aparecem
desabilitados, com o motivo no `title`.

**Isso é proposital.** A estrutura fica visível sem prometer tela que não há —
nenhum link leva a uma página vazia fingindo funcionalidade. Ao construir um
módulo, mude o `status` para `ready` no mesmo commit.

## Regras

Valem as do [`CLAUDE.md`](../../CLAUDE.md) da raiz. As que mais aparecem aqui:

- Tela existir não é entrega. Ver Definition of Done.
- Nada simulado apresentado como real. Use `<Badge tone="mock">` na UI.
- Autorização é verificada no servidor. Esconder botão não é permissão.
- Módulo não é aplicação: ERP, CRM e Admin vivem dentro desta app.
