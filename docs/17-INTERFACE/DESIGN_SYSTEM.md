# DESIGN_SYSTEM — a estratégia do redesenho

**Data:** 26/09/2026 · **Origem:** derivado de [[UI_AUDIT]], 196 achados.

Este é o contrato que toda tela do `apps/web` passa a seguir. Divergir dele é defeito,
não estilo pessoal.

---

# Estratégia de redesenho — Tivexy SaaS (`apps/web`)

## 1. VEREDITO

O produto parece amador por cinco causas estruturais, não por falta de gosto.

1. **A largura não é uma decisão, é um literal copiado.** `mx-auto max-w-{2xl|3xl|4xl|5xl}` aparece 35 vezes em 34 arquivos e não existe nenhum componente dono dela. Não há onde consertar.
2. **Não existe camada tipográfica.** `@theme inline` (`globals.css:130-187`) define cor, fonte, raio, sombra e easing — e zero `--text-*`. 87% dos 405 usos de tamanho são `text-sm`/`text-xs`. Sem escala, não há hierarquia; sem hierarquia, tudo parece nota de rodapé.
3. **Só existem 6 primitivos.** Faltam table, dialog, dropdown, tabs, tooltip, skeleton, toast, combobox, stat. O vácuo foi preenchido por reimplementação: 5 cartões de KPI incompatíveis, 10 `window.confirm()`, 10 `title=` como tooltip, 11 cópias do contêiner de lista. Divergência não é descuido — é consequência mecânica da ausência.
4. **A elevação é plana.** 18 de 20 usos de sombra são `shadow-xs`; card, botão e pílula no mesmo plano. E `--surface-raised` é `#ffffff` sobre um `body` também `#ffffff`: no tema claro o cartão não existe.
5. **A casca é o inverso do alvo.** Header de largura total com o logo dentro, sidebar nascendo abaixo, `<main>` sem container. O chrome mais nobre da tela carrega um badge hardcoded e ~1500px de vazio.

---

## 2. ARQUITETURA DO SHELL

Árvore nova em `apps/web/src/components/shell/app-shell.tsx`:

```
<div class="min-h-dvh bg-surface-page lg:grid lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
  <aside>                       coluna 1, h-dvh, sticky top-0
    <TenantSwitcher/>           bloco de --header-h, logo + empresa ativa
    <SidebarNav/>               flex-1, overflow-y-auto
    <SidebarFooter/>            avisos, conta, tema, colapso
  </aside>
  <div class="flex min-w-0 flex-col">   coluna 2
    <header/>                   sticky top-0, --header-h, começa em x = --sidebar-w
    <main id="conteudo"/>       container único
  </div>
</div>
```

### Medidas (tokens novos em `globals.css`)

| Token | Valor | Onde |
|---|---|---|
| `--header-h` | `4rem` (64px) | header, `top-` da sidebar, `top-` de colunas sticky |
| `--sidebar-w` | `16rem` (256px) | coluna expandida |
| `--sidebar-w-collapsed` | `4rem` (64px) | modo ícone |
| `--sidebar-w` em `2xl` | `18rem` (288px) | ≥1536px |
| `--content-max` | `1680px` | teto do `<main>` |
| `--z-sticky / header / drawer / overlay / popover / toast` | `20 / 30 / 40 / 50 / 60 / 70` | escala de camadas |

Isso mata o número mágico `lg:top-20` de `erp/vendas/sale-form.tsx:463` e o `top-14`/`max-h-[calc(100dvh-3.5rem)]` de `app-shell.tsx:111`.

### Sidebar (`w-[--sidebar-w]`, `bg-surface-panel`, `border-r border-line-subtle`)

- **Topo (altura `--header-h`)**: `<Logo/>` reduzido a símbolo + `<TenantSwitcher/>` — avatar quadrado 32px com a inicial da empresa, nome em `--text-label`, papel do usuário em `--text-caption`, `ChevronsUpDown`. **Sempre visível, inclusive com uma empresa** (aí sem lista). Resolve `user-menu.tsx:69` (`hidden … sm:inline`) e `:86` (`empresas.length > 1`).
- **Nav**: `px-3 py-3`, `gap-4` entre grupos, itens em `px-2.5 py-1.5` (32px), `gap-0.5` interno. Item ativo ganha: barra esquerda de 3px em `--color-line-accent` (via `before:`), `bg-surface-accent-soft`, ícone em `text-content-accent`. Cabeçalhos de grupo viram `<div role="presentation">` com o token `--text-eyebrow` (corrige a ordem de headings de `sidebar-nav.tsx:86`).
- **Rodapé (`mt-auto`, `border-t`)**: Avisos (com contador), Minha conta, ThemeToggle compacto, botão de colapso `PanelLeftClose`/`PanelLeftOpen`, e o badge de estágio (fora do header).
- **Colapso**: `collapsed` em `useState` + `localStorage` (`try/catch`), escrito como `data-collapsed` no `<aside>` e como `--sidebar-w` no grid do wrapper. Colapsada: só ícones, rótulo via `<Tooltip>`, grupos viram `<hr>`.
- **Breakpoints**: `md` (768px) → sidebar colapsada por padrão (64px); `lg` (1024px) → expandida; `<md` → gaveta. Hoje o intervalo 768–1023px não tem navegação nenhuma.

### Header (coluna 2, `h-[--header-h]`, `sticky top-0 z-[--z-header]`, `bg-surface-page/80 backdrop-blur`)

Três zonas: `[esquerda flex-1 min-w-0] [centro max-w-xl] [direita shrink-0]`.

- **Esquerda**: hambúrguer (`<lg`) + `<Breadcrumb/>` — `sectionTitle(terms, href)` do módulo → registro atual. O `<h1>` continua no `PageHeader`.
- **Centro**: gatilho de busca global — `<button>` de 36px, `w-full max-w-xl`, lupa + "Buscar em tudo…" + `<kbd>Ctrl K</kbd>`. Abre `<CommandMenu/>`.
- **Direita**: ação primária contextual (ex.: "Nova venda"), `<NotificationBell/>`, `<UserMenu/>` (e-mail, /conta, Sair — a troca de empresa saiu para a sidebar).

**Regra de honestidade do Ctrl+K**: enquanto não existir busca cross-módulo no servidor, o dialog navega entre as telas de `visibleNavigation()` e exibe, abaixo, uma seção rotulada `Busca em registros — ainda não implementada` com link para a busca da tela atual. Nunca devolve resultado de dado.

### Gaveta mobile

Reescrita sobre `<dialog>` nativo + `showModal()`: foco preso, Escape, backdrop e retorno de foco de graça. Animação de entrada com `@starting-style` + `translateX(-100%)`. Resolve simultaneamente a falta de focus trap (`app-shell.tsx:55-68`) e a ausência de transição (`:116`).

---

## 3. REGRA DE LARGURA

Um componente `apps/web/src/components/page/page.tsx`:

```tsx
export type PageVariant = 'operacao' | 'quadro' | 'painel' | 'registro' | 'ajuste' | 'intersticial';
export function Page({ variant, children, className }: {
  variant: PageVariant; children: ReactNode; className?: string;
}): JSX.Element;
```

O `<main>` já dá gutter e teto — `px-4 py-6 sm:px-6 lg:px-8 2xl:px-10`, `mx-auto w-full max-w-[--content-max]`. O `Page` só aplica o **teto interno** da variante:

| Variante | Teto | Telas | Grade |
|---|---|---|---|
| `operacao` | nenhum | contatos, empresas, leads, produtos, vendas, estoque, financeiro, equipe, avisos, atividades, categorias, formas, admin/clientes, integrações | tabela densa; colunas extras entram em `xl` |
| `quadro` | nenhum + sangria `-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8` | crm/oportunidades | scroll horizontal (padrão já correto hoje) |
| `painel` | nenhum | /painel, /admin | KPIs `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`, depois `xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` |
| `registro` | `max-w-[1400px]` | 5 telas `[id]` | `xl:grid-cols-[18rem_minmax(0,1fr)_20rem]` |
| `ajuste` | `max-w-3xl` | conta, configurações, admin/clientes/novo, funis, onboarding | coluna única |
| `intersticial` | `max-w-lg` centrado vertical | acesso-negado, preparando, convite, error, not-found | — |

**Verificação (executável, entra no CI):**

```bash
grep -rn "mx-auto max-w-" apps/web/src/app/\(app\) | grep -v "components/page/page.tsx"
# deve retornar vazio
```

Medida de leitura longa (descrição de produto, motivo de cancelamento, notas) usa `max-w-prose` **no elemento**, nunca no wrapper. O `loading.tsx` de cada rota usa o mesmo `<Page variant>` da rota — é isso que elimina o salto de `loading.tsx:12` (max-w-5xl) para max-w-4xl.

---

## 4. ESCALA TIPOGRÁFICA

Em `@theme inline`, sintaxe Tailwind v4 (`--text-X--line-height`, `--text-X--font-weight`, `--text-X--letter-spacing`):

| Token | Tamanho | Peso | Altura | Tracking | Família | Onde |
|---|---|---|---|---|---|---|
| `--text-display` | 2.25rem / 36px | 700 | 1.1 | -0.025em | display | tela de login, interstícios |
| `--text-h1` | 1.5rem / 24px | 700 | 1.2 | -0.02em | display | `PageHeader` h1 (fixo, sem `sm:text-3xl`) |
| `--text-h2` | 1.125rem / 18px | 600 | 1.3 | -0.01em | sans | título de seção dentro da página |
| `--text-h3` | 1rem / 16px | 600 | 1.4 | 0 | sans | `CardTitle`, `EmptyState` h2 |
| `--text-metric` | 2rem / 32px | 700 | 1 | -0.02em | display | número de KPI (`tabular-nums`) |
| `--text-metric-sm` | 1.375rem / 22px | 700 | 1.1 | -0.02em | display | KPI compacto, total de linha |
| `--text-body` | 0.875rem / 14px | 400 | 1.5 | 0 | sans | corpo padrão, célula de tabela |
| `--text-body-lg` | 1rem / 16px | 400 | 1.6 | 0 | sans | descrição do PageHeader, prosa |
| `--text-label` | 0.875rem / 14px | 500 | 1.3 | 0 | sans | rótulo de campo, item de menu |
| `--text-caption` | 0.8125rem / 13px | 400 | 1.4 | 0 | sans | subtítulo de linha, nota de KPI |
| `--text-eyebrow` | 0.6875rem / 11px | 500 | 1.2 | 0.08em | mono | cabeçalho de grupo, versalete |
| `--text-micro` | 0.625rem / 10px | 600 | 1 | 0.02em | sans | selo do sino, rótulo de eixo |
| `--text-num` | 0.875rem / 14px | 500 | 1.4 | 0 | sans + `tabular-nums` | coluna numérica de tabela |

Sobe `text-xs` (12px) para 13px como `caption` — 12px é o tamanho que faz o produto parecer denso-por-acidente em vez de denso-por-desenho.

**Regra da base**: tirar a regra global `h1,h2,h3,h4 { Manrope; -0.02em }` de `globals.css:205-212`. Manrope vira opt-in por token (`display`, `h1`, `metric`). Isso apaga o hack de `card.tsx:26` (`font-sans tracking-normal`) e corrige `empty-state.tsx:28`, que hoje cai no defeito que o próprio Card documenta.

**Verificação**: `grep -rn "text-\(xs\|sm\|base\|lg\|xl\|2xl\|3xl\)\b" apps/web/src` → só dentro de `components/ui`.

---

## 5. ESPAÇAMENTO, RAIO E ELEVAÇÃO

### Espaçamento — passo de 4px, cinco níveis com regra

| Nível | Valor | Uso exclusivo |
|---|---|---|
| `gap-1` / 4px | 4px | ícone ↔ rótulo dentro de um selo |
| `gap-2` / 8px | 8px | elementos de um mesmo controle (botões de um grupo) |
| `gap-3` / 12px | 12px | tiles dentro de uma faixa, campos de um formulário |
| `gap-4` / 16px | 16px | **entre blocos dentro de uma seção** (substitui os 28 `gap-6` e 27 `mb-6`) |
| `gap-6` / 24px | 24px | **só entre regiões de página** (faixa de KPIs ↔ grade principal) |

Mudanças concretas: `Card` header/content `p-5` → `p-4` (e `densidade="compacta"` → `p-3`); página `py-8` → `py-6`; `PageHeader` `mb-6` → `mb-5`. Devolve ~70px de altura por tela — duas linhas de tabela.

**Densidade de linha, duas e só duas:**
- `linha-densa`: `py-2` (36px), ícone 16px — razões, históricos, movimentações, itens do recibo.
- `linha-larga`: `py-2.5` (44px), ícone 20-24px — listas navegáveis. Alvo: **15-18 registros visíveis em 1080p**, contra os 8 de hoje.

### Raio — por papel, e conserto da escala quebrada

Hoje `rounded-xl` (1.5rem) === `rounded-3xl` (1.5rem) e `rounded-2xl` (2rem) > `rounded-3xl`. Duas ações:

1. Sobrescrever `--radius-3xl: 2.5rem` e `--radius-4xl: 3rem` para restaurar a monotonicidade (segurança, não uso).
2. Tokens por papel, que é o que os componentes passam a usar:

| Token | Valor | Uso |
|---|---|---|
| `--radius-control` | 0.5rem | botão, campo, select, pílula quadrada |
| `--radius-card` | 0.75rem | Card, linha de lista, tile de KPI |
| `--radius-panel` | 1rem | dropdown, popover, dialog, gaveta |
| `--radius-pill` | 9999px | badge, chip, avatar |

Eliminar os 12 `rounded` sem sufixo (0.25rem, quinto valor fora da escala).

### Elevação — quatro papéis, e a regra de que **no escuro a elevação é superfície, não sombra**

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--shadow-flat` | `none` | `none` | dentro de card, tabela, linha de lista |
| `--shadow-card` | `0 1px 2px rgb(11 20 36/.05), 0 1px 3px rgb(11 20 36/.06)` | `none` (usa `--surface-panel` + `--line-subtle`) | Card, tile de KPI |
| `--shadow-raised` | `0 2px 4px rgb(11 20 36/.04), 0 8px 16px -4px rgb(11 20 36/.08)` | `0 0 0 1px rgb(255 255 255/.06)` | card em hover, painel destacado |
| `--shadow-overlay` | `0 4px 8px rgb(11 20 36/.04), 0 16px 32px -8px rgb(19 38 88/.14)` | `0 16px 32px -8px rgb(0 0 0/.5), 0 0 0 1px rgb(255 255 255/.08)` | dropdown, popover, tooltip, toast |
| `--shadow-modal` | `0 8px 16px rgb(11 20 36/.06), 0 32px 64px -16px rgb(19 38 88/.22)` | `0 32px 64px -16px rgb(0 0 0/.6), 0 0 0 1px rgb(255 255 255/.1)` | dialog, gaveta |

Sobrescrever também `--shadow-2xs`, `--shadow-xl`, `--shadow-2xl` com tinta azulada — hoje herdam preto puro do Tailwind, contradizendo o comentário de `globals.css:172`.

---

## 6. COR — hierarquia de superfície

O azul da marca **não muda**: `--tvx-blue-600: #1648a6` continua sendo `--surface-brand` no claro e a base da escala. O que muda é a camada semântica ganhar quatro degraus de superfície, porque hoje no claro `--surface` e `--surface-raised` são ambos `#ffffff` — o cartão não se separa da página, e é isso que lê como "plano".

### Tokens novos

```
                      CLARO                       ESCURO
--surface-page        ice-50   #f6f9fc            navy-950 #060e24
--surface-panel       white    #ffffff            navy-900 #0a1633
--surface-elevated    white    #ffffff + overlay  navy-800 #12224a
--surface-sunken      ice-100  #edf2f8            #04091a (novo)
```

- `body` passa a `background-color: var(--surface-page)`. Card/tabela/sidebar em `--surface-panel`. Dropdown/dialog/tooltip/toast em `--surface-elevated`. Cabeçalho fixo de tabela, trilho de progresso, campo de busca do header e `<pre>` em `--surface-sunken`.
- Isso corrige de um golpe o cartão de login que "não se separa do fundo" (`(auth)/layout.tsx:14`) e o tile de KPI afundado dentro de card elevado (`painel/dashboard.tsx:74` sobre `card.tsx:7`).

### Outros tokens semânticos a criar

| Token | Claro | Escuro | Motivo |
|---|---|---|---|
| `--surface-brand-hover` | blue-700 `#103b8a` | `#3670dc` | hoje o botão primário **escurece** no tema escuro (`button.tsx:10` fixa blue-700) |
| `--surface-brand-active` | blue-800 `#0c2e6e` | `#1d55bd` | não existe estado `active:` no sistema |

> **Correção de 26/09/2026, medida e não estimada.** Esta tabela trazia blue-300 e
> blue-200 para o escuro. Com `--content-on-brand` branco por cima, isso dá
> **2,19:1** e **1,56:1** — pior que o defeito que a linha diz corrigir. Os valores
> acima dão 4,66:1 e 6,80:1. No escuro o hover clareia e o pressionado escurece:
> continuar clareando destruiria o contraste, e afundar é o gesto que a mão espera
> de um botão apertado.
| `--content-on-danger` | `#ffffff` | ink-900 `#0b1424` | `bg-danger text-white` no escuro dá 2,2:1 (`button.tsx:14`, `notification-bell.tsx:31`) |
| `--content-on-success` / `--content-on-warning` | `#ffffff` | ink-900 | mesma classe de defeito |
| `--content-subtle` | **`#67748c`** (≈4,6:1 sobre branco) | `#7c8cad` (já passa) | hoje `#8e9bb0` = 2,81:1, reprova AA e carrega nota de KPI, placeholder e eixo de gráfico |
| `--surface-accent-strong` | blue-50 → blue-100 | `rgb(35 96 212/.28)` | estado ativo de item de menu com contraste real |

Proibir `bg-danger/10` e afins: opacidade sobre token de estado produz duas cores para o mesmo erro (`form-parts.tsx:19` vs `messages.tsx:13`). Só `*-soft`.

---

## 7. PRIMITIVOS A CRIAR

Ordem por desbloqueio: cada item lista o que ele **apaga**.

**P1 — `components/page/page.tsx`**
```tsx
<Page variant={PageVariant} className?>
```
Apaga 35 literais `mx-auto max-w-*` em 34 arquivos + o desalinhamento do `loading.tsx`.

**P2 — `components/ui/table.tsx`**
```tsx
<Table densidade?: 'densa'|'larga'> <THead sticky?> <TR ativo? href?> 
<TH escopo?: 'col'|'row' ordem?: {chave, atual, href} alinhamento?: 'inicio'|'fim'>
<TD numerico? truncar?> <TableEmpty icone titulo children acao?>
```
Ordenação por `<Link>` (`?ordem=`), mantendo o contrato GET. Apaga: 11 contêineres `<ul className="overflow-hidden rounded-lg border …">` copiados literalmente (`product-rows`, `sale-rows`, `entry-rows`, `levels`, `contact-rows`, `company-rows`, `leads/page`, `agenda`, `equipe/page`, `sale-form`) e resolve o recorte do anel de foco por `overflow-hidden` num lugar só.

**P3 — `components/ui/stat.tsx`**
```tsx
<Stat rotulo valor formato?: 'moeda'|'numero'|'percentual' Icone?
      variacao?: { valor: number|null; rotulo: string }   // null → "sem base para comparar", nunca 0%
      serie?: readonly number[] href? ativo? tom?: 'neutral'|'danger'|'success'|'warning'
      contar?: boolean />
<StatGrid colunas?: 3|4|5>   // grid-cols-2 md:grid-cols-3 xl:grid-cols-{n}
<Sparkline serie largura=64 altura=20 />
```
Usa `CountUp` por dentro e `alturasDasBarras()` de `lib/painel/dashboard.ts:59`. Apaga as **cinco** implementações: `Indicador` (painel/dashboard.tsx:57), `Cartao` (erp/estoque/levels.tsx:37), `Cartao` (erp/financeiro/summary.tsx:35), `SalesSummary` (erp/vendas/sale-rows.tsx:30), `Resumo` (crm/oportunidades/board.tsx:257).

**P4 — `components/ui/dialog.tsx`** (sobre `<dialog>` nativo)
```tsx
<Dialog aberto aoFechar titulo descricao? tamanho?: 'sm'|'md'|'lg'>
<AlertDialog severidade: 'danger'|'warning' confirmarRotulo confirmarAction
             exigirTexto?: string />   // digitar o nome para o irreversível
```
Apaga os **10** `window.confirm()`: `admin/clientes/[id]/forms.tsx:114` e `:216`, `automacoes/rules.tsx:173`, `configuracoes/forms.tsx:205`, `crm/oportunidades/funis/editor.tsx:66`, `equipe/team-forms.tsx:293`, `erp/financeiro/entry-rows.tsx:106`, `erp/produtos/categorias/categories.tsx:86`, `erp/produtos/[id]/status-actions.tsx:59`, `erp/vendas/[id]/cancel-form.tsx:28`. Também dá base para a gaveta mobile e para o "Desfazer" do admin (`failed-runs.tsx:103`), hoje sem confirmação nenhuma.

**P5 — `components/ui/dropdown-menu.tsx`** (popover + padrão ARIA completo: setas, Home/End, Esc devolvendo foco, clique fora que ignora o gatilho)
```tsx
<DropdownMenu gatilho={ReactNode} alinhamento?: 'inicio'|'fim'>
<DropdownItem href?|onSelect? Icone? destrutivo?>  <DropdownSeparator/>  <DropdownLabel/>
```
Apaga: o `role="menu"` sem teclado de `user-menu.tsx:74`, o `<details>` "Mover para…" que empurra layout (`board.tsx:403`) e os 100 botões inline de `entry-rows.tsx:81-119`.

**P6 — `components/ui/skeleton.tsx`** + esqueletos de forma
```tsx
<Skeleton largura? altura? raio?: 'control'|'card'|'pill'/>
<SkeletonStat/> <SkeletonRow colunas/> <SkeletonChart/> <SkeletonForm campos/>
```
Apaga o `animate-pulse` à mão e viabiliza `loading.tsx` por rota + `<Suspense>` por seção.

**P7 — `components/ui/tabs.tsx` + `components/ui/segmented.tsx`**
```tsx
<Tabs itens: {chave, rotulo, href}[] ativa />           // sublinhado, overflow-x-auto sempre
<Segmented itens como={'link'|'botao'} ativa aoTrocar?> // pílulas; é o seletor 7/30/90
```
Apaga: `StockTabs` (`erp/estoque/filters.tsx:12`), `FinanceTabs` (`erp/financeiro/summary.tsx:201`) e as três pílulas divergentes (`board.tsx:140`, `atividades/page.tsx:101`, `oportunidades/page.tsx:216`) — três alturas e duas semânticas (`aria-pressed` vs `aria-current`) para a mesma ideia.

**P8 — `components/ui/tooltip.tsx`** (hover **e** focus-visible, `role="tooltip"` + `aria-describedby`, Esc fecha)
```tsx
<Tooltip conteudo lado?: 'cima'|'baixo'|'esquerda'|'direita'>{gatilho}</Tooltip>
```
Apaga os 10 `title=` nativos, inclusive nos botões só-ícone de `levels.tsx:182`/`:190` e no item de menu bloqueado (`sidebar-nav.tsx:22`), hoje inalcançável por teclado.

**P9 — `components/ui/combobox.tsx`** (ARIA 1.2: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox, setas/Enter/Esc)
```tsx
<Combobox valor aoEscolher buscar: (t:string)=>Promise<Opcao[]>|Opcao[]
          placeholder vazioRotulo? renderOpcao? />
```
Apaga o buscador à mão de `sale-form.tsx:314-348` (que hoje **empurra o carrinho 330px para baixo** por não ser overlay) e substitui os `<select>` de 500 opções em contatos/oportunidades/atividades.

**P10 — `components/shell/command-menu.tsx`** (sobre P4 + P9) — Ctrl/Cmd+K e `/`, escopo navegação, seção de busca de registro rotulada como não implementada.

**P11 — `components/page/filter-bar.tsx`**
```tsx
<FilterBar acao? busca?: {nome, placeholder, valor} filtros?: ReactNode acoes?: ReactNode/>
```
Um layout só (busca flexível, selects de largura fixa, botão à direita, um breakpoint de empilhamento). Apaga as quatro grades divergentes de `produtos/filters.tsx:27`, `estoque/filters.tsx:49`, `sale-rows.tsx:91`, `financeiro/page.tsx:284`, e leva a lupa do `SearchBox` para o ERP.

**P12 — `components/ui/chart/`** — `useLarguraMedida()` (ResizeObserver → viewBox em pixels reais, fator 1,0 sempre), `<ChartFrame altura>` com eixos/rótulos em **HTML sobreposto**, `<ChartTooltip>` com `<rect>` de captura por coluna + `tabIndex`, crosshair, e série anterior tracejada. É o que impede que alargar a página **piore** os gráficos (`sales-chart.tsx:73` viewBox 640×200 com `h-auto w-full`; `cashflow-chart.tsx:94` 640×240, que a 1600px renderizaria texto de 27px).

**P13 — `components/ui/toast.tsx`** — região `aria-live="polite"` única no AppShell; migra as confirmações de ação de linha (baixa, desfazer, cancelar, mover, concluir) que hoje empilham `FormSuccess` permanentes dentro do `<li>`.

**P14 — `components/ui/progress.tsx`** — `valor`/`maximo`/`tom` com ARIA embutida. Apaga as duas barras à mão (`tutorial/page.tsx:153` e `FunnelBars` em `painel/dashboard.tsx:130`, esta sem semântica).

**P15 — extensões dos primitivos existentes** (mesmos arquivos, sem novos):
- `button.tsx`: size `xs` (h-7), `focus-visible:outline-*` próprio, `active:` por variante, prop `carregando` com `Loader2` + `aria-busy`, `hover:bg-surface-brand-hover`, `text-content-on-danger`, `disabled:cursor-not-allowed` no lugar de `disabled:pointer-events-none`. **Regra nova: uma ação `brand` por tela** — hoje são 7 `brand` contra 71 `ghost`/`outline`.
- `input.tsx`: `size: 'sm'|'md'|'lg'` compartilhado entre Input/Select/Textarea com **o mesmo padding horizontal** (hoje `px-3` vs `px-2.5`), `focus:border-ring`, `hover:border-line-strong`.
- `card.tsx`: `p-4`, `densidade`, `<CardAction>` no header.
- `field.tsx`: `rotuloOculto?`, `orientacao?`, `escopo?` (prefixo de id via `useId` — resolve os ids duplicados de `contatos/[id]`, `empresas/[id]`, `oportunidades/[id]`).
- `avatar.tsx`: `tamanho: xs|sm|md|lg`, `tom: accent|brand|neutral`, `src?`.
- `messages.tsx`: `<FormFeedback estado/>` único; apaga os quatro `Retorno` locais.
- `header.tsx`: prop `trilha?: {label, href}[]`; apaga as sete cópias de `<ArrowLeft/> Voltar`.
- `submit.tsx`: delega a `Button carregando`; apaga as três cópias `Enviar`.

---

## 8. MOVIMENTO

**Sem biblioteca externa.** Tudo cabe em keyframes CSS + `@starting-style` + `transition-behavior: allow-discrete` (suportados pelos navegadores-alvo de um SaaS em 2026). A única coisa que uma lib traria — orquestração de saída em lista — não é requisito de nenhuma tela. `<dialog>` + `@starting-style` cobre modal e gaveta; View Transitions cobre a troca de coluna do kanban.

### Tokens de duração e curva

```
--duration-instant: 90ms    --ease-standard: cubic-bezier(.2,0,0,1)    (já existe)
--duration-fast:   150ms    --ease-out:      cubic-bezier(.22,1,.36,1) (já existe)
--duration-base:   240ms    --ease-in:       cubic-bezier(.4,0,1,1)
--duration-slow:   360ms
--duration-data:   560ms
```

Hoje `--ease-out` tem **zero** usos fora dos próprios keyframes e `--ease-standard` tem **um**. Criar `@utility transition-base { transition-duration: var(--duration-fast); transition-timing-function: var(--ease-standard); }`.

### Catálogo

| Nome | Duração / curva | Gatilho | Onde |
|---|---|---|---|
| `tvx-enter` *(existe)* | 240ms / out | montagem de item | linha de lista, **primeiro carregamento apenas** |
| `tvx-fade` | 150ms / standard | abre/fecha | overlay da gaveta e do dialog |
| `tvx-slide-in-left` | 240ms / out, saída 150ms / in | gaveta abre | `<dialog>` mobile |
| `tvx-pop` | 120ms / out, `transform-origin` no gatilho | abre | dropdown, popover, tooltip, command menu |
| `tvx-sheet-up` | 240ms / out | abre | dialog desktop (scale .98→1 + translateY 8px) |
| `tvx-grow` *(existe)* | 520ms → **360ms** / out | primeira pintura | barras de gráfico |
| `tvx-fill` *(existe)* | 700ms → **560ms** / out | primeira pintura | progresso, barras de funil |
| `tvx-shimmer` | 1600ms linear infinito | montagem | skeleton (substitui `animate-pulse`) |
| `tvx-highlight` | 700ms / out | ação confirmada | cartão que mudou de coluna, linha que recebeu baixa |
| `tvx-toast-in` | 240ms / out, saída 150ms | toast entra | região aria-live |
| hover de elevação | 150ms / standard | ponteiro | card clicável: `hover:shadow-raised hover:-translate-y-px` |
| foco | instantâneo | `:focus-visible` | outline nunca anima |

### Regras de orquestração (resolvem a queixa literal do dono)

1. **Um evento de entrada por tela.** Ou o container escalona (`animationDelay: i*60ms`, teto 6), ou os filhos animam — nunca os dois. Hoje o painel roda três sistemas simultâneos por ~1,2s: 4 cards com `animate-enter`, 14 `CountUp` de 700ms, 14 barras `animate-grow` e as barras do funil.
2. **Cadência única de lista**: `Math.min(i, 8) * 20ms`, exposta como helper `atrasoDaLinha(i)` em `lib/utils.ts`. Hoje convivem `*20`, `*25`, `*30` e três listas sem atraso nenhum.
3. **Entrada só na primeira renderização da rota.** Paginar, filtrar ou voltar não re-executa a coreografia. Implementação: `data-primeira-vez` no container, setado por um `useRef` no client, ou omitir o `animationDelay` quando há `searchParams`.
4. **Movimento otimista não desaparece.** No kanban, o cartão movido recebe `tvx-highlight` (pulso de fundo), **não** `tvx-enter` a partir de `opacity: 0` com delay de até 240ms — hoje "solta e já está lá" vira meio segundo de sumiço (`board.tsx:327`).
5. **`CountUp` só na faixa de KPIs do topo** (5 números, não 14), e só quando o valor mudou em relação à navegação anterior.
6. **Correção do bloco `prefers-reduced-motion`** (`globals.css:277`): hoje ele congela também os cinco `animate-spin` de estado pendente, deixando um spinner parado que mente sobre progresso. Adicionar exceção: `.animate-spin { animation-duration: 1s !important; }` dentro do bloco.
7. Todo keyframe novo nasce coberto pelo bloco existente, que já zera duração **e** delay.

---

## 9. ORDEM DE EXECUÇÃO

Regra da partição: **dois agentes nunca editam o mesmo arquivo na mesma onda.** Dentro de cada grupo (`⇄`), os arquivos são disjuntos e podem ir em paralelo. Entre ondas, há dependência real.

---

### ONDA 0 — Fundação de tokens · **serial, 1 agente, bloqueia tudo**

`apps/web/src/app/globals.css` — escala tipográfica, raios por papel + conserto 3xl/4xl, elevação por papel, `--surface-page/panel/elevated/sunken`, `--surface-brand-hover/active`, `--content-on-danger/success/warning`, `--content-subtle` a 4,6:1, `--header-h`/`--sidebar-w`/`--content-max`, escala `--z-*`, durações, keyframes novos, remoção da regra `h1-h4` da base, remoção do `border-radius` do `:focus-visible`, exceção do `animate-spin`.

Sai junto (mesmo arquivo de configuração de merge): `apps/web/src/lib/utils.ts` — `extendTailwindMerge` com os grupos `text-*`, `rounded-*`, `shadow-*` novos, e o helper `atrasoDaLinha(i)`.

> Sem a Onda 0 nada compila com os nomes novos. Ela é curta e é o gargalo — faça primeiro e sozinha.

---

### ONDA 1 — Primitivos · **até 9 agentes em paralelo**

Arquivos **novos**, zero conflito entre si:

⇄ `ui/table.tsx` · `ui/dialog.tsx` · `ui/dropdown-menu.tsx` · `ui/skeleton.tsx` · `ui/tabs.tsx` + `ui/segmented.tsx` · `ui/tooltip.tsx` · `ui/progress.tsx` · `ui/toast.tsx` · `ui/section-label.tsx` · `page/page.tsx` · `page/filter-bar.tsx` · `page/breadcrumb.tsx` · `ui/chart/` (frame, tooltip, sparkline, `useLarguraMedida`)

Arquivos **existentes**, um agente por arquivo:

⇄ `ui/button.tsx` · `ui/input.tsx` · `ui/card.tsx` · `ui/avatar.tsx` · `ui/badge.tsx` · `form/field.tsx` · `form/messages.tsx` · `form/submit.tsx` · `page/header.tsx` · `page/empty-state.tsx` · `page/count-up.tsx`

Dependências internas: `ui/stat.tsx` depende de `ui/chart/sparkline` e `page/count-up` → segunda leva da mesma onda. `ui/combobox.tsx` depende de `ui/dropdown-menu` (posicionamento) → segunda leva. `shell/command-menu.tsx` depende de `dialog` + `combobox` → terceira leva.

---

### ONDA 2 — Casca · **3 agentes**

⇄ **A**: `components/shell/app-shell.tsx` + `components/shell/tenant-switcher.tsx` (novo) + `components/shell/sidebar-footer.tsx` (novo)
⇄ **B**: `components/shell/sidebar-nav.tsx` + `components/shell/notification-bell.tsx` + `components/brand/logo.tsx`
⇄ **C**: `config/navigation.ts` + `config/navigation.test.ts` + `config/routes.ts` (Avisos e Conta no menu; renomear "Equipe" → "Pessoas" com `term: 'core.users'`; decidir o destino da maquinaria `status`)

`components/shell/user-menu.tsx` é do agente A (perde o seletor de empresa para o TenantSwitcher). `components/theme-toggle.tsx` é do agente A (vai para o rodapé da sidebar).

---

### ONDA 3 — Migração de largura · **até 12 agentes, um por diretório**

Puramente mecânica: trocar o wrapper por `<Page variant>`. Zero sobreposição porque cada agente pega um diretório inteiro.

⇄ `app/(app)/crm/leads/` · ⇄ `app/(app)/crm/contatos/` · ⇄ `app/(app)/crm/empresas/` · ⇄ `app/(app)/crm/oportunidades/` (inclui `funis/`) · ⇄ `app/(app)/crm/atividades/` · ⇄ `app/(app)/erp/produtos/` (inclui `[id]/`, `categorias/`) · ⇄ `app/(app)/erp/vendas/` (inclui `nova/`, `[id]/`, `formas/`) · ⇄ `app/(app)/erp/estoque/` + `app/(app)/erp/movement-list.tsx` · ⇄ `app/(app)/erp/financeiro/` · ⇄ `app/(app)/admin/` · ⇄ `app/(app)/{equipe,integracoes,automacoes,configuracoes,conta,avisos,empresas}/` · ⇄ `app/(app)/{onboarding,preparando,convite,acesso-negado,tutorial}/`

Fora dos grupos: `app/(app)/loading.tsx` + `app/(app)/error.tsx` + `app/(app)/not-found.tsx` (novo) + `app/global-error.tsx` (novo) → **um 13º agente**.

---

### ONDA 4 — Painel e gráficos · **4 agentes**

⇄ **A**: `app/(app)/painel/page.tsx` + `lib/painel/dashboard.ts` + `lib/painel/dashboard.test.ts` — `searchParams`, período 7/30/90 reusando `periodoPedido`, janela anterior, **correção dos `.limit()`** (RPC ou `count exact` → `null` ao estourar; `saldo.has(id)` ≠ zerado), `lerAgenda` com select das 5 próximas.
⇄ **B**: `app/(app)/painel/dashboard.tsx` + `app/(app)/painel/loading.tsx` (novo) — grade bento, faixa de 5 `<Stat>`, "Próxima melhor ação", `EmptyState` no lugar dos 10 `Vazio`.
⇄ **C**: `app/(app)/painel/sales-chart.tsx` — `ChartFrame`, tooltip próprio, grade e eixo, série anterior tracejada.
⇄ **D**: `app/(app)/erp/financeiro/cashflow-chart.tsx` — mesma reescrita, SVG único (hoje são dois no DOM).

---

### ONDA 5 — Listas viram tabelas · **7 agentes**

⇄ `crm/contatos/contact-rows.tsx` · ⇄ `crm/empresas/company-rows.tsx` · ⇄ `crm/leads/*` (lista + `can()` + `moverLead` com estado + `PageHeader`/`EmptyState`/`FormError`/`NoTenant`) · ⇄ `erp/produtos/product-rows.tsx` + `filters.tsx` · ⇄ `erp/vendas/sale-rows.tsx` · ⇄ `erp/estoque/levels.tsx` + `filters.tsx` + guarda do empty state em erro · ⇄ `erp/financeiro/entry-rows.tsx` + `summary.tsx` · ⇄ `equipe/page.tsx` + `team-forms.tsx` · ⇄ `admin/page.tsx` + `admin/failed-runs.tsx`

Mais um `loading.tsx` por rota, escrito pelo mesmo agente da rota — sem conflito.

---

### ONDA 6 — Formulários, diálogos e entrada · **6 agentes**

⇄ **A**: `(auth)/layout.tsx` + `(auth)/form-parts.tsx` + `(auth)/entrar/*` + `(auth)/recuperar/*` + `(auth)/definir-senha/*` + `(auth)/error.tsx` e `loading.tsx` (novos) + `app/auth/callback/route.ts` (motivo do link inválido) + `app/page.tsx`
⇄ **B**: `erp/vendas/sale-form.tsx` → quebra em `ProductSearch`/`SaleLineItem`/`QuickCustomer`/`PaymentSplit`/`SaleTotals` + `vendas/hooks.ts`
⇄ **C**: substituição dos `window.confirm` do CRM — `oportunidades/funis/editor.tsx` + `oportunidades/board.tsx`
⇄ **D**: dos do ERP — `produtos/categorias/categories.tsx` + `produtos/[id]/status-actions.tsx` + `vendas/[id]/cancel-form.tsx`
⇄ **E**: dos da Plataforma — `configuracoes/forms.tsx` + `automacoes/rules.tsx`
⇄ **F**: do Admin — `admin/clientes/[id]/forms.tsx` + `admin/clientes/novo/new-client-form.tsx` + `admin/clientes/[id]/history.tsx` + `preparando/page.tsx` (etapas reais + `SITUACAO` no lugar do enum cru)

---

### ONDA 7 — Acabamento · **4 agentes**

⇄ Cadência de movimento nas listas que ficaram fora · ⇄ `<Suspense>` por seção no painel e nas listas grandes · ⇄ varredura de `title=` → `<Tooltip>` e de alvos de toque <24px · ⇄ `docs/PROJECT_STATE.md` + `docs/16-DECISIONS/` (ADR da escala tipográfica, do `<Page>` e da hierarquia de superfície) + card do Trello.

---

## 10. RISCOS

**R1 — Mover o container para o `<main>` quebra o `sticky` de colunas laterais.** `sale-form.tsx:463` (`lg:top-20`), `receipt.tsx:105`, `produtos/[id]/page.tsx:231` assumem o header de 56px. *Mitigação*: `--header-h` na Onda 0 e varredura `grep -rn "top-14\|top-20\|100dvh-3.5rem"` na Onda 2, antes de qualquer página migrar.

**R2 — Redefinir `--surface` (body → `--surface-page`) muda o fundo de todo componente que usa `bg-surface`** — Input, Select, Button outline, header. *Mitigação*: **adicionar** `--surface-page` e repontar só o `body` e o `<aside>`; não mexer em `--surface`. Inspeção visual das duas telas mais densas (venda nova e financeiro) nos dois temas antes de propagar.

**R3 — `tailwind-merge` não conhece os tokens novos.** `cn('text-metric', 'text-sm')` deixará as duas classes, e o override por `className` em qualquer primitivo passa a falhar em silêncio. *Mitigação*: `extendTailwindMerge` em `lib/utils.ts` na Onda 0, com um teste unitário que afirme `cn('text-metric','text-h1') === 'text-h1'`.

**R4 — A derivação de acesso do menu é o ativo mais valioso do shell.** `visibleNavigation()` (`navigation.ts:234-245`) deriva a visibilidade das mesmas `routeRules` que a página aplica, e `labelOf()`/`sectionTitle()` fazem menu e título lerem o mesmo vocabulário com `throw` no href inválido. *Mitigação*: a Onda 2 reescreve **desenho**, não decisão. `config/navigation.test.ts` roda antes e depois; nenhum agente de shell pode tocar em `decideAccess`/`matchRule`.

**R5 — Server/Client boundary.** `Table` com hover, `Card` com elevação e `Tooltip` tendem a virar `'use client'` e arrastar páginas inteiras para o cliente. *Mitigação*: hover e elevação são **CSS puro** (nenhum `'use client'`); ordenação de tabela é `<Link>` com `?ordem=`, não estado; só `Tooltip`, `Dialog`, `DropdownMenu`, `Combobox`, `Toast` e `CommandMenu` são clientes, e sempre como folha.

**R6 — Formulário: `Submit` delegando a `Button carregando` pode perder o `useFormStatus`.** É o que impede registrar a mesma venda duas vezes no balcão. *Mitigação*: `Submit` continua sendo o componente que chama `useFormStatus`; `Button` só recebe `carregando` como prop. Teste manual do duplo clique em `/erp/vendas/nova` antes de fechar a Onda 1.

**R7 — Regra inegociável do repositório.** Três pontos de risco real: (a) a busca Ctrl+K **não pode** devolver resultado de registro enquanto não houver backend — só navegação, com a seção de dados rotulada; (b) a faixa de KPIs nova não pode herdar as somas parciais de `.limit()` do painel, do funil e das páginas de empresa — `<Stat variacao={null}>` significa "sem base para comparar", nunca 0%, e soma truncada vira `null` com o aviso que o painel já sabe exibir; (c) `{slug}.tivexy.com.br` continua sendo endereço que não resolve em três telas do admin — sai de `PENDENTE — DNS` só quando o DNS existir. Qualquer agente que gere dado para preencher uma tela nova está violando o CLAUDE.md.

**R8 — Acessibilidade conquistada que a reforma pode desfazer**: `role="img"` + `<title>`/`<desc>` + tabela equivalente nos dois gráficos; `aria-live` alimentado **depois** da confirmação do servidor (board, agenda, sale-form); `CountUp` entregando o valor final no HTML do servidor; cor nunca sozinha (ícone + palavra em estoque, movimentações e cancelamentos); Sair e trocar empresa como POST com Server Action; script antiflash de tema; skip link para `#conteudo`. *Mitigação*: lista de verificação anexa a cada tarefa das Ondas 4 e 5, e `grep -rn 'role="img"\|aria-live\|<caption'` comparado antes/depois.

**R9 — Escurecer `--content-subtle` para 4,6:1 muda 150+ elementos de uma vez**, inclusive o placeholder de todo campo. *Mitigação*: é a mudança certa, mas faça-a sozinha em um commit isolado na Onda 0, para que a revisão visual saiba o que olhar.

**R10 — 34 arquivos migrando de largura em paralelo é o maior risco de merge.** *Mitigação*: a partição da Onda 3 é por **diretório**, não por arquivo; nenhum agente edita `components/`; e a verificação de aceite é o `grep` da seção 3 retornando vazio.
