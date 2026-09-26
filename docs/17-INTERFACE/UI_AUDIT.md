# UI_AUDIT — auditoria visual do SaaS

**Data:** 26/09/2026 · **Escopo:** `apps/web` · **Método:** dez auditores somente-leitura,
um por área do produto e por eixo transversal, contra o código real.

Total: **196 achados** em 10 frentes.

Este documento registra o estado **antes** do redesenho. A estratégia derivada dele está
em [[DESIGN_SYSTEM]]; o que foi efetivamente mudado está em [[REDESIGN_CHANGELOG]].

## Sumário por gravidade
| Gravidade | Achados |
| --- | --- |
| alto | 64 |
| médio | 90 |
| baixo | 42 |

---

## Shell e navegação (apps/web)

O shell está estruturalmente invertido em relação ao alvo: o header atravessa a largura inteira da viewport e leva o logo, enquanto a sidebar nasce abaixo dele — exatamente o oposto do mockup (logo dentro da coluna, header começando depois dela). Não existe busca global nem qualquer atalho de teclado em todo o `apps/web/src`, então o header de 56px fica com ~1500px vazios num monitor de 1920px, ocupado só por um badge "Em construção" hardcoded. O `<main>` não tem container nenhum, o que empurra o `mx-auto max-w-*` para 34 páginas individuais e torna o defeito de largura impossível de consertar num lugar só — e faz o `loading.tsx` (max-w-5xl) saltar para max-w-4xl em quase toda navegação. A lógica de acesso do menu (derivar visibilidade de `routeRules`) é boa e tem teste; o problema é composição, densidade e cobertura — 16 itens de menu para 34 telas, com `/empresas` órfã e nenhum breadcrumb.

### O que já está bom e deve ser preservado

- `visibleNavigation()` (config/navigation.ts:234-245) deriva o menu das mesmas `routeRules` que a página usa, via `decideAccess`/`matchRule` — o menu não pode oferecer o que a página negaria, e o grupo de administração some (não fica acinzentado) para quem não é Super Admin. Tem teste em config/navigation.test.ts. Isso é raro e deve ser preservado intacto em qualquer refatoração do shell.
- `labelOf()`/`sectionTitle()` (config/navigation.ts:187-201) fazem o menu e o título da página lerem o mesmo vocabulário do tenant, com `throw` se o href não existir no menu — menu e página não têm como discordar. O tipo `NavHref` derivado do `as const` impede título de página com caminho inválido em tempo de compilação.
- O estado ativo já cobre sub-rotas corretamente (sidebar-nav.tsx:45, `pathname === href || pathname.startsWith(href + '/')`), então `/crm/contatos/[id]`, `/erp/vendas/nova` e `/erp/produtos/categorias` já acendem o item-pai certo. A base para o breadcrumb já está aí.
- Skip link para o conteúdo (app-shell.tsx:72-77) com `sr-only focus:not-sr-only`, apontando para o `id="conteudo"` que existe de verdade no `<main>`.
- O script antiflash de tema inline no `<head>` (app/layout.tsx:56-60) somado a `useSyncExternalStore` no toggle (theme-toggle.tsx:55) resolve tema escuro sem piscar e sem descompasso de hidratação — e o `readTheme` tem try/catch para modo privado.
- Sair é POST com Server Action e não link (user-menu.tsx:126-135), com o motivo documentado no comentário do arquivo. O mesmo vale para a troca de empresa, que é `<form action={trocarEmpresa}>`.
- A gaveta fecha ao trocar de rota ajustando estado durante a renderização (app-shell.tsx:48-52) em vez de um effect em cascata — inclusive no voltar/avançar do navegador. E o effect de abertura (55-68) tranca o scroll do body e devolve o valor anterior na limpeza.
- `prefers-reduced-motion` está tratado globalmente (globals.css:277-288), zerando duração E delay — o comentário explica por que o delay importa. Qualquer animação nova do shell já nasce coberta.
- O logo via `mask-image` com `bg-current` (brand/logo.tsx:15-24) troca de cor com o tema sem segundo arquivo e mantém os 12 KB de path fora do HTML. Boa decisão, documentada no próprio arquivo.
- `robots: { index: false, follow: false }` no metadata raiz (app/layout.tsx:34) e `admin/layout.tsx` guardando a subárvore inteira com `requireAccess('/admin')` de caminho literal — uma página nova em `admin/` nasce protegida.
- O `notification-bell.tsx` constrói um `aria-label` por extenso com plural correto e `toLocaleString('pt-BR')` (linhas 14-19), e trata `naoLidos: null` como sino sem número em vez de derrubar a página. O tratamento de erro em `app/(app)/layout.tsx:12-21` é coerente com isso.

### Achados

#### Gravidade alto

**`apps/web/src/components/shell/app-shell.tsx:79`**

A estrutura do shell é o inverso do alvo. O `<header>` (linha 79) é irmão anterior do `<div className="flex flex-1">` (linha 108) que contém `<aside>` + `<main>`. Resultado: o header atravessa 100% da viewport, passa POR CIMA da coluna da sidebar, e o logo mora no header (linha 92) em vez de morar dentro da coluna. O mockup do próprio Tivexy define o contrário: logo DENTRO da sidebar, header começando depois dela. Como consequência secundária, o header (bg-surface) e a sidebar (bg-surface-subtle, linha 110) têm tons diferentes, e o corte horizontal do header sobre a coluna fica visualmente errado.

> **Correção:** Trocar a árvore por um grid de duas colunas no nível raiz: `<div className="lg:grid lg:grid-cols-[16rem_1fr] min-h-dvh">`, com `<aside>` na primeira coluna contendo o `<Logo/>` no topo (bloco de altura igual à do header) e a `<SidebarNav/>` abaixo, e um `<div className="flex flex-col">` na segunda coluna com `<header>` + `<main>`. O header passa a começar em x=256px.

**`apps/web/src/components/shell/app-shell.tsx:98`**

Não existe busca global nem atalho Ctrl+K em lugar nenhum do app — a varredura por `ctrl+k`, `cmd+k`, `metaKey`, `command palette` e `busca global` em todo `apps/web/src` retorna zero ocorrências. O único campo de busca do produto é `components/page/search-box.tsx`, um `<form method="get">` que filtra a lista da página atual (usado em leads, contatos, empresas, produtos...). No header, entre o badge da linha 94 e o `ml-auto` da linha 98 não há nada: em 1920px isso é ~1500px de header vazio, e a ausência de busca global é o item mais visível do alvo que não existe.

> **Correção:** Inserir um gatilho de busca global no header, ocupando a faixa central (`flex-1 max-w-xl`): botão com ícone de lupa, placeholder "Buscar em tudo…" e um `<kbd>Ctrl K</kbd>` à direita. Abrir um dialog com listener de `keydown` para `(e.metaKey||e.ctrlKey) && e.key==='k'`. Importante: enquanto o backend de busca cross-módulo não existir, o dialog deve navegar para as telas do menu (navegação por comando) e rotular explicitamente qualquer outra seção como não implementada — não pode devolver resultado de dado inventado.

**`apps/web/src/components/shell/app-shell.tsx:153`**

`<main id="conteudo" className="min-w-0 flex-1">` não tem padding nem container. A responsabilidade de limitar e centrar a largura foi empurrada para cada página: as 34 telas de `app/(app)` repetem `mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8` (22 vezes), `max-w-3xl` (7) e `max-w-5xl` (3). É a causa estrutural do defeito nº 1 — não existe um lugar onde consertar a largura, e cada nova tela recopia o erro. Além disso, o `mx-auto` centra dentro dos 1664px que sobram depois da sidebar, então o bloco de 896px fica com ~384px de vazio de cada lado.

> **Correção:** Mover o container para o `<main>`: `<main id="conteudo" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">`, sem `max-w` fixo (ou com `max-w-[1600px] mx-auto` como teto), e remover os 34 wrappers das páginas. Telas de formulário estreito (conta, configurações, onboarding) mantêm o próprio `max-w-*` internamente, não no wrapper de página.

**`apps/web/src/components/shell/user-menu.tsx:86`**

Num SaaS multi-tenant não existe seletor de empresa no chrome. A troca só aparece dentro do dropdown do menu de conta e SÓ quando `empresas.length > 1` (linha 86). Pior: o nome da empresa ativa na barra usa `hidden max-w-40 truncate sm:inline` (linha 69), ou seja, em mobile desaparece por completo — sobra só a inicial do e-mail. O comentário do próprio arquivo (linhas 16-19) diz que "errar a empresa é tão fácil quanto errar a conta, e as duas terminam em alguém lançando dado no lugar errado" — a UI contradiz o comentário, escondendo o contexto a dois cliques.

> **Correção:** Promover o seletor de empresa a elemento de primeira ordem no topo da sidebar (padrão dos dois sistemas de referência): bloco com avatar/inicial da empresa, nome em peso forte, papel do usuário abaixo em texto menor, e `ChevronsUpDown`. Sempre visível, inclusive com uma única empresa (aí sem lista, só o contexto). O menu de conta fica com e-mail, /conta, tema e Sair.

**`apps/web/src/app/(app)/loading.tsx:12`**

O esqueleto de carregamento usa `mx-auto max-w-5xl` (1024px), mas 22 das 34 telas usam `max-w-4xl` (896px) — por exemplo `app/(app)/crm/leads/page.tsx:103` e `app/(app)/erp/produtos/page.tsx:145` — e 7 usam `max-w-3xl` (768px), como `app/(app)/configuracoes/page.tsx:129`. Toda navegação pelo menu mostra um esqueleto 128 a 256px mais largo que a página que chega, e o conteúdo encolhe e se recentra quando os dados aparecem. Salto de layout visível em praticamente todo clique do menu. A forma do esqueleto (título + 3 cartões) também não corresponde a nenhuma tela real de lista.

> **Correção:** Consequência direta do achado do `<main>`: com o container no shell, o `loading.tsx` herda a mesma largura e o salto some. Enquanto isso, no mínimo alinhar para a mesma classe da maioria e trocar o corpo por um esqueleto de lista (linha de filtros + N linhas de tabela), que é a forma real da maioria das telas.

**`apps/web/src/config/navigation.ts:64`**

Cobertura: o menu declara 16 itens (`/painel`, `/tutorial`, 5 de CRM, 4 de ERP, 4 de Plataforma, `/admin`) contra 34 `page.tsx` em `app/(app)`. Os órfãos verificados um a um: (a) `/avisos` só pelo sino (`notification-bell.tsx:22`) e o sino só existe quando há empresa resolvida (`app/(app)/layout.tsx:38-41`) — sem empresa ativa a tela fica inalcançável; (b) `/conta` só pelo dropdown (`user-menu.tsx:117`); (c) `/empresas` é totalmente inalcançável por navegação — nenhum `<Link>` no app aponta para ela, só se chega por `redirect('/empresas')` em `app/(app)/actions.ts:26` e por `TENANT_PICKER` em `lib/auth/require.ts:30`; (d) sub-telas de configuração de módulo (`/crm/oportunidades/funis`, `/erp/produtos/categorias`, `/erp/vendas/formas`) existem só como botão dentro da lista-pai, sem representação no menu; (e) `/erp/vendas/nova`, que é a ação mais frequente de um ERP, não tem entrada nenhuma no chrome.

> **Correção:** Três movimentos: (1) adicionar um bloco de rodapé/utilitário na sidebar com `/avisos` e `/conta` para que não dependam só do chrome; (2) tratar `/crm/oportunidades/funis`, `/erp/produtos/categorias` e `/erp/vendas/formas` como sub-itens do menu (nível 2 recolhido sob o pai ativo) ou como abas dentro da tela-pai, em vez de botão solto; (3) promover "Nova venda" a ação primária do chrome (botão no header ou na sidebar), que é o padrão dos dois sistemas de referência com seus cartões de ação rápida no topo.

#### Gravidade média

**`apps/web/src/components/shell/app-shell.tsx:110`**

A sidebar não colapsa. `hidden w-64 shrink-0 border-r border-line-subtle bg-surface-subtle lg:block` — largura fixa de 256px, sem estado, sem botão, sem modo ícone, sem persistência. Em 1280px ela consome 20% da largura útil e não há como recuperá-la. O breakpoint também é `lg` (1024px), então entre 768 e 1023px — iPad em retrato, janela dividida em desktop — não há sidebar nenhuma, só o hambúrguer.

> **Correção:** Adicionar estado `collapsed` no `AppShell` persistido em `localStorage`, com botão no rodapé da sidebar (`PanelLeftClose`/`PanelLeftOpen`). Colapsada, a coluna vai para `w-16` com só os ícones e `title`/tooltip no hover; os cabeçalhos de grupo viram um separador. Considerar também um estado intermediário no breakpoint `md`.

**`apps/web/src/components/shell/app-shell.tsx:116`**

A gaveta mobile tem dois defeitos. Animação: o bloco é montado por `{open && (...)}` sem transição nenhuma — a gaveta e o overlay piscam na tela e somem instantaneamente. Há três keyframes em `globals.css` (`tvx-enter`, `tvx-grow`, `tvx-fill`, linhas 234-273) e nenhum deles é usado aqui. Acessibilidade: as linhas 127-128 declaram `role="dialog" aria-modal="true"`, mas nada torna inerte o conteúdo atrás — o `useEffect` das linhas 55-68 tranca o scroll do body e foca o botão de fechar (linha 59), porém não prende o foco; pressionar Tab até o fim da gaveta leva o foco para dentro do `<main>` escondido atrás do overlay.

> **Correção:** Manter a gaveta montada e animar com `transform: translateX(-100%)` → `0` e o overlay com opacidade, usando `--ease-out`, ou adicionar um keyframe `tvx-slide-in` em `globals.css` ao lado dos três existentes (a regra global de `prefers-reduced-motion` nas linhas 277-288 já cobre). Para o foco, aplicar `inert` no `<main>` enquanto `open`, ou ciclar o foco entre o primeiro e o último elemento focável da gaveta no `keydown` de Tab.

**`apps/web/src/components/shell/app-shell.tsx:94`**

O badge `<Badge tone="warning">Em construção</Badge>` está hardcoded no header, sem flag, sem variável de ambiente e sem condição alguma. Ele aparece para todo tenant, em toda tela, em produção, para sempre — e ocupa justamente a faixa esquerda do header onde o alvo quer a busca global. O rótulo é honesto pela regra do CLAUDE.md, mas como chrome permanente e não desligável ele é um custo visual fixo no elemento mais nobre da interface.

> **Correção:** Condicionar a `process.env.NEXT_PUBLIC_TIVEXY_STAGE !== 'production'` (ou equivalente) e mover para um lugar que não dispute espaço com a busca — rodapé da sidebar ou ao lado do seletor de empresa. Se a intenção é sinalizar imaturidade por módulo, isso pertence ao item do menu (ver o achado da maquinaria de `status`), não ao chrome global.

**`apps/web/src/config/navigation.ts:30`**

A maquinaria de status honesto do menu é código morto. `NavStatus` (linha 30), o campo `status` (linha 43), `blockedBy` (linhas 52-53), o mapa `statusLabel` (linhas 174-178) e todo o ramo de renderização em `sidebar-nav.tsx:18-43` (item desabilitado, cadeado, tooltip "Ainda não construído. Ver docs/PROJECT_STATE.md") nunca executam: os 16 itens de `navigation` são `status: 'ready'`, verificado item a item. São ~40 linhas de shell que nunca renderizam — e é justamente o mecanismo que a regra inegociável do repositório pede. Está construído e desligado.

> **Correção:** Duas saídas legítimas. Se `docs/PROJECT_STATE.md` diz que todas as 16 seções estão completas de ponta a ponta (UI → backend → banco → autorização → validação → erro → loading → empty state → responsividade → teste → doc), remover a maquinaria inteira, que aí é peso morto. Caso contrário, marcar honestamente os itens parciais como `pending` e reativar o ramo — o mecanismo já existe e tem o desenho certo.

**`apps/web/src/config/navigation.ts:239`**

Super Admin sem empresa ativa recebe um shell vazio. A linha 239 (`if (daOperacao && viewer.tenant === null) return []`) remove todos os itens de regra `member` e `permission`; com `tenant === null` isso apaga `/painel`, `/tutorial`, os 5 do CRM, os 4 do ERP e os 4 da Plataforma. Sobra o grupo "Administração" com um único link, "Super Admin". A coluna de 256px fica ocupada por 1 item de 36px de altura, e o conteúdo (`app/(app)/admin/page.tsx:94`, `max-w-5xl`) fica centrado num main de 1664px. É a tela mais vazia do sistema inteiro e é a que o dono do produto usa mais.

> **Correção:** Dar à área de plataforma a própria navegação: um grupo de admin com Clientes, (futuras) Métricas e Configurações da plataforma, além de um retorno explícito para escolher empresa (`/empresas`, hoje órfã). E aproveitar o `admin/layout.tsx` — que hoje só chama `requireAccess('/admin')` — para marcar o contexto visualmente (faixa/cor distinta), já que é uma área acima do tenant.

**`apps/web/src/components/shell/app-shell.tsx:79`**

Header raso demais e sem hierarquia. `h-14` (56px) com logo de `h-6` de símbolo e `h-3` de wordmark (`brand/logo.tsx:60-61`). Dentro cabem exatamente: hambúrguer (só mobile), logo, badge, sino, um radiogroup de tema com 3 botões e o menu de conta. Não há título da seção, não há caminho, não há seletor de período, não há ação primária — nada que dê à faixa superior uma função além de identidade. Os dois sistemas de referência (NIT e Ribeiro Vale) têm header mais alto, com busca, seletor 7/30/90 dias e ações.

> **Correção:** Subir para `h-16`, e com a reestruturação em grid o header passa a pertencer à coluna de conteúdo: à esquerda o título da seção (vindo de `sectionTitle()`, que já existe em `config/navigation.ts:196`) mais o caminho quando há sub-nível, no centro a busca global, à direita sino, ações e conta. O `<Logo/>` sai daqui e vai para a sidebar.

**`apps/web/src/components/page/header.tsx:19`**

Não existe breadcrumb em parte alguma — a varredura por `breadcrumb`/`migalha` em `app/(app)` e `components` retorna zero. O `PageHeader` só aceita `titulo`, `descricao` e `acoes`. Em compensação, sete telas de 2º e 3º nível reimplementam à mão o mesmo link de volta com `<ArrowLeft/>`: `crm/contatos/[id]/page.tsx:169`, `crm/empresas/[id]/page.tsx:173`, `crm/oportunidades/[id]/page.tsx:134`, `crm/oportunidades/funis/page.tsx:92`, `erp/produtos/[id]/page.tsx:212`, `erp/produtos/categorias/page.tsx:59`, `admin/clientes/[id]/page.tsx:201`. Sete cópias, sem componente e sem consistência de estilo.

> **Correção:** Adicionar uma prop `trilha?: { label: string; href: string }[]` ao `PageHeader` e renderizar um `<nav aria-label="Trilha">` acima do `<h1>`, alimentado por `sectionTitle()` para o nível do módulo. Substituir as sete implementações artesanais por ela.

**`apps/web/src/components/shell/sidebar-nav.tsx:82`**

Densidade e hierarquia da sidebar não correspondem ao alvo. `gap-5` entre grupos e `gap-0.5` entre itens, `px-3 py-4` no nav, e cada item em `px-2.5 py-2 text-sm` (linhas 11-12). Com 16 itens e 4 cabeçalhos isso ocupa pouco mais de 600px numa coluna de altura de tela inteira — o resto é vazio, e não há rodapé (nem versão, nem ajuda, nem colapso, nem atalho para conta/avisos). O item ativo se distingue só por `bg-surface-accent-soft` mais `font-medium` (linhas 54-55), sem barra/indicador lateral, e o ícone não muda de peso nem de cor de acento.

> **Correção:** Fechar o vertical: `gap-4` entre grupos e itens em `py-1.5`. Adicionar indicador de estado ativo mais forte (barra de 2-3px na borda esquerda em `--color-border-accent` mais o ícone em `text-content-accent`). Usar o espaço que sobra no rodapé para o bloco de utilitários (avisos, conta, tema, colapso) e, quando houver, um cartão de estado do tenant.

#### Gravidade baixo

**`apps/web/src/components/shell/sidebar-nav.tsx:86`**

Os cabeçalhos de grupo ("CRM", "ERP", "Plataforma", "Administração") são `<h2>`, e o `<aside>` vem antes do `<main>` no DOM (`app-shell.tsx:110` e `:153`). Logo, quatro `<h2>` aparecem antes do `<h1>` da página (`components/page/header.tsx:22`). A ordem de cabeçalhos fica quebrada para leitor de tela: o documento começa em nível 2 e só depois chega ao nível 1.

> **Correção:** Trocar os `<h2>` por `<div role="presentation">` ou `<p>` com o mesmo estilo — o `<nav aria-label="Navegação principal">` da linha 82 já dá o rótulo da região, e os grupos não precisam ser cabeçalhos de documento.

**`apps/web/src/components/shell/user-menu.tsx:77`**

O dropdown do menu de conta usa `z-40`, mas está dentro do `<header>` que é `sticky ... z-30` (`app-shell.tsx:79`). Position + z-index cria contexto de empilhamento, então o `z-40` do dropdown só vale dentro do header — na prática ele empilha em 30 contra o resto da página. Hoje nada compete (a varredura por z-index em `app/(app)` não encontra nenhum outro uso), mas o primeiro modal, drawer ou popover que a base de componentes ganhar vai passar por cima do menu de conta. O mesmo vale para o `z-40` da gaveta (`app-shell.tsx:117`), que por estar fora do header funciona — e cobre o header inteiro quando aberta.

> **Correção:** Definir uma escala de camadas em tokens (`--z-header: 30`, `--z-overlay: 40`, `--z-popover: 50`) e renderizar dropdowns/tooltips fora do contexto do header, via portal. Como não há `dropdown`, `dialog`, `popover` nem `tooltip` em `components/ui`, resolver isso junto com a criação desses primitivos.

**`apps/web/src/components/shell/app-shell.tsx:111`**

A altura do header (3.5rem) está escrita à mão em três lugares e diverge num deles: `sticky top-14` e `max-h-[calc(100dvh-3.5rem)]` na linha 111, `h-14` no header (linha 79) e `h-14` no topo da gaveta (linha 132) — enquanto `app/(app)/erp/vendas/sale-form.tsx:463` usa `lg:sticky lg:top-20` (80px) para o painel lateral de venda. Não existe token de altura de header, então subir o header quebra três lugares e deixa um quarto errado.

> **Correção:** Criar `--header-h: 3.5rem` no `@theme inline` de `globals.css` (que já tem a camada de tokens em ordem, linhas 130-178) e derivar `h-[--header-h]`, `top-[--header-h]` e `calc(100dvh - var(--header-h))` a partir dela, inclusive no `sale-form.tsx`.

**`apps/web/src/components/brand/logo.tsx:60`**

Existem duas versões do lockup da marca. O componente `Logo` monta símbolo `h-6` + wordmark `h-3` (linhas 60-61), mas `app/(auth)/layout.tsx:17-18` remonta o lockup à mão com `BrandSymbol h-6` + `BrandWordmark h-3.5` — proporção diferente. A tela de login e a tela logada mostram a marca com pesos relativos distintos, e um ajuste no `Logo` não alcança a de login.

> **Correção:** Usar `<Logo/>` também no layout de autenticação, com uma prop de tamanho (`sm`/`md`) se a tela de login realmente precisa de um wordmark maior, em vez de duas montagens paralelas.

**`apps/web/src/components/shell/app-shell.tsx:101`**

O `ThemeToggle` é um radiogroup de três botões de 28px (claro / sistema / escuro, `theme-toggle.tsx:83-107`) permanentemente visível no header a partir de `sm`. São três alvos de clique de chrome global para uma preferência que se troca uma vez na vida, ocupando a barra mais disputada da interface — e em `<sm` ele já foi exilado para o rodapé da gaveta (`app-shell.tsx:145-148`), o que mostra que a própria implementação reconhece que ele não é essencial.

> **Correção:** Mover o seletor de tema para dentro do menu de conta (ou para o rodapé da sidebar, junto com o botão de colapso), unificando com o tratamento que já existe em mobile. O header ganha o espaço para a busca global.


---

## Telas de Plataforma — automacoes, integracoes, equipe, configuracoes, conta, avisos, empresas

O dono está factualmente certo: não existe tela de criação e gestão de EQUIPES. O banco tem `public.teams` e `public.team_members` com RLS, o catálogo tem `core.teams.read`/`core.teams.write` ("Ver equipes"/"Gerenciar equipes") concedidos aos três papéis padrão, e o vocabulário do Core reserva `core.teams` = "equipe/equipes" — e não há rota, item de menu nem componente algum em apps/web. O que ele achou no menu é `/equipe`, que é a lista de `core.users` ("pessoas da equipe") usando justamente o substantivo reservado para outra entidade; e ninguém pode criar papel nem ver o que um papel concede, apesar de `core.roles.write` existir e ser permitido pelo RLS. Em integrações não há nada fingido — é o melhor exemplo de honestidade do repositório e deve ser preservado. O "é FEIO" se explica em código: confirmação destrutiva em `window.confirm` nativo, números enterrados em frase de subtítulo em vez de faixa de KPI, uma só animação (`animate-enter`), zero busca global, e o logo no header em vez de dentro da coluna da sidebar.

### O que já está bom e deve ser preservado

- integracoes/ é o melhor exemplo de honestidade do repositório e não deve ser tocado. Nenhuma integração é apresentada como real: `EstadoDaIntegracao` é um tipo de um único valor, 'nao-configurado', de propósito (lib/integrations/catalog.ts:18); não há botão de conectar, e o comentário diz por que (integration-card.tsx:8-14); o que falta é separado entre a empresa (cadeado, externo) e a Tivexy (chave inglesa, interno); e o que dá para conferir no banco é conferido de verdade — CNPJ com 14 posições e razão social, via `conferir()` (catalog.ts:170-183). WhatsApp Business, Instagram/Facebook, banco (Pix/boleto) e maquininha aparecem todos como 'Não configurado', com a lista concreta do que falta (conta Meta verificada, app aprovado na revisão, certificado do banco). Nenhum achado de gravidade alta aqui.
- conta/page.tsx:29-33 recusa fingir um fluxo: o e-mail não é editável e a tela escreve o motivo ('trocar exige confirmar o endereço novo por e-mail, e o envio ainda não está configurado'). O comentário do arquivo nomeia a alternativa proibida — um campo que 'salvasse' sem confirmação.
- A decisão de acesso mora num lugar só (config/routes.ts), é fechada por omissão, e `visibleNavigation()` (navigation.ts:234-245) reusa a MESMA decisão para o menu — então menu e página não têm como divergir, e o grupo de administração não aparece acinzentado para quem não é Super Admin.
- `sectionTitle()`/`labelOf()` (navigation.ts:187-201) fazem título de página e rótulo de menu saírem da mesma função, com o vocabulário do tenant. É por isso que renomear o item 'Equipe' é uma mudança de uma linha.
- avisos/page.tsx:102-105 diz em voz alta 'O número no sino atualiza a cada página aberta — não há aviso em tempo real', em vez de deixar o sino sugerir tempo real que não existe.
- automacoes/ tem motor real no banco (supabase/migrations/20260925130000_automation_engine.sql), registro de execução com o motivo da falha visível (runs.tsx:63-65), e o subtítulo nega explicitamente os canais que não existem: 'Nada que dependa de canal externo — sem e-mail, WhatsApp ou webhook' (page.tsx:153). Os modelos prontos ('Comece por um modelo', rules.tsx:71-93) são o padrão de onboarding que as outras telas de plataforma deveriam copiar.
- O `EmptyState` (components/page/empty-state.tsx) já é exatamente o que o alvo pede — ícone em círculo, título, frase explicativa e slot de ação — e as frases escritas nele são boas (equipe/page.tsx:108-110, automacoes/page.tsx:185-193, avisos/page.tsx:93-96). Falta só usá-lo onde não está: integracoes e configuracoes não têm nenhum.
- configuracoes/page.tsx só mostra as preferências dos módulos habilitados e marca com badge 'Alterada' o que saiu do padrão (forms.tsx:109 e :119) — informação real, que responde 'alguém escolheu isso?' sem abrir a auditoria. Módulos e vocabulário aparecem como leitura, dizendo a quem pedir para mudar.
- O `Badge` tem um tom `mock` obrigatório para qualquer coisa simulada (components/ui/badge.tsx:16-17), com a referência ao CLAUDE.md no próprio código — e, nas 7 telas desta dimensão, ele não é usado nenhuma vez, porque não há nada simulado.

### Achados

#### Gravidade alto

**`apps/web/src/config/navigation.ts:154`**

O dono está certo: NÃO existe tela de equipes. `public.teams` e `public.team_members` existem no banco (supabase/migrations/20260919020200_core_identity_rbac.sql:126 e :139), com RLS `teams_read`/`teams_write` (20260919020400_core_rls.sql:282-314), permissões `core.teams.read`/`core.teams.write` rotuladas 'Ver equipes'/'Gerenciar equipes' (20260919020500_core_catalog.sql:41-42), concedidas a Administrador, Gestor E Colaborador (mesma migração, :114-155), e termo de vocabulário `core.teams` = equipe/equipes (apps/web/src/lib/terms/vocabulary.ts:43). Em apps/web não há rota, item de menu nem componente algum para `teams` — grep por `core.teams` só devolve o catálogo e o vocabulário. É o inverso de fingir funcionalidade: capacidade real, permissão concedida, e nenhuma porta. O único item 'Equipe' do menu aponta para a lista de PESSOAS.

> **Correção:** Criar `/equipe/times` (ou `/times`) sobre as tabelas `teams`/`team_members` que já existem: criar, renomear, descrever, adicionar e remover membros pelo `tenant_user_id`. Registrar a regra em apps/web/src/config/routes.ts com `{ kind: 'permission', permission: 'core.teams.read' }` e o item no grupo Plataforma de navigation.ts com `term: 'core.teams'`. Enquanto não existir, o honesto é declarar `status: 'pending'` no menu — sidebar-nav.tsx:18-42 já sabe desenhar item não pronto — em vez de o recurso ser invisível.

**`apps/web/src/app/(app)/equipe/page.tsx:79`**

Faltam papéis e permissões: a tela lê `roles` só para preencher um `<Select>` de nomes (page.tsx:54-60 e :79-83, renderizado em team-forms.tsx:150-164 e :235-246). Nada em nenhum lugar do app mostra o que um papel concede, e não há tela para criar ou editar papel — apesar de `core.roles.read`/`core.roles.write` existirem rotuladas 'Ver papéis e permissões' e 'Criar e editar papéis' (20260919020500_core_catalog.sql:39-40) e de o RLS já permitir papel próprio do tenant (`tenant_id is not null and not is_system`, 20260919020400_core_rls.sql:222-261). O administrador escolhe entre 'Gestor' e 'Colaborador' às cegas, e é isso que faz a tela não parecer 'gestão de equipe'.

> **Correção:** Duas coisas, nesta ordem: (1) no seletor de papel, mostrar o que cada papel concede — ler `role_permissions` + `permissions.description` e exibir como lista ou tooltip ao lado da opção; (2) criar a tela de papéis (`/equipe/papeis`), com `core.roles.read` em routes.ts, usando o termo `core.roles` que já está em vocabulary.ts:41 e hoje não é renderizado em lugar nenhum.

**`apps/web/src/config/navigation.ts:154`**

Causa direta de ele não reconhecer a tela: o item é `{ label: 'Equipe', href: '/equipe', icon: Users, status: 'ready' }` — o único item do grupo Plataforma SEM a chave `term` (compare com Automações :145 e Integrações :152). O recurso que a tela lista é `core.users`, cujo termo padrão é 'pessoas da equipe' (vocabulary.ts:44), enquanto 'equipe/equipes' é o termo reservado de `core.teams` (:43). Ou seja: o menu batiza a lista de pessoas com o substantivo de outra entidade. Quem procura 'equipes' abre 'Equipe', vê uma lista de gente e conclui, corretamente, que a tela de equipes não existe.

> **Correção:** Renomear o item para o recurso que ele realmente lista — 'Pessoas' ou 'Pessoas da equipe' — com `term: 'core.users'`, e deixar 'Equipes' livre para a tela de `core.teams`. `sectionTitle()`/`labelOf()` (navigation.ts:187-201) propagam o nome novo para o `<title>` e o `<h1>` sem tocar na página. Atualizar a expectativa em config/navigation.test.ts:47, que hoje afirma que '"Equipe" continua certo para qualquer nicho'.

#### Gravidade média

**`apps/web/src/components/shell/app-shell.tsx:79`**

A geometria do shell contraria o alvo visual. O header é faixa de largura total, `sticky top-0 z-30 h-14` (:79), com o `<Logo />` dentro dele (:92); a sidebar só começa embaixo, `w-64` com `sticky top-14` (:110-111). O alvo pede logo DENTRO da coluna da sidebar e header começando DEPOIS da sidebar. Além disso a sidebar é largura fixa sem colapso: nada entre :110 e :114 permite recolher para faixa de ícones, então em 1920px são 256px permanentes ao lado de um conteúdo de 896px.

> **Correção:** Inverter o grid do shell: `<aside>` de altura cheia (`h-dvh sticky top-0`) contendo logo + nav, e `<header>` como irmão dentro da coluna de conteúdo, não acima das duas. O logo da gaveta mobile (:133) continua onde está. Aproveitar para dar à `<aside>` um estado recolhido persistido.

**`apps/web/src/components/shell/app-shell.tsx:98`**

Não existe busca global nem atalho Ctrl+K. O header pula do badge 'Em construção' (:94-96) direto para `<div className="ml-auto ...">` (:98) — em 1920px são mais de 1000px de faixa vazia entre o logo e o sino, exatamente o 'mal ocupam direito o sistema'. O componente de busca existe (apps/web/src/components/page/search-box.tsx) e é usado só em crm/contatos e crm/empresas; nenhuma das 7 telas de plataforma tem busca.

> **Correção:** Colocar um campo de busca global no header, entre o logo e o bloco `ml-auto`, com atalho Ctrl+K — precisa de um primitivo de dialog/command que ainda não existe em components/ui. Enquanto isso não vier, a tela de equipe e a de avisos deveriam pelo menos reusar o `SearchBox` que já existe.

**`apps/web/src/app/(app)/equipe/page.tsx:92`**

Nenhuma tela de plataforma tem faixa de KPI. Aqui os números são calculados (`ativos` e `pendentes`, :85-86) e jogados dentro de uma frase no subtítulo do PageHeader: `descricao={`${ativos} com acesso...`}` (:92). O mesmo acontece em avisos/page.tsx:69-73. O alvo pede rótulo + número forte + variação; o componente `CountUp` existe (components/page/count-up.tsx) e é usado só em painel/dashboard.tsx:79.

> **Correção:** Extrair um componente de KPI (rótulo pequeno em cima, número em `font-display` tabular-nums, contexto embaixo) e usá-lo em equipe (com acesso / convites pendentes / suspensos), avisos (não lidos / total) e automações. O bloco de integracoes/page.tsx:62-72 já é quase isso e serve de base.

**`apps/web/src/app/(app)/automacoes/page.tsx:149`**

A tela carrega todas as regras e as últimas 40 execuções (:92-104), monta `historico` com `deuCerto` por execução (:123-131), e não mostra nenhum agregado: nem quantas estão em vigor, nem quantas em pausa, nem quantas falharam. O dado está na memória do servidor e é gasto uma linha por vez em runs.tsx. Um gestor que abre a tela não descobre 'o motor está saudável?' sem ler 40 linhas.

> **Correção:** Acima de 'Em uso e em pausa', uma faixa com 3 ou 4 números derivados do que já está carregado: em vigor, em pausa, execuções e falhas nas últimas 24h (`historico.filter((e) => !e.deuCerto)`). Zero consulta nova.

**`apps/web/src/app/(app)/equipe/team-forms.tsx:293`**

Confirmação destrutiva usa `window.confirm` nativo: aqui (:288-294), em configuracoes/forms.tsx:205 e em automacoes/rules.tsx:173. É um diálogo do sistema operacional, sem tipografia, sem raio, sem cor e sem tema escuro — no meio de uma interface com tokens, é a coisa mais feia da tela, e é o que aparece justamente no momento mais tenso (remover pessoa da equipe). Não existe primitivo de dialog em components/ui (só avatar, badge, button, card, input, switch).

> **Correção:** Criar `components/ui/dialog.tsx` (pode ser `<dialog>` nativo estilizado, sem dependência nova) e trocar as três chamadas de `window.confirm` por um diálogo de confirmação com o texto que já está escrito nelas — as frases atuais são boas, só o recipiente é feio.

**`apps/web/src/app/(app)/equipe/page.tsx:47`**

A tela de equipe não tem busca, filtro por situação nem paginação: lê todos os `tenant_users` do tenant sem `range` nem `limit` (:47-53) e renderiza tudo (:112-117). As listas irmãs de CRM têm `SearchBox` + `Pagination` (crm/contatos/page.tsx, crm/empresas/page.tsx) — inconsistência dentro do mesmo app. Pior: cada linha é `MemberRow`, um client component com quatro `useActionState` (team-forms.tsx:202-205) e um `<Select>` de papéis; uma empresa com 50 pessoas monta 200 action states e 50 selects no cliente.

> **Correção:** Alinhar com as listas de CRM: `SearchBox` por nome/e-mail, filtro por situação (com acesso / convite pendente / suspenso), `Pagination` com o mesmo POR_PAGINA. E mover as ações da linha para um menu por linha, montado só ao abrir, em vez de quatro formulários sempre renderizados.

**`apps/web/src/app/(app)/integracoes/page.tsx:74`**

Densidade: `max-w-4xl` (896px) com os 7 cartões em coluna única (`flex flex-col gap-4`, :74), e cada cartão já tem grid interno de 2 colunas (integration-card.tsx:51). Em 1920px isso é uma tira estreita de 7 blocos altos, com rolagem longa e metade da tela vazia. Nas outras telas da dimensão a largura é ainda menor: configuracoes (:129), conta (:47) e avisos (:66) em `max-w-3xl` (768px), e empresas/page.tsx:27 em `max-w-2xl` (672px) — a tela mais estreita do app inteiro.

> **Correção:** Trocar a coluna única por `grid gap-4 lg:grid-cols-2 2xl:grid-cols-3` e subir o contêiner para uma largura de sistema (por exemplo `max-w-[90rem]` ou sem centralização, com padding), de forma consistente nas 7 telas. Em empresas, `max-w-2xl` não tem justificativa nenhuma — é uma lista de cartões.

**`apps/web/src/components/shell/notification-bell.tsx:22`**

`/avisos` não existe na navegação: `grep` por '/avisos' devolve apenas a própria página, suas actions, a regra em routes.ts:60 e este único link no sino. A tela é real (tem paginação, marcar como lido, empty state), mas só é alcançável clicando no sino — e quando tudo está lido o sino perde o número e deixa de convidar. É a mesma classe de defeito de descoberta que ele relatou em equipe: tela construída, invisível na navegação.

> **Correção:** Incluir `{ label: 'Avisos', href: '/avisos', icon: Bell, status: 'ready' }` no grupo sem cabeçalho de navigation.ts (junto de 'Visão geral' e 'Tutorial'); a regra em routes.ts:60 já é `member`, então `visibleNavigation` resolve sozinho. O sino continua como atalho.

#### Gravidade baixo

**`apps/web/src/app/(app)/empresas/page.tsx:31`**

Plural errado: 'Você participa de {options.length} empresas' imprime 'Você participa de 1 empresas' — e esta tela existe justamente para quem tem mais de um vínculo, então o caso de 1 aparece toda vez que o vínculo é revogado. O helper `contagem()` de lib/format.ts já resolve isso e é usado em avisos/page.tsx:72.

> **Correção:** Usar `contagem(options.length, 'empresa', 'empresas')`.

**`apps/web/src/components/shell/app-shell.tsx:94`**

O badge 'Em construção' é string fixa no shell (:94-96), sem flag, env ou condição: aparece no topo de toda tela, de todo tenant, para sempre. A intenção é honesta, mas não há como aposentá-lo sem editar o componente, e ele ocupa o lugar do que deveria estar ali (busca global).

> **Correção:** Amarrar a uma variável de ambiente ou a uma configuração de plataforma, e tirar do meio do header — ao lado do logo ele é o segundo elemento mais proeminente da interface.

**`apps/web/src/app/globals.css:234`**

Existem só três keyframes no app (`tvx-enter`:234, `tvx-grow`:255, `tvx-fill`:267) e as telas de plataforma usam apenas `animate-enter`, em 5 lugares (automacoes/runs.tsx:47, integracoes/integration-card.tsx:28, equipe/team-forms.tsx:34 e :109, avisos/notification-list.tsx:31). `Card` (components/ui/card.tsx:7) não tem `transition` nem estado de hover, então nas 7 telas nada responde ao ponteiro além de botões e links de menu. Não existe skeleton nem primitivo de loading. É a parte concreta do 'as animações... é FEIO': não são ruins, são ausentes.

> **Correção:** Adicionar hover/elevação ao Card e um `animate-skeleton` para os estados de carregamento — as durações e o `--ease-out` já existem, e o bloco `prefers-reduced-motion` (:279-288) já cobre tudo automaticamente.


---

## Telas de entrada e primeiro uso — (auth)/entrar, recuperar, definir-senha, layout; (app)/onboarding, convite, preparando, tutorial, acesso-negado

O texto destas telas é excelente — provavelmente o melhor do repositório — mas a composição visual é a de um formulário genérico, não de um SaaS premium: o login inteiro cabe em 384px (`max-w-sm`), mais estreito que qualquer tela interna, num fundo vazio, com um card que em tema claro quase não se distingue do fundo. Três defeitos passam de estética: o callback joga quem clicou num link vencido num `/entrar` em branco sem nenhuma explicação, embora a tela `/definir-senha` tenha a mensagem certa escrita e inalcançável; a tela "preparando" não mostra progresso nenhum apesar de `provisioning_steps` existir, ser escrita passo a passo e já ser renderizada no Admin; e a mesma tela imprime o enum cru do banco (`provisioning`, `suspended`) em inglês, com o mapa de rótulos em português pronto e não usado. Nenhuma tela de entrada tem `<h1>`, nenhuma tem movimento enquanto 13 telas internas têm entrada escalonada, e o grupo `(auth)` não tem `error.tsx` nem `loading.tsx`.

### O que já está bom e deve ser preservado

- A cópia destas telas é o melhor material do repositório e não deve ser tocada na reforma visual. `lib/auth/denial.ts` dá a cada motivo de negação um título, uma descrição e um próximo passo distintos, com a justificativa documentada: a diferença entre 'módulo não contratado' e 'sem permissão' é a diferença entre falar com o comercial e falar com o administrador.
- Disciplina contra enumeração de contas em `(auth)/actions.ts`: erro de credencial é sempre o mesmo texto (linha 61), e `recuperar()` responde a mesma confirmação tenha o e-mail conta ou não (linhas 117-129). `email_not_confirmed` é a única exceção, e o comentário das linhas 49-52 explica por que abrir esse caso específico não piora nada.
- Progresso do tutorial contado no banco, nunca marcado à mão (`lib/tutorial/steps.ts:194-207`). É a regra do CLAUDE.md aplicada bem: um passo está feito quando o registro existe. E `quantos()` em `tutorial/page.tsx:27-32` devolve `null` em caso de erro, nunca zero — porque zero mentiria dizendo 'ainda não fez'.
- O tutorial distingue sete estados em vez de feito/não feito: `sem-modulo`, `sem-acesso`, `com-outra-pessoa`, `desconhecido`, `sem-empresa`. Quem não pode fazer um passo lê por quê, em vez de ser mandado para acesso negado. Generalizar esse vocabulário de estado para os empty states do resto do sistema.
- A seção 'O que ainda é externo' (`tutorial-steps.tsx:266-304`) nomeia o que não está implementado em vez de esconder — exatamente a regra de tarefas internas vs externas. É o modelo de como as outras telas devem tratar integração não pronta.
- `convite/page.tsx` separa convite pendente de acesso suspenso em dois cards, porque oferecer 'Aceitar' a quem foi suspenso seria um botão que só dá erro. E `onboarding/page.tsx:9-19` deliberadamente não oferece 'criar empresa', com a referência ao ADR-002 no comentário.
- O tema é aplicado antes da primeira pintura pelo script inline em `app/layout.tsx:56-60`, então a tela de login não pisca em claro antes de virar escura — e o `ThemeToggle` está disponível já no `(auth)/layout.tsx:20`, antes de existir sessão.
- `(app)/loading.tsx` é um esqueleto com a forma do conteúdo, não um spinner centralizado, e `(app)/error.tsx` mostra o `digest` para tornar o erro investigável. São a referência para o que falta criar em `(auth)`.
- Botões de envio desabilitam com spinner e verbo no gerúndio ('Entrando…', 'Aceitando…', 'Gravando…'), `role="alert"` nos erros e `role="status"` nas confirmações, e valores de `autoComplete` corretos em todos os campos (username / current-password / new-password).

### Achados

#### Gravidade alto

**`apps/web/src/app/(auth)/layout.tsx:24`**

A primeira tela do produto inteiro é uma coluna de `max-w-sm` (384px) num fundo `bg-surface-subtle` vazio. Num monitor de 1920px isso é 20% da largura — mais estreito que qualquer tela interna do sistema (as internas já sofrem com max-w-4xl). Não há painel de marca, nem prova de produto, nem imagem, nem sequer uma frase sobre o que é a Tivexy: o cliente que acabou de contratar abre o link e vê um formulário de e-mail e senha solto no branco. O `<header>` (linhas 15-21) tem o logo em h-6/h-3.5 (24px e 14px) — a marca aparece menor do que o botão de tema ao lado dela.

> **Correção:** Transformar em duas colunas a partir de `lg`: à esquerda o formulário num container de 420-480px, à direita um painel que ocupa o resto da largura com `bg-surface-inverse` (navy-900, já existe em globals.css:61) contendo o símbolo grande, uma frase do produto e 2-3 provas concretas (os módulos, o multi-tenant). Abaixo de `lg`, manter a coluna única atual. Subir o logo do header para pelo menos h-8/h-4.

**`apps/web/src/app/auth/callback/route.ts:66`**

Todo caminho de falha redireciona para um `/entrar` limpo, sem parâmetro e sem mensagem: linha 66 (código PKCE recusado), linha 73 (token_hash recusado) e linha 77 (nenhum código). Quem clica num convite vencido, ou num link de recuperação já usado, ou abre o e-mail duas vezes, cai num formulário de login em branco sem uma palavra de explicação — e a hipótese natural dele é que a senha está errada. A tela `/definir-senha` tem exatamente a cópia certa para isso escrita em `definir-senha/page.tsx:29` e `:35` ("O link expirou ou já foi usado. Peça uma nova recuperação") com botão "Pedir novo link", e ela é inalcançável por este caminho, porque o callback nunca chega a `/definir-senha` quando o OTP falha.

> **Correção:** Acrescentar um motivo ao redirecionamento de falha (`falha.searchParams.set('motivo', 'link-invalido')`) e fazer `(auth)/entrar/page.tsx` ler esse parâmetro e renderizar o `Aviso`/`Erro` de `form-parts.tsx` com a mesma cópia de definir-senha, mais um link para `/recuperar`. Distinguir pelo menos dois casos: link vencido/usado e Supabase não configurado.

**`apps/web/src/app/(app)/preparando/page.tsx:36`**

A tela de espera não tem feedback de progresso nenhum — e o próprio comentário admite ("A página não recarrega sozinha... Quando houver acompanhamento de etapa — as linhas de `provisioning_steps` já existem —, é aqui que ele entra"). O cliente recém-provisionado vê um ícone de relógio estático e a frase "Atualize a página em instantes" (linha 43), que empurra o trabalho para ele. O dado existe e é legível: `server/provisioning/execute.ts` grava passo a passo (linhas 898, 909, 942, 955, 963, 987), o RLS permite ao membro do tenant ler (`supabase/migrations/20260919020400_core_rls.sql:350-366`), e o Admin já renderiza essas etapas em `app/(app)/admin/clientes/[id]/page.tsx:82,155`. Só o cliente não vê.

> **Correção:** Quando `estado === 'provisioning'`, ler a última `provisioning_runs` do tenant com `provisioning_steps(step, position, status)` — a mesma consulta de admin/clientes/[id]/page.tsx:82 — e desenhar a lista de etapas com marcador de feita/rodando/pendente e uma barra `animate-fill` (já existe em globals.css:273) com a fração real. Adicionar `export const revalidate = 5` ou um `router.refresh()` em intervalo apenas enquanto o estado for `provisioning`.

**`apps/web/src/app/(app)/preparando/page.tsx:79`**

`<Badge tone={...}>{estado}</Badge>` imprime o enum cru do banco na tela do cliente: `provisioning`, `suspended`, `cancelled` — em inglês, minúsculo, numa interface em português, numa das telas de primeira impressão. O mapa de rótulos já existe e cobre exatamente esses quatro valores: `lib/admin/labels.ts:18-23` tem `SITUACAO` com `{rotulo: 'Em provisionamento', tom: 'warning'}`, `'Suspensa'`, `'Cancelada'`, `'Ativa'`. Além disso o `tone` é decidido por um ternário local (warning ou neutral), então "Conta encerrada" e "Acesso suspenso" recebem o mesmo selo cinza em vez do tom que o mapa já define.

> **Correção:** Importar `SITUACAO` de `@/lib/admin/labels` (ou mover esse mapa para `lib/tenants/labels.ts`, já que deixou de ser só do Admin) e usar `SITUACAO[estado].rotulo` e `SITUACAO[estado].tom` no lugar do enum e do ternário.

#### Gravidade média

**`apps/web/src/app/(auth)/entrar/page.tsx:29`**

Nenhuma tela de entrada tem `<h1>`. `CardTitle` é um `<h3>` (`components/ui/card.tsx:23`), e é ele que titula `/entrar` (linha 29), `/recuperar` (recuperar/page.tsx:13), `/definir-senha` (definir-senha/page.tsx:27), `/onboarding` (onboarding/page.tsx:30) e `/preparando` (preparando/page.tsx:72). A primeira página do produto não tem cabeçalho de página para leitor de tela, e a hierarquia começa em h3 sem h1 nem h2 acima. O padrão certo existe na mesma pasta: `convite/page.tsx:62,109` e `acesso-negado/page.tsx:36` usam `<h1 className="font-display text-xl font-bold text-content">` — ou seja, metade das telas de entrada acerta e metade erra.

> **Correção:** Trocar o `CardTitle` dessas cinco telas por `<h1 className="font-display text-2xl font-bold text-content">`, como em acesso-negado. Aproveitar para aumentar: 'Entrar na Tivexy' em text-xl (20px) é pequeno demais para ser o título da primeira tela; text-2xl/3xl com a Manrope é o que a landing usa.

**`apps/web/src/app/(auth)/form-parts.tsx:19`**

As peças de formulário do login são uma segunda implementação, divergente, das que já existem em `components/form/`. `Erro` (linha 19) usa `bg-danger/10`; `components/form/messages.tsx:13` usa `bg-danger-soft`. São vermelhos diferentes — em tema escuro `--state-danger-soft` é `rgb(217 70 58 / 0.16)` e `--state-danger` é `#ff8378`, então `danger/10` dá um vermelho claramente mais claro. O erro do login tem cor diferente de todo erro do resto do sistema. O mesmo vale para `Enviar` (linha 45) contra `components/form/submit.tsx:14`: código praticamente idêntico, duas versões.

> **Correção:** Apagar `Erro`, `Aviso` e `Enviar` de `(auth)/form-parts.tsx` e usar `FormError`, `FormSuccess` e `Submit` de `components/form/`. Se `Submit` precisar de `className="w-full" size="lg"` no login, passar por prop — ele já aceita `ButtonProps`.

**`apps/web/src/app/(auth)/definir-senha/password-form.tsx:38`**

A dica "Ao menos 8 caracteres." é um `<p>` solto, sem `id` e sem `aria-describedby` no input da linha 30 — o leitor de tela nunca a anuncia, e a pessoa só descobre a regra depois de errar. O componente que resolve isso existe e não é usado por nenhum formulário de entrada: `components/form/field.tsx` com o helper `describedBy(nome, erro, dica)` (linha 53). Nas três telas também não há botão de mostrar/ocultar senha (`login-form.tsx:57`, `password-form.tsx:30` e `:44`) nem nenhuma indicação de força — numa tela cujo único trabalho é fazer a pessoa escolher uma senha boa.

> **Correção:** Migrar os três formulários de entrada para `Field` + `describedBy`. Em definir-senha, acrescentar um botão de olho dentro do campo (ícone `Eye`/`EyeOff` do lucide, com `aria-pressed` e rótulo) e uma barra de força simples derivada de comprimento + variedade de classes de caractere — sem biblioteca, com as mesmas utilidades da barra do tutorial.

**`apps/web/src/app/(app)/tutorial/tutorial-steps.tsx:93`**

Inconsistência de movimento nas telas de entrada. `animate-enter` é aplicado a todo `<li>` sem `animationDelay`, então os ~12 passos sobem em uníssono num único bloco de 280ms — enquanto 13 telas internas escalonam (`painel/dashboard.tsx:148` com 50ms, `crm/contatos/contact-rows.tsx:23` e mais 11 com `Math.min(i,10)*20`). E as demais telas de entrada não têm movimento nenhum: `(auth)/*`, `onboarding`, `preparando`, `convite` e `acesso-negado` não usam `animate-enter` em lugar algum (só `animate-spin` nos botões). O resultado é que o produto parece morto exatamente onde causa a primeira impressão e vivo só depois que a pessoa já entrou.

> **Correção:** Aplicar `style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}` nos itens do tutorial, como no resto do app, e dar `animate-enter` ao card do login, ao card de convite e aos blocos de onboarding/preparando/acesso-negado. A regra de `prefers-reduced-motion` em globals.css:277 já cobre quem pediu menos movimento.

**`apps/web/src/app/(auth)/layout.tsx:12`**

O grupo `(auth)` não tem `error.tsx` nem `loading.tsx` — só `(app)` tem (`(app)/error.tsx`, `(app)/loading.tsx`). Uma falha de servidor em `readSupabaseConfig()` (entrar/page.tsx:24) ou em `currentSession()` (definir-senha/page.tsx:22) cai no erro padrão do Next, sem marca, em inglês, na tela que o cliente vê primeiro. E não há nenhum feedback de transição entre /entrar → /recuperar → /definir-senha: o clique em "Esqueci a senha" fica sem resposta visível até a próxima página pintar.

> **Correção:** Criar `(auth)/error.tsx` reaproveitando o desenho de `(app)/error.tsx` (ícone, digest, botão Tentar de novo) dentro do card do layout de entrada, e `(auth)/loading.tsx` com o esqueleto do card — cabeçalho, dois campos e o botão — no lugar de tela branca.

**`apps/web/src/app/(app)/layout.tsx:43`**

`onboarding`, `preparando`, `convite` e `acesso-negado` renderizam dentro do `AppShell` completo. Quem chega em /onboarding acabou de ler "Sua conta ainda não tem empresa" — e vê ao lado uma sidebar de 16rem com todo o menu de ERP, CRM e configurações (`app-shell.tsx:110-114`), além do selo permanente "Em construção" no header (`app-shell.tsx:94`), que na primeira impressão de um cliente pagante é a pior frase possível de se ler. Cada link dessa sidebar devolve a pessoa para /acesso-negado. O mesmo vale para quem espera em /preparando: menu completo de um sistema que ainda não existe para ele.

> **Correção:** Nessas quatro rotas, colapsar a casca: manter header com logo, tema e menu de conta (para conseguir sair), e suprimir a `<aside>`. Ou movê-las para um grupo `(entrada)` com o mesmo layout enxuto do `(auth)` mais o botão de sair. Separadamente: o selo "Em construção" não deveria aparecer para o cliente final — condicioná-lo a `viewer.isSuperAdmin` ou a uma env.

**`apps/web/src/app/(auth)/layout.tsx:14`**

Em tema claro o card de login praticamente não se separa do fundo: o layout pinta `bg-surface-subtle` (#f6f9fc) e o `Card` pinta `bg-surface-raised` (#ffffff) com `border-line-subtle` (rgb(11 20 36 / 0.07)) e `shadow-xs` (0 1px 2px / 0.06) — cerca de 2% de diferença de luminância e uma borda de 7% de opacidade. O efeito é de um formulário solto, não de um cartão. `--shadow-lg` existe em globals.css:183 e não é usado em nenhuma tela de entrada.

> **Correção:** No layout de entrada, usar `shadow-lg` e `border-line` (12%) no card, e dar textura ao fundo — um gradiente sutil com `--tvx-blue-50` ou um radial com a cor da marca em opacidade baixa. Em tema escuro a separação já funciona (navy-950 contra navy-800), então a mudança precisa ser condicionada ou escolhida com valores que sirvam aos dois.

**`apps/web/src/app/page.tsx:4`**

O redirecionamento da raiz está desatualizado e o comentário afirma o contrário do estado real: "Enquanto não há autenticação, a raiz leva direto para a visão geral. Quando o login existir, esta rota decide entre /entrar e /painel" — o login existe desde que `(auth)/entrar` foi criado. Hoje quem digita o domínio do SaaS faz `/` → `/painel` → o proxy nega → `/entrar?proxima=%2Fpainel`: dois redirecionamentos e um parâmetro de lixo na URL antes de ver a primeira tela. Numa conexão ruim são dois flashes de página em branco na primeira impressão.

> **Correção:** Decidir na raiz: ler a sessão e redirecionar para `/painel` quando houver, para `/entrar` (sem `proxima`) quando não houver. E corrigir o comentário, que hoje descreve um estado que não é mais o do código.

#### Gravidade baixo

**`apps/web/src/app/(app)/tutorial/page.tsx:137`**

O tutorial — a tela que ensina o produto de ponta a ponta e que o painel linka (`painel/dashboard.tsx:210`) — é uma coluna de `max-w-3xl` (768px). São 12 passos em quatro seções, cada um com título curto, duas linhas de texto e um botão; num monitor largo sobram 1100px vazios à direita e a pessoa rola muito para ver o fim. A faixa de progresso (linha 143), que é a informação que ela mais quer olhar, sobe junto com o scroll e desaparece.

> **Correção:** Levar para `max-w-6xl` e dispor as seções em duas colunas a partir de `lg` (`columns-2` não serve por causa da numeração; usar grid com as seções distribuídas). Transformar o bloco de progresso num trilho lateral `sticky top-14`, com o contador, a barra e a lista das quatro seções como âncoras.

**`apps/web/src/app/(app)/tutorial/page.tsx:132`**

`const feitosTotal = feitos + (temEmpresa ? 2 : 0)` e `const totalGeral = total + 2` codificam o número 2 porque os dois primeiros passos ("Criar a empresa com um Blueprint" e "Entregar o acesso") estão escritos à mão em `tutorial-steps.tsx:157` e `:184`, fora de `passosDoTutorial()`. Os outros dez vêm de `lib/tutorial/steps.ts`. É o contador que a barra de progresso inteira lê, e acrescentar um terceiro passo de Admin exige lembrar de editar um número mágico noutro arquivo — o sintoma seria uma barra que nunca chega a 100%.

> **Correção:** Levar os dois passos do Admin para `passosDoTutorial()` com uma `secao: 'admin'` e um estado derivado de `temEmpresa`, para que `progresso()` conte todos pela mesma regra e o `+2` desapareça.

**`apps/web/src/app/(auth)/entrar/login-form.tsx:31`**

O erro do login é renderizado acima dos campos (linha 31) e os inputs recebem `aria-invalid={estado.erro !== null}` (linhas 43 e 63), mas nenhum `aria-describedby` liga os campos à mensagem. Para quem usa leitor de tela, o campo anuncia "inválido" sem dizer por quê — e o `role="alert"` só resolve se o foco não tiver saído dali. Falta também aviso de Caps Lock, que é a causa mais comum de "minha senha está certa e não entra" numa tela cujo texto de erro, por decisão deliberada de não permitir enumeração (`actions.ts:15-17`), nunca pode dizer qual dos dois campos está errado.

> **Correção:** Dar um `id` ao `Erro` e apontar `aria-describedby` dos dois inputs para ele quando houver erro. Acrescentar um aviso de Caps Lock no campo de senha com `onKeyUp`/`getModifierState('CapsLock')` — é a única pista que se pode dar sem revelar qual campo falhou.


---

## Painel (dashboard) — src/app/(app)/painel/ e src/lib/painel/

O painel é honesto e é feio, nessa ordem. Nenhum número é inventado: todos saem de RPC `SECURITY INVOKER` real (`erp_sales_summary`, `erp_sales_daily`, `finance_summary`) ou de `count: exact`, e a distinção entre "não pode ver" (`undefined`) e "não consegui ler" (`null`) é rigorosa — falha nunca vira zero. O problema é composição: uma coluna de 1024px centrada num monitor de 1920 com a sidebar, quatro cards empilhados, 14 indicadores sem variação e sem sparkline, gráfico sem eixo e sem tooltip de verdade, nenhum seletor de período, nenhum cartão de ação rápida e nenhum painel de "próxima melhor ação". O agravante: o padrão certo já existe no próprio repo em `/erp/financeiro` (cartão com ícone + link para a lista filtrada, gráfico com legenda, eixo e série secundária) e em `/erp/vendas` (seletor 7d/30d/tudo por searchParams) — o painel, que é a tela mais importante, usa a versão pior. Há um achado grave de dado: `.limit()` silencioso em funil e estoque faz somas parciais serem exibidas como o total da empresa.

### O que já está bom e deve ser preservado

- Nenhum número inventado — a verificação pedida deu limpo. Todo valor exibido sai de RPC que existe nas migrations (`erp_sales_summary`, `erp_sales_daily`, `finance_summary`, todas `SECURITY INVOKER`, passando pelo RLS) ou de `count: 'exact'`. Não há série fixa, mock, placeholder nem estimativa em nenhum dos cinco arquivos do painel.
- A distinção de três estados é rigorosa e rara: `undefined` = esta pessoa não pode ler (a seção some), `null` = a leitura falhou (a seção aparece e diz), valor = dado. Documentada em dashboard.tsx:168-172 e implementada em `contar()` (page.tsx:176-180), que devolve `null` em erro e nunca zero — "falha não é 'não há'". Esse é o melhor padrão do painel e deve ser generalizado para as outras telas.
- A matemática se recusa a mentir: `ticketMedio` devolve `null` sem venda em vez de R$ 0,00 (lib/painel/dashboard.ts:26) e `comparacaoSemanal` devolve `variacao: null` quando não há base, em vez de 0% (linha 49). Ambos cobertos por teste (dashboard.test.ts:29 e 34). O chip de variação novo tem que herdar exatamente esse comportamento.
- `alturasDasBarras` (lib/painel/dashboard.ts:59-67): valor pequeno nunca some (piso de 2px) e zero é zero — uma barra de R$ 3 ao lado de uma de R$ 3.000 existe, e um dia sem venda não parece que vendeu. Testado em dashboard.test.ts:41. Serve como está para os sparklines.
- Acessibilidade do gráfico acima da média: `role="img"` com `aria-labelledby` ligando `<title>` e `<desc>` (sales-chart.tsx:74-81), a mesma informação em tabela semântica com `<caption>` e `<th scope>` (linhas 152-188), e cor nunca sozinha — "hoje" tem rótulo de texto além do destaque (linha 99). Preservar ao construir o tooltip próprio.
- Movimento reduzido tratado nos dois níveis: a regra global em globals.css:277-287 zera duração e delay (com o comentário certo sobre itens em sequência ficarem invisíveis), e o `CountUp` checa `matchMedia` antes de animar e entrega o valor final no HTML do servidor (count-up.tsx:36 e 44). O problema das animações é de orquestração, não de acessibilidade.
- Permissão antes da consulta: o `Promise.all` de page.tsx:264-281 só dispara cada leitura para quem tem a permissão correspondente (`erp.sales.read`, `finance.cashflow.read`, `crm.deals.read`, etc.), e cada leitura falha isolada sem derrubar as outras. O painel novo, mais denso, precisa manter esse desenho seção a seção.
- Já existe no repo o padrão visual que o painel deveria usar: `Cartao` (app/(app)/erp/financeiro/summary.tsx:35-78) com ícone, valor grande, detalhe e link para a lista já filtrada; `UpcomingDues` (mesmo arquivo, linha 158) como painel de próximas; `CashflowChart` (app/(app)/erp/financeiro/cashflow-chart.tsx) com legenda, eixo e segunda série hachurada; e `periodoPedido`/`SalesFilters` (app/(app)/erp/vendas/state.ts:54 e page.tsx:151) como seletor de período. Nada disso precisa ser inventado — precisa ser promovido a components/ui e consumido pelo painel.

### Achados

#### Gravidade alto

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/page.tsx:139`**

Soma parcial apresentada como total da empresa. As consultas de `crm_deals` têm `.limit(5000)` (abertas, linha 139; fechadas no mês, linha 145) e as de estoque têm `.limit(5000)` em `erp_products` (linha 213) e `.limit(10000)` em `inventory_stock_levels` (linha 218), sem ordenação e sem paginação. Passado o limite, a UI continua afirmando totais absolutos: "{N} em andamento, somando {R$ X}" (dashboard.tsx:370-372), "de {N} controlados" (dashboard.tsx:412) e "Ganhos no mês" (dashboard.tsx:331-337). Pior: em page.tsx:228, `saldo.get(String(p.id)) ?? 0` trata linha ausente de saldo como zero — se `inventory_stock_levels` for truncada, produtos com estoque real são contados como "Zerados" e o KPI vermelho passa a ser um número que não existe no banco. Isso cai direto na regra "não fingir funcionalidade": o painel diz ser "Números do banco da empresa, agora" (dashboard.tsx:203).

> **Correção:** Mover as três agregações para RPC que soma no Postgres, como já é feito em `erp_sales_summary`/`finance_summary` — um `crm_pipeline_summary(p_tenant_id, p_pipeline_id)` e um `inventory_summary(p_tenant_id)` `SECURITY INVOKER`. Enquanto isso não existe, contar antes com `count: 'exact', head: true` e, se a contagem passar do limite, devolver `null` na seção (o painel já sabe exibir "não consegui ler agora") em vez de exibir soma parcial. E separar "sem linha de saldo" de "saldo zero": `saldo.has(id) === false` não é zerado.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:200`**

`mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8` na raiz do painel. Com a sidebar `w-64` do AppShell (app-shell.tsx:110), num monitor de 1920px o `<main>` tem ~1664px e o conteúdo ocupa 1024px — sobram ~320px de vazio de cada lado. Dentro desse limite, a linha 216 empilha tudo em `flex flex-col gap-6`: quatro cards de largura cheia, um debaixo do outro. Só o card de vendas (que tem gráfico) merece largura cheia; "Dinheiro", "CRM" e "Estoque" esticam 4 e 3 tiles por 1024px e ficam ralos. O mesmo `max-w-5xl` está no skeleton (loading.tsx:12), então o defeito é consistente, não acidental.

> **Correção:** Trocar por um container fluido com teto alto (ex.: `w-full px-4 sm:px-6 lg:px-8 2xl:max-w-[1600px] 2xl:mx-auto`) e substituir a pilha da linha 216 por um grid bento: faixa de KPIs em cima ocupando as 12 colunas, gráfico de vendas em 8 colunas e uma coluna lateral de 4 com "próximas" e "atividades recentes", estoque e funil lado a lado embaixo. Atualizar loading.tsx:12 junto, senão o esqueleto e a página passam a discordar.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:232`**

Não existe faixa de KPIs. Os até 14 indicadores estão picados em quatro grids independentes, cada um dentro do seu card: vendas `grid-cols-2 sm:grid-cols-3` (linha 232), dinheiro `grid-cols-2 lg:grid-cols-4` (linha 286), CRM `grid-cols-2 lg:grid-cols-4` (linha 322), estoque `grid-cols-2 sm:grid-cols-3` (linha 401). Nenhum grid tem passo acima de `lg`, então de 1024px a 1920px o número de colunas nunca aumenta — os tiles só engordam. O alvo é uma faixa única de 5 KPIs acima da dobra; aqui, para ver o número de estoque é preciso rolar por três cards.

> **Correção:** Extrair os 4 ou 5 números que realmente decidem o dia (venda do mês, saldo do mês, a receber vencido, ganhos no mês, estoque crítico) para uma faixa única no topo, antes dos cards, com `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`. Os cards de seção ficam com o detalhamento (gráfico, barras do funil, lista), não com KPI solto.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:57`**

O `Indicador` (linhas 57-92) não tem onde receber variação nem sparkline: a assinatura é rótulo + valor + nota + tom, e a `nota` é texto (`ReactNode` usado só como frase). Resultado: 13 dos 14 números da tela aparecem sem nenhuma comparação. A única variação da página é uma frase solta de parágrafo nas linhas 260-266 ("Últimos 7 dias: R$ X — N% acima dos 7 dias anteriores"), e `comparacaoSemanal` (lib/painel/dashboard.ts:36-51) já devolve `{atual, anterior, variacao}` pronto para virar chip. Não existe a palavra sparkline em lugar nenhum de apps/web.

> **Correção:** Dar ao `Indicador` dois slots novos: `variacao?: {valor: number | null; rotulo: string}` renderizado como chip com seta e cor (danger/success, `null` = "sem base para comparar", nunca 0%), e `serie?: readonly number[]` para um `<svg>` sparkline de ~64x20 usando `alturasDasBarras` que já existe em lib/painel/dashboard.ts:59. A série diária já está em memória (`vendas.dias`); para dinheiro e CRM é preciso uma segunda janela nas RPCs (`finance_summary` aceita mês anterior sem mudança).

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/page.tsx:73`**

Não há seletor de período e a arquitetura da página impede um: `PainelPage()` (linha 250) não recebe `searchParams` — é a única página de `(app)` sem isso (todas as outras 11 têm) — e a janela está fixada em 14 dias na linha 73 (`p_from: addDays(hoje, -13)`). O mês também é fixo (`startOfMonth`). O alvo pede 7/30/90 dias, e o padrão já existe pronto no repo: `periodoPedido()` em app/(app)/erp/vendas/state.ts:54 com `?periodo=7d|30d|tudo` e o componente de filtros usado em app/(app)/erp/vendas/page.tsx:151.

> **Correção:** Dar `searchParams` a `PainelPage`, reaproveitar `Periodo`/`periodoPedido` de erp/vendas/state.ts (ou promovê-los a `lib/painel/`), e passar os dias ao RPC — `erp_sales_daily` já aceita até 92 dias (migration 20260925150000, linha 31), então 7/30/90 cabe sem tocar no banco. O seletor entra no slot `acoes` do PageHeader.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:74`**

Não existe painel de "próxima melhor ação" nem de atividades recentes, embora os ingredientes já sejam lidos e jogados fora como número passivo. "A receber vencido" (linha 294), "Minhas atrasadas" (linha 346) e "Saldo negativo" (linha 402) pintam de vermelho e param aí: o `Indicador` é um `<div>` (linha 74), não um `Link` — o usuário vê o alerta e não tem para onde clicar. E a agenda é lida com `count: 'exact', head: true` em page.tsx:194, ou seja, o painel conta as atividades e nunca traz nenhuma. A lista de "próximas" já está construída no repo: `UpcomingDues` em app/(app)/erp/financeiro/summary.tsx:158, com ícone por direção, prazo, valor e link — e o painel não a usa.

> **Correção:** Criar um card "Próxima melhor ação" que ordene os alertas que já existem (vencido > atrasadas > estoque negativo > zerados) e renderize cada um como linha clicável para a lista já filtrada, no formato de `UpcomingDues`. Em paralelo, trocar `head: true` em `lerAgenda` por um select das 5 próximas atividades com título e prazo, e transformar cada tile de alerta em `Link` (o `Cartao` de erp/financeiro/summary.tsx:71-77 já tem o padrão com/sem href).

#### Gravidade média

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/sales-chart.tsx:89`**

O "tooltip" do gráfico grande é um `<title>` SVG nativo (linha 89): depende do delay de ~1s do sistema operacional, não tem hover state, não é alcançável por teclado e não existe no toque. O gráfico também não tem eixo Y, grade, nem rótulo de valor — só a linha de base (linhas 139-146). O maior valor do período só é dito no `<desc>` (linha 80), que é conteúdo de leitor de tela. Na prática, ninguém consegue ler magnitude nenhuma do gráfico: os números só aparecem dentro de um `<details>` fechado (SalesTable, linha 154).

> **Correção:** Construir tooltip próprio: um `<rect>` transparente por coluna capturando `onPointerMove`/`onFocus` (com `tabIndex={0}`), um card posicionado em absoluto sobre o SVG com dia, valor e nº de registros, e uma linha-guia vertical. Acrescentar 3 linhas de grade horizontais com rótulo de valor à esquerda, e deixar a `SalesTable` aberta por padrão no desktop (ou como painel lateral) em vez de escondida.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/sales-chart.tsx:82`**

Não há série do período anterior no gráfico. `comparacaoSemanal` já calcula `anterior` (lib/painel/dashboard.ts:48) e o resultado morre numa frase. O `Grafico` desenha uma única série de barras (linhas 82-138) sobre os 14 dias, sem sobreposição. O alvo pede linha pontilhada do período anterior — e esse padrão exato já está implementado no repo, com legenda e hachura, em app/(app)/erp/financeiro/cashflow-chart.tsx:47-60.

> **Correção:** Buscar a janela anterior de mesmo tamanho (`addDays(hoje, -27)` a `addDays(hoje, -14)` — `erp_sales_daily` já aceita 92 dias) e desenhar por cima uma `<polyline>` com `strokeDasharray`, alinhada por índice do dia e não por data, mais uma legenda `<figcaption>` no formato de cashflow-chart.tsx:47.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:74`**

O `Indicador` é uma cópia pior de um componente que já existe: `Cartao` em app/(app)/erp/financeiro/summary.tsx:35-78 tem ícone lucide colorido, valor `text-xl sm:text-2xl`, detalhe e `href` opcional com `hover:border-line`. O `Indicador` do painel não tem ícone, não tem link, e é menor (`text-lg sm:text-2xl`, linha 83). Pior, o fundo é `bg-surface-subtle` (linha 74) dentro de um `Card` que é `bg-surface-raised` (ui/card.tsx:7): o tile fica afundado dentro do cartão elevado, invertendo a hierarquia — o número mais importante da tela é a superfície mais recuada. Nenhum dos dois componentes está em components/ui, então são dois KPIs divergentes no mesmo produto.

> **Correção:** Promover um único `StatCard` para src/components/ui/, com ícone, valor, detalhe, chip de variação, sparkline e href opcional, sobre `bg-surface-raised` com `shadow-xs`; migrar `Indicador` e `Cartao` para ele. Subir o valor para `text-2xl sm:text-3xl font-display tabular-nums` — hoje o KPI (24px) empata com o `<h1>` da página (header.tsx:22, `text-2xl sm:text-3xl`), o que apaga a hierarquia.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:122`**

Todos os empty states internos usam `Vazio` (linhas 122-128): um `<p>` em borda tracejada, sem ícone e sem botão. São 8 ocorrências (linhas 224, 227, 254, 279, 281, 355, 356, 375, 394, 396). O `EmptyState` de components/page/empty-state.tsx aceita ícone e `acao`, está importado no mesmo arquivo (linha 7) e é usado uma única vez (linha 207). O caso mais gritante é o das linhas 225-229: o texto diz "no balcão, leva segundos" e não oferece botão para /erp/vendas/nova, com `podeRegistrarVenda` em escopo logo acima (linha 220).

> **Correção:** Aposentar `Vazio` e usar `EmptyState` com o ícone da seção (ShoppingCart, Wallet, Users, Package) e `acao` com o botão que a frase promete — vendas → /erp/vendas/nova quando `podeRegistrarVenda`, funil → /crm/oportunidades, estoque → /erp/produtos. Manter o `Vazio` atual só para o caso de falha de leitura, que não tem ação a oferecer.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:106`**

Animações sem orquestração — é a queixa literal do dono. Os quatro cards recebem `animate-enter` idêntico e sem delay (linha 106), então a página inteira translada 6px junta em vez de escalonar; o keyframe `tvx-enter` foi escrito para item de lista ("o que entra na lista chega, não aparece", globals.css:226-231). Somado a isso, cada visita dispara: até 14 `CountUp` contando de zero por 700ms (count-up.tsx:43), 14 barras com `animate-grow` de 520ms escalonadas (sales-chart.tsx:109-111) e as barras do funil com `animate-fill` de 700ms (linha 145). São três sistemas de movimento simultâneos, ~1,2s de tela inquieta, repetidos toda vez que se volta para /painel.

> **Correção:** Escolher um só evento de entrada: escalonar os cards com `animationDelay: ${i*60}ms` e desligar `animate-enter` dos filhos, ou manter a entrada no card e tirar `animate-grow`/`animate-fill` de dentro. Limitar o `CountUp` aos KPIs da faixa do topo (não a 14 números), e não recontar em navegação de volta — guardar em `sessionStorage` que a contagem já rodou, ou só animar quando o valor mudou.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/sales-chart.tsx:73`**

O SVG escala a tipografia junto com o container: `viewBox="0 0 640 200"` (linha 73) com `h-auto w-full` (linha 76). Dentro do `max-w-5xl` atual, o fator é ~1,54 e o `text-[11px]` das linhas 97 e 129 renderiza a ~17px; se o painel for para largura cheia (~1664px), vira ~28px — o rótulo do dia fica maior que o título do card. E só existe um breakpoint entre os dois desenhos (`sm:hidden`/`hidden sm:block`, linhas 30 e 38), então de 640px a 1920px é sempre o mesmo desenho de 640 unidades esticado. Ou seja: corrigir o desperdício de largura piora o gráfico.

> **Correção:** Desacoplar o texto da escala: renderizar os rótulos fora do SVG (em HTML, num grid alinhado às colunas) ou usar `vector-effect`/`<foreignObject>`, ou fixar `preserveAspectRatio` com altura em pixels reais (`h-[260px] w-full` + viewBox recalculado pela largura medida). Ao mesmo tempo, subir `ALTURA` (linha 7) — 200 unidades é gráfico de cartão, não o "gráfico grande" do alvo.

#### Gravidade baixo

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:201`**

O `PageHeader` tem um slot `acoes` (components/page/header.tsx:29, `flex flex-wrap items-center gap-2`) que o painel não usa — as linhas 201-204 passam só `titulo` e `descricao`. É exatamente o lugar do seletor 7/30/90, do botão de atualizar e das ações rápidas. No lugar disso, a descrição gasta a linha com uma defesa ("Números do banco da empresa, agora — nada aqui é estimativa"), que é uma promessa de engenharia, não informação operacional.

> **Correção:** Passar `acoes` com o seletor de período e 2-3 ações rápidas (Registrar venda, Nova oportunidade, Lançar conta), respeitando a permissão que já está em escopo (`podeRegistrarVenda`, linha 188). Reduzir a descrição à data por extenso, que já vem pronta em `dataDeHoje`.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:419`**

O único controle de atualização é um `<Link href="/painel">` com a palavra "recarregue", dentro de um parágrafo `text-xs text-content-subtle` no rodapé da página (linhas 419-428) — abaixo de tudo, fora do campo de visão de quem olha os números, e visualmente indistinguível de nota de rodapé. Um dashboard cujos dados são de leitura instantânea precisa do controle junto do período, no topo.

> **Correção:** Substituir por um botão de atualizar (ícone RefreshCw + `router.refresh()` num client component pequeno) ao lado do seletor de período no slot `acoes`, com o horário da última leitura ao lado. O parágrafo do rodapé pode sair inteiro.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/page.tsx:104`**

`entrouNoMes` é lido do banco (linha 104, de `received_month_cents`) e nunca exibido: o único uso é o teste `Object.values(dinheiro).every((v) => v === 0)` em dashboard.tsx:280. O "Saldo do mês" mostra só o resultado, com a nota genérica "entrou menos saiu, no regime de caixa" (dashboard.tsx:291), enquanto o card equivalente do financeiro mostra a decomposição real — "entrou R$ X, saiu R$ Y" (erp/financeiro/summary.tsx:98). Dado pago em consulta e descartado na tela.

> **Correção:** Usar `entrouNoMes` (e `entrouNoMes - saldoDoMes` como saída) na nota do indicador de saldo, no formato de summary.tsx:98. Se a decisão for não mostrar, tirar o campo da interface `Dinheiro` em vez de carregá-lo.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/loading.tsx:23`**

O esqueleto não tem a forma do painel, apesar do comentário na linha 5 afirmar que tem ("a página não salta quando os dados chegam"). Ele desenha três cartões de texto em `md:grid-cols-3` (linhas 23-31); o painel real entrega até quatro seções empilhadas de largura cheia, com um gráfico de ~300px de altura. O salto é garantido — e vai piorar quando a faixa de KPIs e o grid bento entrarem.

> **Correção:** Esse loading é o do grupo `(app)` inteiro, então o certo é criar um src/app/(app)/painel/loading.tsx próprio, com a faixa de KPIs, o bloco do gráfico e as colunas laterais nas mesmas proporções do painel novo. Manter o genérico para as demais rotas.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:263`**

`comparacaoSemanal(vendas.dias)` é chamada duas vezes na mesma frase — linha 263 para `.atual` e linha 265 para `.variacao`. A função varre a série duas vezes com dois `reduce` cada (lib/painel/dashboard.ts:43-45). Custo desprezível com 14 dias, mas vira problema quando o seletor de período trouxer 90.

> **Correção:** Extrair uma vez: `const semana = comparacaoSemanal(vendas.dias);` antes do JSX e usar `semana.atual` / `semana.variacao`.


---

## Telas de CRM (apps/web/src/app/(app)/crm)

O CRM tem uma base de componentes decente (PageHeader, EmptyState, Field, Submit, Pagination, vocabulário por tenant) mas a composição é de "formulário empilhado em coluna estreita", não de sistema denso: 9 dos 10 contêineres de página são max-w-3xl/4xl, não existe uma única tabela, ordenação ou filtro além de busca por texto, e não há table/dialog/dropdown/tooltip/skeleton para compor com. O defeito mais grave não é visual: várias telas somam KPIs e contagens sobre consultas truncadas por .limit() e apresentam o resultado como total — o funil, a lista de leads e a página de empresa mostram números que deixam de ser verdade a partir de 200/500 registros, sem qualquer aviso. A tela de leads é um módulo inteiro que ficou fora da padronização (header, empty state, erro, campos e botões todos reimplementados à mão) e sua ação de mover estado descarta o erro do banco, falhando em silêncio.

### O que já está bom e deve ser preservado

- Vocabulário por tenant aplicado de forma consistente: `sectionTitle(terms, rota)` e `termOf(terms, 'crm.deals')` alimentam título da página, título da aba (`generateMetadata`), rótulos de campo e textos de empty state. Nenhuma tela escreve "Lead" ou "Oportunidade" à mão. É o ativo mais forte do módulo e deve ser mantido em qualquer refatoração visual.
- `can(viewer, 'crm.X.write')` decidindo a interface em contatos, empresas, oportunidades, funis e atividades — o botão some em vez de aparecer e falhar. Generalizar para leads.
- Movimento otimista bem feito em board.tsx (useOptimistic + reversão automática + `aria-live` sr-only anunciando o resultado) e em agenda.tsx (concluir risca na hora). É o padrão certo para as demais ações.
- Duas formas de mover no kanban, e a segunda não é enfeite: "Mover para…" faz o mesmo que arrastar pela mesma função, então teclado e leitor de tela alcançam a operação. Preservar isso ao trocar o `<details>` por um dropdown de verdade.
- `Pagination` com `count: 'exact'` mostrando "1–50 de 312" e preservando a busca na URL; `SearchBox` como form GET, o que torna o resultado copiável e navegável pelo botão voltar. Esse contrato de estado-na-URL deve valer para os filtros e a ordenação que faltam.
- Busca em documento normalizando pontuação (`normalizeDocument` + condição `document.ilike`), de modo que "529.982" e "529982" acham a mesma pessoa.
- Números sempre com `tabular-nums` e valores monetários por `formatCents`, datas por um único `lib/format.ts` — sem formatação divergente entre telas.
- `Field` + `describedBy` ligando rótulo, dica e erro por id, e `Submit` com `useFormStatus` impedindo envio duplo. São bons primitivos; o problema é que leads não os usa e que falta escopo de id.
- A camada de animação respeita `prefers-reduced-motion` globalmente (globals.css:280-287, zerando inclusive o `animation-delay`, que é o detalhe que normalmente se esquece e deixa o item invisível).
- Empty states que dizem o que fazer e não só que está vazio, com variante distinta para "nada cadastrado" e "a busca não achou" (contatos/page.tsx:137-156) — inclusive com botão "Limpar a busca". É o padrão a replicar nas telas que ainda não o têm.
- Comentários no código que registram a decisão de produto e o motivo (o `relative` do contêiner rolável em board.tsx:166-171, o porquê de salvar o tipo da etapa num clique separado em editor.tsx:177-180). Isso torna a refatoração visual muito mais segura.

### Achados

#### Gravidade alto

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:85`**

Os KPIs do funil ("Em aberto", "Ganhos", "Perdas") e o total de cada coluna são calculados por stageTotals/boardTotals sobre o array `negocios`, que a página monta com `.limit(500)` para as abertas e `.limit(200)` para as fechadas (oportunidades/page.tsx:150 e :158). A partir de 500 oportunidades abertas no funil, o número grande em R$ no topo da tela deixa de ser o valor do funil e passa a ser o valor das 500 mais recentemente atualizadas — apresentado como se fosse o total, sem nenhum aviso. Isso é dado que não existe sendo mostrado como se existisse.

> **Correção:** Buscar os agregados por uma consulta de soma/contagem separada (RPC ou select com count exato + sum por stage_id), sem limite, e usar o `.limit()` apenas para os cartões desenhados. Enquanto o agregado real não existir, rotular explicitamente: "soma das 500 mais recentes".

**`apps/web/src/app/(app)/crm/leads/page.tsx:81`**

A consulta traz `.limit(200)` sem `count: 'exact'`, e a linha 107 imprime `{abertos.length} em aberto` e `{fechados.length} com desfecho` a partir desse array truncado. Com 250 leads, a tela afirma "200 em aberto" — um número que é artefato do limite, não do banco. Não há busca nem paginação nesta tela (é a única lista do CRM sem as duas), então os leads além do 200º ficam inalcançáveis pela interface.

> **Correção:** Adotar o mesmo padrão de contatos/empresas: `{ count: 'exact' }`, `SearchBox`, `paginaPedida`/`range` e `<Pagination>`. A contagem do cabeçalho tem que vir do `count`, não do `length` da página.

**`apps/web/src/app/(app)/crm/leads/actions.ts:193`**

`moverLead` faz `await supabase.from('crm_leads').update(...)` e descarta completamente o resultado — não lê `error` nem `count`. A função retorna `void`, e `LeadRow` (lead-row.tsx:71-82) a chama num `<form action={moverLead}>` sem `useActionState`. Se o RLS recusar a escrita (usuário só com `crm.leads.read`) ou se a linha não casar (`.eq('status', de)` após outra aba já ter movido), a página revalida e volta idêntica: o clique em "Qualificar" / "Descartar" não faz nada e não diz nada. É o oposto do que board.tsx e agenda.tsx fazem, que tratam erro e anunciam.

> **Correção:** Transformar `moverLead` em action com estado (`(anterior, form) => Promise<{erro}>`), verificar `error` e a contagem de linhas afetadas, e renderizar o erro em `LeadRow` como o board faz com `<FormError>`. Adicionar `Submit`/`useFormStatus` nos botões de transição para dar sinal de pendência.

**`apps/web/src/app/(app)/crm/empresas/[id]/page.tsx:91`**

O comentário do arquivo (linhas 43-45) promete "Os totais são de **todas** as oportunidades da conta, de todos os funis", mas a consulta que alimenta `totalsByKind` (linha 113) tem `.limit(200)`. A faixa de KPIs "Em aberto / Ganhos / Perdas" de uma conta grande mostra o total das 200 mais recentes rotulado como o histórico completo. A lista de pessoas da conta tem o mesmo problema com `.limit(100)` (linha 82) e a de contatos/[id] com `.limit(50)` (contatos/[id]/page.tsx:86), sem nenhum "mostrando 50 de N".

> **Correção:** Somar no banco (RPC agregando por kind, sem limite) para os KPIs, e nas listas trocar o limite mudo por `count: 'exact'` com rodapé "mostrando X de N" e link para a lista filtrada.

**`apps/web/src/app/(app)/crm/contatos/page.tsx:108`**

Densidade e largura: a lista de contatos vive em `max-w-4xl` (896px) e cada linha é um `<Link>` com `p-4` + avatar `size-9` (contact-rows.tsx:26-30), ou seja ~68px por linha. Com POR_PAGINA=50, são ~3400px de rolagem numa coluna que ocupa 46% de um monitor de 1920px — o resto é vazio. Não há tabela, não há colunas alinhadas, não há cabeçalho, não há ordenação (nenhum arquivo do CRM lê um parâmetro de ordem; a ordem é sempre `.order('name')`). O e-mail/telefone vão num bloco alinhado à direita com `max-w-[40%]` (contact-rows.tsx:40), que só aparece em `sm:` — então não existe uma coluna para o olho descer. O mesmo vale para empresas/page.tsx:90 e company-rows.tsx.

> **Correção:** Criar um primitivo `table` em src/components/ui e converter contatos e empresas em tabela densa (linha ~40px, colunas Nome / Cargo / Empresa / E-mail / Telefone / Documento / Responsável), com cabeçalho clicável para ordenar via searchParam `ordem`. Trocar `max-w-4xl` por largura cheia com `max-w-[1600px]` no contêiner de página.

**`apps/web/src/app/(app)/crm/leads/page.tsx:103`**

A tela de leads está fora de toda a padronização do módulo, em cinco pontos no mesmo arquivo: (1) linha 104-110 escreve o `<header>` à mão em vez de usar `<PageHeader>`, que todas as outras telas de CRM usam; (2) linhas 125-137 desenham um empty state à mão dentro de um `<Card>` (círculo `size-10` com ícone) em vez de `<EmptyState>`, que tem `size-11`, borda tracejada e slot de ação; (3) linhas 116-123 imprimem `{error.message}` cru do PostgREST na tela, enquanto contatos/empresas/oportunidades usam `<FormError>` com texto genérico; (4) linhas 41-44 devolvem `null` quando o tenant não está resolvido — página em branco —, enquanto todas as outras devolvem `<NoTenant />`; (5) as linhas da lista não têm `animate-enter`, presente em contact-rows, company-rows, agenda e board. O resultado é que leads parece outro produto.

> **Correção:** Migrar leads/page.tsx para `PageHeader`, `EmptyState`, `FormError` e `NoTenant`, e adicionar o `animate-enter` escalonado em `LeadRow` com o mesmo `Math.min(i, 10) * 20` de contact-rows.

**`apps/web/src/app/(app)/crm/leads/page.tsx:112`**

A tela de leads não importa nem chama `can()`. `<LeadForm>` (linha 113) e os botões de transição e de converter em `LeadRow` são renderizados para qualquer pessoa que consiga abrir a rota. Contatos (page.tsx:53), empresas (page.tsx:44), oportunidades (page.tsx:72) e atividades (page.tsx:44) todas calculam `podeEditar = can(viewer, 'crm.X.write')` e escondem o formulário. Quem tem só `crm.leads.read` vê "Cadastrar lead", "Qualificar", "Descartar" e "Converter" — botões de funcionalidade que ele não tem. Combinado com o achado do `moverLead` que engole o erro, o clique simplesmente não faz nada.

> **Correção:** `const podeEditar = can(viewer, 'crm.leads.write')` e condicionar `<LeadForm>`, os `destinos` de `LeadRow` e o `<ConvertForm>` a ele, exatamente como as outras quatro telas fazem.

#### Gravidade média

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:195`**

O kanban só é kanban em `lg:`. O `<ol>` da linha 173 é `flex-col lg:flex-row` e as colunas são `lg:w-72 lg:shrink-0` (linha 195) — abaixo de 1024px todas as etapas viram uma pilha vertical com todos os cartões, o que num funil de 6 etapas × 30 negócios é uma página de dezenas de milhares de pixels. Pior: o `draggable` do cartão continua ativo (linha 320, `podeMover` não olha o viewport) e o texto da coluna vazia diz 'Arraste para cá, ou use "Mover para".' (linha 228) mesmo em toque, onde o drag-and-drop do HTML5 não funciona. A alça `GripVertical` é `hidden ... lg:block` (linha 344), então no tablet não há nem o sinal de que o cartão é arrastável.

> **Correção:** Manter o scroll horizontal com colunas de largura fixa a partir de `md:` (o contêiner já tem `overflow-x-auto`), e trocar a frase da coluna vazia por uma que não prometa arrastar fora de `lg:` — ou detectar ponteiro grosso e mostrar só "Mover para".

**`apps/web/src/app/(app)/crm/contatos/[id]/page.tsx:244`**

IDs duplicados no mesmo documento. `EditContactForm` gera `id="responsavel"` e `id="notas"` (contact-form.tsx:102 e :114), e o `<ActivityPanel>` renderizado logo acima (linha 231) monta `NewActivityForm`, que gera exatamente os mesmos `id="responsavel"` (activity-form.tsx:175) e `id="notas"` (:186) assim que a pessoa clica em "Agendar". Com os dois abertos, clicar no rótulo "Responsável" do formulário de edição foca o seletor da atividade, e o `aria-describedby` de erro (`notas-erro`, gerado por `describedBy`) aponta para um id ambíguo. O mesmo acontece em empresas/[id]/page.tsx:305 (company-form.tsx:202 e :214) e em oportunidades/[id]/page.tsx:170 (deal-form.tsx:218 e :231).

> **Correção:** Dar a `Field` um prefixo de escopo (`<Field escopo="atividade" nome="notas">` → `id="atividade-notas"`) e usar `useId()` nos formulários que podem coexistir, mantendo o `name` do FormData intacto.

**`apps/web/src/app/(app)/crm/oportunidades/page.tsx:113`**

A mesma página tem três larguras diferentes conforme o estado: a ramificação de erro de funis usa `px-4 py-8` sem limite (linha 101), a de "ainda não há funil" usa `mx-auto max-w-3xl` (linha 113), e o quadro carregado usa `px-4 py-8` sem limite (linha 205). Quem cria o primeiro funil vê a página saltar de 768px centralizados para largura cheia. E no estado cheio, a faixa de KPIs é `sm:grid-cols-3` sem teto (board.tsx:119), então em 1920px cada cartão de resumo fica com ~600px de largura para exibir um único valor em `text-xl` — o defeito oposto do resto do CRM.

> **Correção:** Um contêiner só para a página, em todos os estados (largura cheia com `max-w-[1600px]`), e dar um teto à faixa de KPIs ou aumentá-la para 5 colunas com variação vs. período anterior, como no alvo visual.

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:257`**

O componente `Resumo` (linhas 257-284) e o bloco de totais de empresas/[id]/page.tsx (linhas 187-211) são o mesmo cartão de KPI escrito duas vezes, com divergências: `text-xl` contra `text-lg`, `flex items-baseline gap-2` contra `ml-2`, um em `<dl>/<dt>/<dd>` e o outro também em `<dl>` mas com a contagem em `<span>` solto. Nenhum dos dois usa o `<CountUp>` que já existe em components/page/count-up.tsx, nenhum tem variação vs. período anterior nem sparkline, e não há nenhum seletor de período (7/30/90 dias) em lugar nenhum do CRM — a janela é a constante fixa `JANELA_FECHADAS_DIAS = 30` (state.ts:60).

> **Correção:** Extrair um `<Kpi rotulo valor variacao serie>` em components/page/, usá-lo nos dois lugares com `CountUp`, e acrescentar o seletor de período na URL (`?periodo=30`) alimentando `JANELA_FECHADAS_DIAS`.

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:403`**

"Mover para…" é um `<details>/<summary>` inline dentro do cartão. Como não existe primitivo de dropdown/popover no projeto, o menu abre empurrando o conteúdo: o cartão cresce e todos os cartões abaixo dele descem na coluna. Não fecha ao clicar fora, não fecha com Escape, e o fechamento é feito por manipulação direta do DOM (`e.currentTarget.closest('details')?.removeAttribute('open')`, linha 417), que contorna o React. Num funil com 8 etapas, o menu abre uma lista de 7 itens dentro de uma coluna de 288px.

> **Correção:** Criar `components/ui/dropdown-menu` (ou `popover`) com posicionamento em camada, fechamento por Escape/clique fora e retorno de foco, e usá-lo aqui e nos outros pontos que hoje empurram layout.

**`apps/web/src/app/(app)/crm/oportunidades/funis/page.tsx:206`**

A tela de funis renderiza um `<Input>` editável para cada nome de funil e de etapa (`<Renomear>`, editor.tsx:117) com um botão de check ao lado. Uma conta com 3 funis de 6 etapas apresenta 21 caixas de texto empilhadas dentro de `max-w-3xl` — não se lê como uma lista de configuração, lê-se como um formulário gigante, e não há hierarquia entre "o nome do funil" (que vira o mesmo `<Input h-8>` do nome da etapa) e o conteúdo. Cada etapa ainda carrega um `<Select w-36>` de tipo com seu próprio botão de salvar (editor.tsx:163-191), somando dois controles de salvamento por linha.

> **Correção:** Mostrar o nome como texto e abrir o campo só ao clicar em "renomear" (edição sob demanda), diferenciar tipograficamente o título do funil (CardTitle) do nome da etapa, e alargar o contêiner para `max-w-5xl`.

**`apps/web/src/app/(app)/crm/contatos/page.tsx:91`**

Os seletores de relacionamento são `<select>` nativos alimentados com `.limit(500)`: contas em contatos/page.tsx:92, contas e pessoas em oportunidades/page.tsx:165 e :171 e em oportunidades/[id]/page.tsx:92 e :98, e alvos da atividade com `.limit(200)` em atividades/page.tsx:65-84. Numa lista nativa sem busca, escolher entre 500 opções é inviável; e a partir de 501 cadastros a empresa correta simplesmente não está na lista — o formulário aceita salvar com o vínculo errado ou vazio, sem dizer que a lista foi cortada.

> **Correção:** Substituir por um combobox com busca no servidor (digitar filtra via consulta), ou no mínimo um `<input list>` com autocompletar. Enquanto não houver, mostrar aviso quando o número de opções bater no limite.

**`apps/web/src/app/(app)/crm/leads/lead-form.tsx:146`**

O módulo de leads reimplementa três primitivos que já existem: `Campo` (linhas 146-196) é uma cópia de `components/form/field.tsx` com o mesmo `describedBy` escrito inline; `Enviar` (linhas 24-38) é uma cópia de `components/form/submit.tsx`; e o erro do formulário na linha 94 usa `bg-danger/10` enquanto o `FormError` oficial usa `bg-danger-soft` com ícone — duas cores e duas formas para a mesma mensagem. `convert-form.tsx` vai além e escreve as classes dos botões à mão (linhas 29, 84 e 152) em vez de usar `Button`/`buttonVariants`, produzindo um botão "Converter" `h-8 text-xs` que não é nenhuma das variantes de tamanho do design system.

> **Correção:** Trocar `Campo` por `Field`+`describedBy`, `Enviar` por `Submit`, o parágrafo de erro por `FormError`, e os botões de convert-form por `Button size="sm"`. Se `h-8 text-xs` for necessário, virar uma variante `xs` no cva de button.tsx.

**`apps/web/src/app/(app)/crm/contatos/page.tsx:157`**

Estado de erro deixa um resto visual. Quando `lista.error !== null`, a página mostra o `<FormError>` (linha 133) e depois cai no ramo `else` da linha 157, renderizando `<ContactRows pessoas={[]} />` — um `<ul>` com borda arredondada e fundo `surface-raised` e nada dentro, ou seja, uma caixa vazia colada abaixo do erro. Mesmo comportamento em empresas/page.tsx:136-137. O erro também não oferece nenhuma ação (nenhum botão "tentar de novo"), só o texto "Recarregue a página em instantes".

> **Correção:** Quando houver erro, não renderizar a lista: retornar cedo com um estado de erro que tenha ícone, explicação e botão de recarregar, na mesma forma do `EmptyState`.

**`apps/web/src/app/(app)/loading.tsx:12`**

Só existe um `loading.tsx`, no nível de `(app)`, e ele desenha um esqueleto genérico de `max-w-5xl` com um título e três cartões em `md:grid-cols-3`. Nenhuma tela de CRM tem essa forma: contatos e empresas são uma lista de 50 linhas em `max-w-4xl`, o funil é um quadro de colunas em largura cheia, a agenda são faixas. Como a busca de contatos/empresas é um form GET (`SearchBox`), toda busca dispara uma navegação completa e pisca esse esqueleto errado — a página encolhe de 1024px para 896px e volta. Não há `Suspense` nem nenhum skeleton dentro de `crm/` (grep não encontra nenhum).

> **Correção:** Adicionar `loading.tsx` por rota do CRM com o esqueleto da forma real (linhas de lista para contatos/empresas, colunas para o funil), e criar um primitivo `components/ui/skeleton` para não repetir `bg-surface-muted animate-pulse` à mão.

#### Gravidade baixo

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:140`**

O mesmo controle segmentado está escrito três vezes com três aparências. No board (linhas 140-162) são `<button>` com `h-8 rounded-full border px-3 text-xs font-medium`; em atividades/page.tsx (101-120) são `<Link>` com `rounded-full border px-3 py-1 text-xs font-medium` (sem altura fixa, então mais baixo); em oportunidades/page.tsx (216-234) são `<Link>` com `rounded-full border px-3 py-1 text-sm` (fonte maior ainda). Três alturas e dois tamanhos de fonte para o mesmo padrão visual, lado a lado na mesma página no caso de oportunidades.

> **Correção:** Extrair `components/ui/segmented` (ou `tabs`) que aceite `as="link" | "button"`, e usar nos três lugares.

**`apps/web/src/app/(app)/crm/oportunidades/funis/editor.tsx:66`**

A confirmação de exclusão de funil e de etapa usa `window.confirm()`. É a caixa nativa do navegador — tipografia do sistema, sem os tokens do tema, sem o texto de consequência formatado, e bloqueante. É o único ponto do CRM que pede confirmação, e é justamente o que destoa do resto da interface. Não existe primitivo `dialog` em components/ui.

> **Correção:** Criar `components/ui/dialog` (com `<dialog>` nativo, foco preso e Escape) e usar para as duas exclusões, com o nome do funil/etapa e a contagem de itens no corpo.

**`apps/web/src/app/(app)/crm/contatos/[id]/page.tsx:238`**

Nas três páginas de detalhe, o formulário de edição fica sempre aberto dentro de um `<Card>` cujo título alterna entre "Editar cadastro" e "Notas" conforme a permissão (contatos/[id]:240, empresas/[id]:301, oportunidades/[id]:166). Para quem pode editar, o resultado é que a página de detalhe é, em boa parte da sua altura, um formulário: as notas — o único conteúdo textual do registro — só são legíveis como valor de um `<textarea>`, e a página não tem uma versão de leitura. Um card que muda de título conforme o papel também faz com que duas pessoas descrevam a mesma tela por nomes diferentes.

> **Correção:** Mostrar as notas como texto com um botão "Editar" que abre o formulário (no lugar ou em drawer), mantendo o mesmo título de card para os dois papéis.

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:327`**

Ao mover um cartão de coluna, o `<li>` sai de um `<ul>` e entra em outro: o React remonta o elemento, e o `animate-enter` (linha 329) roda de novo com `animationDelay` recalculado a partir do novo índice (linha 327, até 240ms). O movimento otimista, que deveria ser instantâneo, aparece no destino com até 240ms de atraso mais 280ms de fade — o gesto "solta e já está lá" vira meio segundo de espera. O mesmo replay acontece a cada troca do filtro "Sou responsável".

> **Correção:** Aplicar `animate-enter` só na primeira renderização da lista (por exemplo, marcando os ids já vistos), ou trocar o delay por um View Transition na mudança de coluna.

**`apps/web/src/app/(app)/crm/leads/page.tsx:140`**

A tela de leads não oferece nenhum filtro nem busca: as seções são fixas "Em aberto" e "Com desfecho" (linhas 140-143), sem filtrar por status individual, por origem (`source`, que a tabela guarda e a linha mostra em lead-row.tsx:62) nem por responsável. Contatos e empresas têm só busca por texto, sem filtro por responsável ou por "sem e-mail". Atividades tem só "Tudo / Sou responsável" (page.tsx:102-104). Em nenhuma tela do CRM existe ordenação escolhida pelo usuário. Para o alvo visual — sistema denso, operacional — falta a barra de filtros.

> **Correção:** Barra de filtros por searchParams em cada lista (status, origem, responsável, período) e cabeçalho ordenável na tabela, reutilizando `paginaPedida`/`ilikeTerm` de lib/search para manter tudo no endereço.


---

## Painel administrativo (Super Admin) — src/app/(app)/admin/ e src/server/provisioning/

O admin não é um acesso separado: é a 16ª entrada da mesma sidebar do cliente, dentro do grupo de rotas `(app)`, e por isso herda o AppShell inteiro — logo Tivexy no header de largura total, seletor de empresa, sino de avisos e a badge "Em construção" — sem nenhuma aba própria e sem Sair de admin. As três telas que existem (lista, criação, detalhe) são competentes em conteúdo e honestas no texto, mas ocupam no máximo `max-w-5xl`, não têm nenhum número agregado, nenhuma busca, nenhum filtro e nenhuma tabela; a lista é um `<ul>` de cartões que descarta `created_at` já lido e afirma um total que a própria query trunca em 100. Há dois achados de funcionalidade fingida: o endereço `{slug}.tivexy.com.br` aparece em três telas como se resolvesse, enquanto o domínio é BLOCKED — EXTERNAL e a produção está em `tivexy-web.vercel.app`; e o gerador de link de acesso — hoje o único caminho de entrega do convite, com SMTP bloqueado — só existe na tela efêmera de sucesso da criação, sumindo para sempre na primeira navegação. Respondendo direto: o provisionamento NÃO permite escolher módulos (vêm de `blueprint.modules` ∩ `plan_modules`), NÃO permite escolher plano (vem de `blueprint.plan`, apesar do contrato dizer o contrário) e NÃO tem nada de marca — não há coluna de cor, logo ou tema em `tenants`, não há chave de marca no catálogo de configurações e não há bucket de storage em migração nenhuma.

### O que já está bom e deve ser preservado

- A honestidade textual é exemplar e deve ser o padrão do resto do produto: a tela de sucesso da criação diz "Nenhum e-mail foi enviado" em vez de fingir o convite (clientes/novo/new-client-form.tsx:333-338), o desfazer diz "cancelado" e não "apagado" porque é o que o banco fez (admin/recovery.ts:154-158), e a prévia avisa quantas sementes ficaram pendentes por as tabelas não existirem (new-client-form.tsx:250-257).
- A prévia do provisionamento roda a MESMA função `planProvisioning` que o servidor vai executar (new-client-form.tsx:60-69), então não há como a tela prometer algo diferente do que acontece. É o antídoto estrutural contra funcionalidade fingida e vale replicar em qualquer tela nova de configuração.
- Autorização repetida dentro de cada Server Action (`requireAccess('/admin')` em actions.ts:68, recovery.ts:86 e 136, access-link.ts:31, clientes/[id]/actions.ts:32) em vez de confiar no guard do layout, com as funções de banco conferindo `is_super_admin()` por conta própria e gravando auditoria na mesma transação.
- O caminho de recuperação existe de verdade: um provisionamento que falha tem retomar e desfazer lado a lado, nenhum é o padrão, e o botão Retomar se desabilita com título explicativo quando a execução não guardou a entrada (failed-runs.tsx:90-95). Fluxo com caminho infeliz desenhado é raro e deve ser preservado.
- `SITUACAO`, `EXECUCAO`, `ETAPA` e `NOME_DA_ETAPA` em lib/admin/labels.ts são `Record` sobre os tipos do Core: um estado novo no enum não compila até ganhar rótulo em português. Generalizar esse padrão para os outros módulos elimina a classe inteira de "código de banco vazando na tela".
- A leitura da lista passa pelo RLS com `supabaseServer()` em vez da chave de serviço (admin/page.tsx:22-27), de propósito, para que a política seja exercitada e não contornada — se a política quebrar, a tela fica vazia em vez de vazar.
- O empty state da lista de clientes (admin/page.tsx:119-139) já tem ícone em círculo, título, frase explicativa e botão de ação: é exatamente a forma que o dono pediu. Serve de modelo para o `EmptyState` compartilhado que falta.

### Achados

#### Gravidade alto

**`apps/web/src/config/navigation.ts:158`**

O admin é o 16º item da sidebar do cliente, dentro do grupo `Administração`, e por isso vive dentro de `(app)` — herda o AppShell inteiro: logo Tivexy no header de largura total (app-shell.tsx:92), badge "Em construção" (app-shell.tsx:94), sino de avisos do tenant (app-shell.tsx:99) e seletor de empresa no UserMenu (app-shell.tsx:104). O `admin/layout.tsx` (linhas 13-16) só chama `requireAccess('/admin')` e devolve `children`: zero cromo próprio, zero abas, zero Sair de admin. O Super Admin dentro de /admin continua vendo o menu operacional de uma empresa cliente que não é dele.

> **Correção:** Tirar o admin de `(app)`: criar o grupo de rotas `(admin)` com `app/(admin)/adminpanel/layout.tsx` próprio — sidebar/topbar de plataforma com as abas Clientes, Usuários, Domínios, Ramos, Anúncios, Configurações, logo DENTRO da coluna da sidebar, e botão Sair usando a mesma Server Action `sair` de `app/(auth)/actions`. Mover `/admin` → `/adminpanel` em `config/routes.ts:55` e remover o grupo `Administração` de `navigation.ts:158-162`. O guard de layout continua o mesmo (`requireAccess`), então a proteção não muda.

**`apps/web/src/app/(app)/admin/clientes/novo/new-client-form.tsx:292`**

O gerador de link de acesso — hoje o ÚNICO caminho de entrega do convite, porque o SMTP é o bloqueio externo nº 1 (docs/PROJECT_STATE.md, tabela de dependências) — só existe dentro do componente `Sucesso`, que substitui o formulário inteiro (linha 73) e vive em `useActionState`, ou seja, em memória. Um F5, um clique em "Voltar para a lista" ou qualquer navegação e o link some para sempre: não há como gerá-lo de novo em `/admin/clientes/[id]`. O próprio docstring de `access-link.ts` (linhas 16-18) diz que esta tela deveria ser o caminho de exceção — "o cliente não recebeu, me dá o link de novo" — e esse caminho não existe.

> **Correção:** Adicionar um card "Acesso do administrador" em `admin/clientes/[id]/page.tsx`, listando os `tenant_users` do tenant (nome, e-mail, papel, situação do vínculo) com um botão "Gerar link de acesso" por pessoa, reusando `gerarLinkDeAcesso` de `admin/access-link.ts`. Isso resolve de uma vez o caminho de exceção e a aba Usuários que o dono pediu.

**`apps/web/src/app/(app)/admin/failed-runs.tsx:103`**

"Desfazer" é a ação mais destrutiva do painel — `compensateProvisioning` apaga a identidade no Auth (server/provisioning/execute.ts:532) e marca o tenant como `cancelled` (execute.ts:826), estado do qual a UI declara não haver volta ("Cancelada: não volta por aqui.", clientes/[id]/forms.tsx:172). Ela dispara com um clique só: sem `window.confirm`, sem digitar o nome, sem estado pendente. Na mesma base, trocar de plano — reversível — pede confirmação (clientes/[id]/forms.tsx:216) e suspender também (forms.tsx:112-118).

> **Correção:** Exigir confirmação proporcional ao dano: um diálogo que mostre o nome do cliente e exija digitá-lo, ou no mínimo o mesmo `onSubmit` com `window.confirm` já usado em forms.tsx:112. Trocar os dois `<button>` crus por `Submit` de `components/form/submit.tsx`, que já dá `disabled` + spinner via `useFormStatus` e impede o duplo clique.

**`apps/web/src/app/(app)/admin/page.tsx:155`**

Funcionalidade fingida: `{cliente.slug}.tivexy.com.br` é apresentado como o endereço do cliente em três telas (aqui; clientes/novo/new-client-form.tsx:136 e :317; clientes/[id]/page.tsx:209 e :279 — esta última afirmando "O endereço (x.tivexy.com.br) não muda: link já enviado quebraria"). O domínio `tivexy.com.br` + DNS está na tabela de dependências externas de docs/PROJECT_STATE.md como pendente, e a produção roda em `tivexy-web.vercel.app` (PROJECT_STATE.md, seção 2.1). Nenhum desses endereços resolve hoje, e a string está hardcoded — não vem de variável de ambiente.

> **Correção:** Trocar o literal por um helper que leia o host da plataforma de env (`NEXT_PUBLIC_PLATFORM_HOST`) e, enquanto o wildcard não existir, rotular explicitamente: `acme.tivexy.com.br` com badge `PENDENTE — DNS` e uma linha dizendo que o acesso hoje é por `tivexy-web.vercel.app` com a empresa escolhida no menu. O slug continua sendo o identificador real; o que não pode é a tela afirmar um endereço navegável que não é.

**`apps/web/src/app/(app)/admin/page.tsx:99`**

O cabeçalho afirma "Todas as empresas da plataforma. {clientes.length} no total." enquanto a query da linha 77 tem `.limit(100)`. Com 140 clientes a tela diz "100 no total" e omite 40 sem nenhum sinal. Não há busca, filtro por situação, ordenação nem paginação para alcançar o que ficou de fora. O mesmo padrão está em `falhasAbertas()` (linha 58, `limit 20`) e em clientes/[id]/page.tsx (execuções `limit(20)` na linha 86, auditoria `limit(50)` na linha 93, esta última sob o texto "da auditoria, que não se apaga").

> **Correção:** Usar `select('...', { count: 'exact' })` e mostrar o número real, com o texto "mostrando 100 de N" quando truncar. Adicionar busca por nome/slug, filtro por situação e paginação por cursor em `created_at`. Nas listas do detalhe, mostrar "20 execuções mais recentes" / "50 registros mais recentes" com um "ver mais".

**`apps/web/src/app/(app)/admin/failed-runs.tsx:41`**

`if (falhas.length === 0) return null;` está depois dos hooks mas antes do bloco que renderiza `erro` e `aviso` (linhas 60-69). Quando "Retomar" dá certo, `revalidatePath('/admin')` faz `falhas` chegar vazio, o componente devolve `null` e a mensagem `"${nome} foi provisionado."` (recovery.ts:131) nunca aparece. O Super Admin clica, a lista some e ele não recebe nenhuma confirmação — exatamente o mesmo para o "Desfeito. O cliente ficou cancelado..." (recovery.ts:158).

> **Correção:** Mover a guarda para depois das mensagens: renderizar o card quando `falhas.length > 0 || erro !== null || aviso !== null`, e fechar o bloco de falhas separadamente. Ou promover erro/aviso a um toast global fora do componente que desmonta.

#### Gravidade média

**`apps/web/src/app/(app)/admin/page.tsx:94`**

A lista de clientes é a tela mais larga do admin e ainda assim é `max-w-5xl` (1024px) — 53% de um monitor de 1920px. `clientes/novo/page.tsx:53` e `clientes/[id]/page.tsx:196` usam `max-w-4xl` (896px), 46%. Um painel de plataforma é exatamente o tipo de tela que precisa de largura: é onde está a lista longa, a tabela, o histórico e os logs. As referências do dono (NIT, Ribeiro Vale) são densas e full-bleed.

> **Correção:** No layout do `(admin)`, abandonar o `mx-auto max-w-*` em favor de um container fluido com gutter fixo (`px-6 xl:px-8`) e um teto alto só para leitura corrida (`2xl:max-w-[1600px]`). A lista de clientes deve poder usar a largura toda.

**`apps/web/src/app/(app)/admin/page.tsx:93`**

Nenhum número agregado na tela inicial do admin — nem uma faixa de KPIs, nem sparkline, nem comparação com período anterior, que é justamente o que o dono mostrou como alvo. Os dados já estão em memória: `clientes[].status` responde ativos / suspensos / em provisionamento / cancelados sem nenhuma query nova, e `falhas.length` já responde execuções paradas. Hoje a página começa direto na lista.

> **Correção:** Faixa de 4-5 KPIs no topo (Clientes ativos, Em provisionamento, Suspensos, Execuções paradas, Criados nos últimos 30 dias), com rótulo + número forte + variação. Os quatro primeiros saem do array que já existe; o de 30 dias sai de `created_at`, que a query já pede (linha 75) e a tela hoje descarta.

**`apps/web/src/app/(app)/admin/page.tsx:141`**

A lista de clientes é um `<ul>` de cartões empilhados com 4 informações (nome, slug, plano, situação) e nada mais. `created_at` é lido na query (linha 75) e na interface `Linha` (linha 35) e nunca renderizado. O nicho (blueprint) do cliente não aparece em lugar nenhum da lista — só dentro do histórico de provisionamento do detalhe. Não há como responder "quais clientes de clínica eu tenho?" ou "quem entrou este mês?" sem abrir um por um.

> **Correção:** Trocar por uma tabela densa com colunas Cliente/endereço, Nicho, Plano, Situação, Módulos ligados, Criado em, Último acesso — cabeçalho fixo, linhas com zebra sutil, clique na linha abre o detalhe. Isso exige criar o primitivo `table` em `components/ui/`, que hoje não existe.

**`apps/web/src/app/(app)/admin/clientes/novo/new-client-form.tsx:88`**

O provisionamento NÃO permite escolher módulos. O único controle é o nicho: `planProvisioning` deriva os módulos de `blueprint.modules` (packages/core/src/provisioning-plan.ts:185-187) e apenas valida que estão dentro de `plan_modules`. O plano também não é escolhido — vem de `blueprint.plan` (provisioning-plan.ts:180) —, apesar de o contrato em packages/core/src/blueprint.ts:87-88 dizer literalmente "O plano sugerido. O Super Admin ainda pode escolher outro". Depois de criado, o detalhe do cliente mostra os módulos como badges de leitura (clientes/[id]/page.tsx:255-265) e só permite trocar o plano inteiro: não há liga/desliga por módulo, embora o banco suporte (`tenant_modules` é a verdade sobre acesso, 20260919020100_core_tenancy.sql:86-99) e o comentário da migração cite cortesia/piloto/migração como casos reais.

> **Correção:** Na criação: adicionar `<Select>` de plano (pré-selecionado com `blueprint.plan`) e uma lista de checkboxes de módulos pré-marcada com `blueprint.modules`, ambos passando por `planProvisioning` — a prévia já recalcula em tempo real, então o custo é baixo. No detalhe: um switch por módulo (o primitivo `switch` já existe em components/ui) apoiado numa RPC nova `admin_set_tenant_module(p_tenant_id, p_module_code, p_enabled, p_reason)` com `is_super_admin()` e auditoria, no mesmo molde de `admin_change_plan` (20260925140000_admin_tenant_management.sql:217).

**`supabase/migrations/20260919020100_core_tenancy.sql:60`**

NÃO existe nenhuma coluna de marca no banco. `public.tenants` tem id, slug, name, legal_name, document, status, plan_id, settings, created_at, updated_at — nada de cor, logo, favicon ou tema. Uma busca por logo/brand/color/theme/favicon em supabase/migrations não retorna nenhuma definição de coluna, e não há bucket de storage em migração nenhuma. O catálogo de configurações de tenant (packages/core/src/settings.ts:49-90) tem exatamente 5 chaves — moeda, fuso, documento obrigatório no CRM, cliente obrigatório na venda, baixa de estoque — nenhuma de aparência. E o AppShell renderiza o `<Logo>` fixo da Tivexy (components/shell/app-shell.tsx:92 + components/brand/logo.tsx), que lê `/brand/simbolo.svg` estático: todo cliente vê a marca Tivexy, não a dele.

> **Correção:** Decidir onde a marca mora antes de desenhar a tela. Caminho de menor atrito: chaves novas no catálogo (`core.brand.primary`, `core.brand.logo_url`) gravadas em `tenants.settings`, que já é jsonb e já tem caminho de escrita auditado (20260925050000_tenant_settings_write.sql). Caminho mais correto: colunas dedicadas `brand_primary text`, `brand_logo_path text` em `tenants`, mais um bucket `tenant-branding` com RLS por tenant para o upload. Nos dois casos entra como etapa nova do provisionamento (uma aba "Marca" no formulário de criação e um card "Marca" no detalhe) e o `<Logo>` do AppShell passa a receber o logo do tenant com fallback para o da Tivexy.

**`apps/web/src/app/(app)/admin/clientes/novo/new-client-form.tsx:177`**

"Criar cliente" é a ação mais lenta do sistema — cria tenant, liga módulos, cria papéis, chama a Auth Admin API e semeia — e usa `<Button type="submit">` cru, sem estado pendente. Quem clica não recebe nenhum sinal por vários segundos e nada impede o segundo clique (só a chave de idempotência salva no servidor). Na mesma pasta, `clientes/[id]/forms.tsx` usa `Submit` com `pendente="Suspendendo…"` (linha 143) e `pendente="Trocando…"` (linha 277) para ações muito mais rápidas.

> **Correção:** Trocar por `<Submit size="lg" pendente="Provisionando…">` de components/form/submit.tsx. Como o provisionamento tem etapas nomeadas (`NOME_DA_ETAPA` em lib/admin/labels.ts:43-51), vale ir além e mostrar a lista de etapas com o estado de cada uma enquanto roda, que é a informação que a prévia já promete.

**`apps/web/src/app/(app)/admin/clientes/novo/new-client-form.tsx:86`**

As duas telas de formulário do admin usam dois sistemas de formulário diferentes. Aqui: `<Label>` solto + `<select>` cru com as classes copiadas à mão (linha 93 repete `h-9.5 w-full rounded-md border border-line-field bg-surface` e perde `transition-colors`, `disabled:` e `aria-invalid:` do primitivo real) + um componente local `Problema` (linha 187). Em `clientes/[id]/forms.tsx`: `Field` + `describedBy` + `Select` + `FormError`/`FormSuccess` + `Submit`. O mesmo painel tem dois vocabulários visuais de campo, dois tratamentos de erro e dois de `aria-describedby`.

> **Correção:** Migrar `new-client-form.tsx` para `Field`/`Select`/`Submit` de components/form e components/ui/input. É troca mecânica e elimina a cópia de classes da linha 93, que já divergiu do primitivo.

**`apps/web/src/app/(app)/admin/failed-runs.tsx:95`**

Botões escritos à mão com string de classe inline em vez dos primitivos: `inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-xs` aqui (linha 96) e de novo na linha 107, e mais uma vez em clientes/novo/new-client-form.tsx:345. Nenhum deles passa por `Button`/`buttonVariants`, então ganham uma altura (h-8) e um tamanho de texto (text-xs) que não existem nas variantes do primitivo — três botões de admin com três aparências próprias.

> **Correção:** Usar `Button` com as variantes existentes, ou, se faltar um tamanho `xs`, adicioná-lo ao `cva` de components/ui/button.tsx uma vez e consumir nos três lugares.

**`apps/web/src/app/(app)/admin/clientes/[id]/history.tsx:76`**

Empty states inconsistentes dentro do mesmo painel. A lista de clientes tem empty state completo — ícone em círculo, título, frase explicativa e botão de ação (admin/page.tsx:119-139), que é exatamente o alvo do dono. Já `ProvisioningHistory` (linha 77) e `PlatformLog` (linha 152) devolvem um `<p className="text-sm text-content-muted">` seco, sem ícone, sem hierarquia e sem ação.

> **Correção:** Extrair o empty state de admin/page.tsx:120-139 para um `<EmptyState icon title description action>` em components/ui e aplicar nos dois lugares. O card de execuções pode oferecer ação real ("Ver o provisionamento na lista de clientes").

**`apps/web/src/app/(app)/admin/clientes/[id]/forms.tsx:112`**

Confirmação de decisão de plataforma via `window.confirm` — aqui para suspender (linha 114) e na linha 216 para trocar de plano. É o diálogo do navegador: fora do tema, fora da tipografia, sem foco gerenciado, sem poder mostrar o resumo do que vai mudar (a prévia de módulos que a própria tela calculou nas linhas 237-257 não cabe num confirm) e bloqueante para a thread.

> **Correção:** Criar o primitivo `dialog` em components/ui (hoje inexistente, apoiado em `<dialog>` nativo) e usá-lo nos três pontos de confirmação do admin — suspender, trocar plano e o desfazer de failed-runs.tsx. O diálogo de troca de plano deve mostrar a lista de módulos que liga e desliga.

**`apps/web/src/app/(app)/admin/layout.tsx:13`**

Das seis abas que o dono pediu, só existe Clientes. Não há Usuários (não há nenhuma listagem global de contas nem por tenant no admin), Domínios (o slug é fixo e imutável; não há tabela de domínio customizado em migração nenhuma), Ramos (os blueprints são três JSONs importados um a um em packages/core/src/blueprint-registry.ts:17-19 — adicionar um nicho é commit e deploy, não dado), Anúncios (não existe nada) nem Configurações de plataforma (não existe; `/configuracoes` é do tenant).

> **Correção:** Priorizar por impacto real: Usuários primeiro (destrava o reenvio de link de acesso, que é o bloqueio operacional de hoje), depois Ramos — que exige a decisão de arquitetura de mover blueprints de JSON no pacote para tabela no banco, e essa decisão pertence a docs/16-DECISIONS/ antes de virar tela. Domínios e Anúncios devem nascer marcados `BLOCKED — EXTERNAL` / `PLACEHOLDER` enquanto não houver DNS e não houver o que anunciar.

#### Gravidade baixo

**`apps/web/src/app/(app)/admin/clientes/[id]/page.tsx:33`**

`export const metadata: Metadata = { title: 'Cliente' };` é estático: com três clientes abertos em abas, as três dizem "Cliente". O nome já é lido na própria página (linha 206).

> **Correção:** Trocar por `generateMetadata` lendo o nome do tenant, como o restante da app faz com `sectionTitle`.

**`apps/web/src/app/(app)/loading.tsx:23`**

O admin não tem `loading.tsx` próprio e cai no esqueleto compartilhado de `(app)`, que desenha `grid md:grid-cols-3` com três cartões de texto — uma forma que nenhuma das três telas do admin tem. O esqueleto promete um layout e entrega outro, que é o defeito que o próprio comentário do arquivo (linhas 3-5) diz querer evitar.

> **Correção:** Um `loading.tsx` dentro do grupo do admin com a forma certa: faixa de KPIs + linhas de tabela. Se a faixa de KPIs for adicionada à lista, o esqueleto passa a ser honesto nos dois lugares.

**`apps/web/src/app/(app)/admin/clientes/[id]/history.tsx:91`**

O histórico de provisionamento usa `<details>/<summary>` cru (linhas 91-104): sem chevron, sem indicação visual de que abre, e sem transição — o único sinal de afordância é `cursor-pointer`. Não há primitivo de accordion em components/ui, então cada tela que precisar disso vai reinventar.

> **Correção:** Manter `<details>` como base (é o certo por acessibilidade e por funcionar sem JS) e envolvê-lo num primitivo `disclosure` em components/ui com chevron rotacionando via `[&[open]>summary_svg]:rotate-90` e `interpolate-size`/`grid-template-rows` para a abertura suave.


---

## Densidade, largura e responsividade — apps/web (Next.js 16 App Router, Tailwind v4)

O dono está certo, e o defeito é mecânico: a largura não é uma decisão neste código, é um literal copiado. A string `mx-auto max-w-{2xl|3xl|4xl|5xl} px-4 py-8 sm:px-6 lg:px-8` aparece 35 vezes em 4 valores diferentes, sem nenhum componente que a possua — e a única tela sem teto (o quadro do funil) é justamente a que parece um sistema. Num monitor de 1920px a sidebar fixa de 256px deixa 1664px para a página, e as 22 telas em max-w-4xl usam 896 desses (46% do espaço útil vira branco); as 7 em max-w-3xl desperdiçam 54%. Some-se a isso zero ocorrências de `xl:` e `2xl:` em todo o app — o layout congela em 1024px e nunca mais muda — e listas de 50 registros com linhas de 76 a 97px: cabem 8 produtos na tela de 1080p, enquanto o resto da largura está vazio ao lado.

### O que já está bom e deve ser preservado

- O quadro do funil (crm/oportunidades/page.tsx:205 + board.tsx:172) é a única tela com a arquitetura de largura certa: sem max-w, com `-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8` para a rolagem horizontal sangrar até a borda sem quebrar o padding. É o padrão a generalizar, não a exceção a corrigir.
- Toda tela é `min-w-0` onde precisa ser: o `<main>` (app-shell.tsx:148), as colunas de flex, os Select. Por isso nada estoura horizontalmente em 375px. `break-words` está nos lugares certos — PageHeader, Facts, valores de KPI — e `truncate` nas linhas de lista. Isso é trabalho já feito e não deve ser desfeito ao migrar para tabela.
- Os dois `<table>` que existem (painel/sales-chart.tsx:159 e erp/financeiro/cashflow-chart.tsx:258) estão dentro de `overflow-x-auto`, e o do fluxo de caixa tem `min-w-[32rem]` — a receita correta para tabela em 375px. É exatamente o que o primitivo de tabela que falta deve encapsular.
- A gaveta mobile faz quase tudo certo: trava o scroll do body, fecha no Escape, fecha ao trocar de rota (inclusive no voltar do navegador, resolvido durante a renderização em vez de com effect — app-shell.tsx:45-51), foca o botão de fechar e tem `max-w-[85vw]`. Falta só o focus trap.
- Os gráficos já trazem duas larguras de desenho em vez de uma escalada, com o comentário explicando por quê ('640 unidades num celular dariam rótulos minúsculos'). O raciocínio está certo; falta apenas a terceira largura para xl e desacoplar a altura.
- A densidade da sidebar está boa: itens `px-2.5 py-2 text-sm` (36px), `gap-0.5` dentro do grupo, `gap-5` entre grupos. É a única parte do app com densidade de sistema de trabalho — serve de calibre para o resto.
- Os primitivos de campo já são compactos e coerentes: Input/Select em `h-9.5` (38px) e Button `md` em `h-9.5`, `sm` em `h-8`. O problema de densidade não está nos controles, está no espaçamento entre blocos e na altura das linhas de lista.
- Nenhum achado de dado inventado nesta dimensão: as telas que não têm funcionalidade dizem isso na cara (integracoes/page.tsx:71 — 'Nenhuma conexão existe ainda — por isso não há botão de conectar'; avisos/page.tsx:103 — 'não há aviso em tempo real'; automacoes/page.tsx:153 — 'sem e-mail, WhatsApp ou webhook'). A regra do repositório está sendo cumprida.

### Achados

#### Gravidade alto

**`apps/web/src/app/(app)/erp/produtos/page.tsx:145`**

A largura da página não existe como decisão: é um literal copiado. A string exata `mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8` aparece 22 vezes; a mesma com max-w-3xl, 7 vezes; com max-w-5xl, 5; com max-w-2xl, 1. São 35 cópias, 4 valores, zero componente dono — não há PageContainer em src/components/page/. Por isso o mesmo tipo de conteúdo tem largura diferente conforme quem escreveu a tela: /erp/produtos/categorias é lista a 672px, /avisos é lista a 768px, /crm/contatos é lista a 896px, /admin é lista a 1024px. E a única tela sem teto nenhum — o quadro do funil, crm/oportunidades/page.tsx:205 — é justamente a que ocupa a tela.

> **Correção:** Criar src/components/page/page-shell.tsx com um único componente `<Page variant=…>` e proibir o literal (regra de lint ou revisão). Arquitetura de largura por TIPO de tela, não largura única:

(A) LISTAGEM OPERACIONAL — contatos, empresas, leads, produtos, vendas, estoque, financeiro, equipe, avisos, atividades, admin/clientes, categorias, formas de pagamento. Sem max-w. Herda o teto da casca. A lista vira tabela de verdade com colunas que só existem a partir de xl.

(B) QUADRO / CANVAS — crm/oportunidades. Sem max-w, scroll horizontal. Já está certo: manter e usar como referência.

(C) PAINEL — /painel. Sem max-w. Grade explícita: faixa de KPIs `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`, depois `xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` — gráfico grande à esquerda, painéis 'próximas' e 'atividades recentes' à direita. É literalmente o mockup que o dono aprovou.

(D) DETALHE DE REGISTRO — contatos/[id], empresas/[id], oportunidades/[id], produtos/[id], vendas/[id]. `max-w-[1400px]` e `xl:grid-cols-[18rem_minmax(0,1fr)_20rem]`: fatos à esquerda, linha do tempo no meio, ações à direita. Nunca 896px.

(E) FORMULÁRIO / AJUSTE — conta, configurações, novo cliente, funis. Medida de leitura estreita, mas UM valor só: `max-w-3xl` (768px). Matar max-w-2xl, max-w-4xl e max-w-5xl para formulário.

(F) INTERSTICIAL — acesso-negado, preparando, onboarding, convite, error, not-found. `max-w-lg` centrado. Já é consistente: manter.

A casca ganha o teto global: `main` com `mx-auto w-full max-w-[1680px]`, para que um ultrawide de 2560px não estique a tabela até virar ilegível.

**`apps/web/src/app/globals.css`**

Não existe UMA ocorrência de `xl:` ou `2xl:` em todo o apps/web/src (verificado por grep: 0 e 0). `md:` aparece duas vezes, uma delas no botão. Todo o sistema responsivo é sm(640) e lg(1024). Consequência: de 1024px até 3840px o layout é rigorosamente o mesmo desenho. O monitor do dono não muda nada em relação a um notebook pequeno — o app simplesmente para de se adaptar onde a maioria das telas de trabalho começa.

> **Correção:** Adotar xl(1280) e 2xl(1536) como os breakpoints onde a informação aumenta, não só o branco: em xl as listagens ganham colunas (categoria, SKU, margem, responsável saem do subtítulo e viram coluna), o detalhe vira três colunas, o painel vira 5 KPIs + gráfico/painéis lado a lado. Em 2xl a sidebar pode ir a w-72 e o padding a px-10. Fixar isso no @theme de globals.css junto com os tokens de cor, para o breakpoint ser tão oficial quanto a paleta.

**`apps/web/src/app/(app)/erp/produtos/product-rows.tsx:66`**

Nenhuma listagem é tabela. São todas `<ul>` de `<li>` com `p-4` e três a quatro linhas de texto empilhadas dentro de uma coluna de 832px. Medindo: linha de produto = 16px de padding em cima + 64px de texto (nome 24 + categoria/SKU 20 + estoque 20) + 16 embaixo ≈ 97px. Contato = 76px (contact-rows.tsx:26). Venda = 92px (sale-rows.tsx:139). Lançamento financeiro = 100 a 140px (entry-rows.tsx:46). E POR_PAGINA é 50 (erp/produtos/state.ts:32, e o mesmo 50 em contatos, empresas, estoque, financeiro e vendas). Cinquenta produtos a 97px são 4.850px de rolagem — quase cinco alturas de tela — numa coluna que usa 43% da largura do monitor. Na prática, com py-8 + PageHeader + bloco de filtros consumindo ~236px de topo, sobram 788px: cabem 8 produtos por tela em 1920x1080.

> **Correção:** Trocar as listas por `<table>` com `<td>` em `px-3 py-2` e altura de linha alvo de 44px (confortável) / 36px (compacto). O que hoje é subtítulo empilhado — categoria, SKU, saldo, margem — vira coluna em xl. Meta: 15 a 18 registros visíveis em 1080p, contra os 8 de hoje. Como não existe primitivo de tabela em src/components/ui, esse é o primeiro componente a construir.

**`apps/web/src/app/(app)/painel/sales-chart.tsx:27`**

Os gráficos travam o alargamento da página. O SVG é `viewBox="0 0 640 200"` com `className="h-auto w-full"` e preserveAspectRatio padrão — escala uniforme. Hoje, dentro de 832px, o gráfico sai com 260px de altura. Se a página for a 1600px, o mesmo SVG vira 500px de altura com rótulos de eixo em 27px. Pior: só existem duas larguras de desenho, 360 e 640, e o corte entre elas é `sm:` (640px). De 640px a 3840px o desenho é sempre o de 640 unidades. O gráfico grande com tooltip que o dono pediu não é alcançável esticando o que existe. Mesmo defeito em apps/web/src/app/(app)/erp/financeiro/cashflow-chart.tsx:32-45 (ALTURA=240, larguras 360/640).

> **Correção:** Desacoplar altura de largura: `preserveAspectRatio="none"` só na moldura, com eixos e textos posicionados em unidades absolutas, ou (mais simples e mais correto) medir o contêiner e desenhar com largura real. Fixar a altura em CSS (`h-64 xl:h-80`) e deixar a largura livre. Acrescentar uma terceira largura de desenho para xl. Sem isso, alargar a página piora o painel em vez de melhorar.

**`apps/web/src/app/(app)/crm/contatos/[id]/page.tsx:187`**

As cinco telas de detalhe usam `grid gap-6 lg:grid-cols-[1fr_18rem]` dentro de max-w-4xl. Fazendo a conta: 896 de teto − 64 de padding = 832 de tinta; menos 288 (18rem) da coluna lateral e 24 de gap, sobram 520px para a coluna principal. É onde ficam o painel de atividades, a lista de negócios e o formulário de edição — 520px, menos que uma janela de navegador estreita, num monitor de 1920. As mesmas linhas em crm/empresas/[id]/page.tsx:214, crm/oportunidades/[id]/page.tsx:156, erp/produtos/[id]/page.tsx:231, erp/vendas/[id]/receipt.tsx:105. A coluna lateral é fixa em 18rem e nunca cresce.

> **Correção:** Aplicar o tipo (D) da arquitetura: `max-w-[1400px]` e `xl:grid-cols-[18rem_minmax(0,1fr)_20rem]`. A coluna do meio passa de 520px para ~760px e ganha uma terceira coluna para ações e histórico, que hoje disputam espaço com os fatos.

**`apps/web/src/app/(app)/painel/dashboard.tsx:200`**

O painel é uma pilha vertical de Cards em max-w-5xl (`flex flex-col gap-6`, linha 219). Não existe faixa de KPIs no topo: os indicadores estão dentro de cada Card de seção, em três grades diferentes — `grid-cols-2 sm:grid-cols-3` na linha 232, `grid-cols-2 lg:grid-cols-4` nas linhas 286 e 322, `grid-cols-2 sm:grid-cols-3` na 401. Nunca 5 lado a lado. Não há sparkline por KPI, não há comparação com o período anterior ao lado do número (a comparação existe em texto corrido, `variacaoEmTexto`, linha 158), e não há painel lateral de 'próximas' nem de 'atividades recentes' — esses dados moram em /crm/atividades, outra rota. Em 1920px o painel ocupa 1024 de 1664px: 38% de branco à direita de uma coluna de cards empilhados.

> **Correção:** Reescrever como grade, não como pilha: faixa única de 5 KPIs no topo (rótulo, número forte, variação vs período anterior, sparkline), depois `xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` com o gráfico grande à esquerda e, à direita, os painéis 'próximas' (vindo de crm/atividades) e 'atividades recentes'. Adicionar o seletor 7/30/90 dias no cabeçalho — hoje a janela é fixa em 14 dias, cravada em lib/painel/dashboard.

**`apps/web/src/components/shell/app-shell.tsx:75`**

A casca não é a do mockup aprovado. O `<header>` é irmão do `<div className="flex flex-1">` que contém o aside: ele atravessa os 1920px inteiros por cima da sidebar, com o logo dentro dele (linha 88). O mockup pede o contrário — logo DENTRO da coluna da sidebar, header começando depois dela. Além disso o header tem apenas logo, um Badge 'Em construção', sino, tema e menu de conta: não há busca global nem atalho Ctrl+K em lugar nenhum do app (grep por 'Ctrl' e 'cmdk' não retorna nada). A sidebar é `w-64` fixa (linha 110), sem variação em xl ou 2xl e sem modo recolhido.

> **Correção:** Inverter a estrutura: `<div class="flex">` no topo, com `<aside>` contendo o logo no seu próprio cabeçalho de 56px, e um `<header>` dentro da coluna de conteúdo. Colocar a busca global com Ctrl+K nesse header — ela precisa de um primitivo de dialog/command que ainda não existe em src/components/ui.

#### Gravidade média

**`apps/web/src/app/(app)/crm/oportunidades/page.tsx:205`**

Incoerência que prova que o teto é arbitrário: na mesma rota, o quadro renderiza em `px-4 py-8 sm:px-6 lg:px-8` sem max-w nenhum (linha 205), mas o estado vazio da mesma tela renderiza em `mx-auto max-w-3xl` (linha 113) e o estado de erro em `px-4 py-8` sem mx-auto (linha 101). Trocar de estado dentro da mesma página muda a largura do conteúdo. Como o `<main>` é `flex-1` sem mx-auto, o estado de erro fica colado à esquerda enquanto o vazio fica centrado.

> **Correção:** Os três estados da mesma rota têm que usar o mesmo container. Resolvido de graça pelo `<Page variant="board">` proposto no primeiro achado.

**`apps/web/src/components/shell/app-shell.tsx:110`**

Em 768px (iPad retrato, que é exatamente o aparelho de balcão) o app entrega a casca de celular: o `<aside>` é `hidden … lg:block`, então some, e a navegação inteira fica atrás do botão de hambúrguer, com 768px de tela disponíveis. No mesmo breakpoint os detalhes colapsam para uma coluna (lg:grid-cols) e o quadro do funil deixa de ser quadro — board.tsx:173 é `flex flex-col gap-4 lg:flex-row`, ou seja, de 768 a 1023px as etapas viram uma pilha vertical de blocos de largura total e o `overflow-x-auto` do pai não serve para nada.

> **Correção:** Descer o ponto de corte da sidebar para md(768) com largura reduzida (w-56 ou modo só-ícones), e descer o `lg:flex-row` do quadro para md — um funil de 3 a 5 etapas cabe em 768px com colunas de 240px e rolagem horizontal, que é o comportamento certo.

**`apps/web/src/app/(app)/avisos/page.tsx:66`**

Quatro larguras para o mesmo tipo de conteúdo. 'Lista de registros paginada' aparece em max-w-2xl (erp/produtos/categorias/page.tsx:54 — 672px), max-w-3xl (avisos/page.tsx:66 e erp/vendas/formas/page.tsx:56 — 768px), max-w-4xl (crm/contatos/page.tsx:108, erp/produtos/page.tsx:145, erp/vendas/page.tsx:127, equipe/page.tsx:89 e mais — 896px) e max-w-5xl (admin/page.tsx:94 — 1024px). Navegar de /erp/produtos para /erp/produtos/categorias encolhe o conteúdo em 224px sem motivo. Desperdício em 1920px: 54% em avisos, 60% em categorias.

> **Correção:** Todas viram tipo (A) — largura da casca. O desperdício deixa de existir porque o teto deixa de existir.

**`apps/web/src/app/(app)/loading.tsx:12`**

O esqueleto de carregamento de TODO o grupo (app) é `mx-auto max-w-5xl` (1024px) com `grid gap-4 md:grid-cols-3` — o único `md:` do app inteiro. Mas 22 das telas que ele antecede são max-w-4xl (896px) e 7 são max-w-3xl (768px). Resultado: a cada navegação o conteúdo aparece 128px ou 256px mais estreito que o esqueleto que acabou de sair, e em três colunas que viram uma. É um salto de layout visível em toda transição de rota — exatamente o que o comentário no topo do arquivo diz estar evitando ('a página não salta quando os dados chegam').

> **Correção:** O esqueleto tem que usar o mesmo `<Page variant>` da rota. Com o container unificado o problema some; enquanto isso, alinhar ao menos o max-w ao valor dominante e trocar md:grid-cols-3 pela forma real da tela (lista de linhas, não três cartões).

**`apps/web/src/components/shell/app-shell.tsx:119`**

A gaveta mobile funciona bem no essencial — trava o scroll do body, fecha no Escape, fecha ao trocar de rota, foca o botão de fechar e tem `max-w-[85vw]` (318px em 375px de tela). Mas ela declara `role="dialog" aria-modal="true"` sem prender o foco: não há focus trap. Depois do último item do menu o Tab sai da gaveta e entra no conteúdo da página atrás do overlay, que continua no fluxo e recebe foco. Para leitor de tela e teclado, o modal mente sobre ser modal.

> **Correção:** Prender o foco no contêiner da gaveta (ciclar Tab/Shift+Tab entre o primeiro e o último focável) e devolver o foco ao botão de abrir ao fechar. Alternativa mais barata e mais correta: trocar a gaveta manual por `<dialog>` nativo, que já faz isso — e que serviria de base para o primitivo de dialog/sheet que falta em src/components/ui.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:293`**

O balcão (PDV) é `grid gap-6 lg:grid-cols-[1fr_22rem]` dentro de max-w-5xl (erp/vendas/nova/page.tsx:109). Conta: 1024 − 64 de padding = 960; menos 352 (22rem) e 24 de gap, restam 584px para a coluna de itens — busca de produto, lista de itens com quantidade, botões de +/−, total por linha. 584px é menos que um tablet. Numa tela de balcão de 1920px isso é o pior lugar possível para economizar espaço. A coluna lateral de 22rem também é fixa e não cresce.

> **Correção:** O PDV é tipo (A)/(C): sem max-w, `xl:grid-cols-[minmax(0,1fr)_24rem]`. A coluna de itens passa de 584 para mais de 1100px e comporta a linha de item em tabela, com preço unitário, desconto e total como colunas em vez de empilhados.

**`apps/web/src/app/(app)/admin/clientes/novo/new-client-form.tsx:76`**

Teto dentro de teto dentro de teto. A página é max-w-4xl (admin/clientes/novo/page.tsx:53 — 896px), o formulário dentro dela é `grid gap-6 lg:grid-cols-[1fr_20rem]` (linha 76), e o Card da coluna principal é `max-w-xl` (linha 297 — 576px). A coluna principal já tinha só 832 − 320 − 24 = 488px, e o max-w-xl não chega nem a valer. Três decisões de largura empilhadas, nenhuma delas conversando com a outra.

> **Correção:** Remover o `max-w-xl` do Card — a medida de leitura já é responsabilidade do container de página. Formulário é tipo (E): max-w-3xl, uma decisão só.

**`apps/web/src/components/ui/card.tsx:18`**

A densidade vertical é inchada no enfeite e apertada na informação. O custo fixo de cada tela antes do primeiro dado: `py-8` (32px) + PageHeader com h1 em `text-3xl` (36px de linha) + descrição (24) + `mt-1` + `mb-6` (24) = ~120px, mais o bloco de filtros com `mb-6` e `gap-4` = ~116px. Dá ~236px de cabeçalho antes do primeiro registro, em 1024px de altura útil. Dentro disso, Card gasta `p-5` no header (20px) + `pb-3` + `p-5 pt-0` no conteúdo, e as seções se separam por `gap-6` (28 ocorrências de gap-6 e 27 de mb-6 em (app)). Enquanto isso o conteúdo de verdade — a linha da lista — não tem grade nenhuma e ocupa 97px por registro. O sistema gasta espaço com o que não é dado e comprime o que é.

> **Correção:** Card: p-5 → p-4 no header e p-4 pt-0 no conteúdo. Seções: gap-6 → gap-4. Página: py-8 → py-6. PageHeader: mb-6 → mb-5 e h1 `sm:text-3xl` → `text-2xl` fixo (um título de 30px em cima de uma coluna de listagem é desproporcional; o mockup usa título discreto). Isso devolve ~70px por tela, que são mais duas linhas de tabela.

#### Gravidade baixo

**`apps/web/src/app/(app)/painel/dashboard.tsx:286`**

As grades de KPI não seguem regra. Dentro do próprio painel convivem `grid-cols-2 gap-3 sm:grid-cols-3` (linhas 232 e 401) e `grid-cols-2 gap-3 lg:grid-cols-4` (linhas 286 e 322). Fora dele, `grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4` em erp/vendas/sale-rows.tsx:64, erp/estoque/levels.tsx:94 e erp/financeiro/summary.tsx:91, e `grid gap-3 sm:grid-cols-3` em crm/oportunidades/board.tsx:119. Quatro formas diferentes de desenhar a mesma faixa de números, e o componente de KPI é redefinido localmente em cada arquivo (Indicador, Cartao, Resumo, Cartao de novo).

> **Correção:** Um único `<KpiStrip>` + `<Kpi>` em src/components/page/, com a grade `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5` e suporte a rótulo, número, variação vs período anterior e sparkline. Os quatro componentes locais viram um.

**`apps/web/src/app/(app)/empresas/page.tsx:27`**

Quinta variante de padding: `mx-auto max-w-2xl px-4 py-10 sm:px-6` — py-10 em vez de py-8 e sem `lg:px-8`. Todas as outras 35 páginas usam `px-4 py-8 sm:px-6 lg:px-8`. Em telas grandes essa tela fica com 24px de padding lateral onde o resto do app tem 32.

> **Correção:** Absorver no `<Page variant="status">`.

**`apps/web/src/components/shell/app-shell.tsx:88`**

Em 375px o header não tem folga. Somando: px-4 (32) + botão hambúrguer (38) + gap-3 (12) + logo (símbolo ~28px + gap 10 + wordmark ~117px = 155) + sino (38) + menu de conta (avatar 24 + gap 8 + chevron 14 + px-2 = ~70) = ~345 de 375px. Sobram 30px. O Badge 'Em construção' e o ThemeToggle já estão escondidos em sm justamente por isso. Não quebra hoje, mas qualquer elemento novo no header — a busca global que o mockup pede, por exemplo — estoura.

> **Correção:** No mobile, reduzir a logo ao símbolo (BrandSymbol) e esconder o wordmark; isso libera ~127px, que é exatamente o espaço para o botão de busca.


---

## Telas de ERP (produtos, categorias, vendas, nova venda, recibo, formas de pagamento, estoque, movimentações, financeiro e fluxo de caixa)

O ERP é honesto e acessível, mas visualmente é uma coluna de 896px perdida no meio de um monitor de 1920px, e nenhuma das suas listas é tabela: são 50 cartões de ~90px empilhados num `<ul>`, sem cabeçalho de coluna, sem alinhamento e sem ordenação. O maior formulário do sistema (sale-form.tsx, 737 linhas) é um único componente sem subdivisão, e o painel de resultados da busca de produto empurra o carrinho para baixo a cada tecla. O gráfico de fluxo de caixa é um SVG de viewBox fixo 640×240 esticado com `w-full`: alargar a página escala texto e altura junto, então ele quebra exatamente na correção que o dono quer. A regra de não fingir funcionalidade está bem cumprida — não encontrei um único dado falso nem mock não rotulado.

### O que já está bom e deve ser preservado

- A regra de não fingir funcionalidade está cumprida em todo o ERP e cumprida na UI, não só em comentário: vendas/nova/page.tsx:130-133 avisa que registrar não emite nota fiscal e nomeia o que falta (provedor fiscal e certificado); vendas/[id]/receipt.tsx:236-238 carimba “Comprovante interno. Não é documento fiscal.”; financeiro/page.tsx:78 e vendas/formas/page.tsx:66 dizem que nada ali cobra, paga ou fala com banco. Não encontrei nenhum dado inventado, nenhum gráfico com série falsa e nenhum mock não rotulado nas 38 arquivos do módulo.
- Cor nunca vai sozinha. `SituacaoDoEstoque` (produtos/product-rows.tsx:40-63) sempre acompanha ícone e a palavra da situação; `MovementList` (movement-list.tsx:41 e 80) distingue entrada de saída por ícone e por sinal +/−/±, não pelo verde e vermelho; `SalesSummary`/`EntryRows` marcam cancelado com Badge e `line-through` além da cor (sale-rows.tsx:156 e 166-169, entry-rows.tsx:53 e 72-75). Isso deve sobreviver ao redesenho.
- O gráfico tem equivalente textual de verdade: `<title>`/`<desc>` no SVG (cashflow-chart.tsx:99-103) e a tabela completa dos mesmos números logo abaixo (cashflow-chart.tsx:251-296). Quando o gráfico for reescrito, essa tabela deve virar visível por padrão numa coluna lateral, não sumir.
- O movimento já é disciplinado: `animate-enter` são 280ms com `translateY(6px)`, `animate-grow` 520ms, e o bloco `prefers-reduced-motion` em globals.css:277-289 zera duração, delay e iteração globalmente — inclusive o `animationDelay` em cascata das listas (product-rows.tsx:72, sale-rows.tsx:137, levels.tsx:152), que sem isso deixaria itens invisíveis. O problema visual do sistema não são as animações.
- Filtro, busca, aba e paginação são todos endereço (GET), então qualquer estado de tela é um link que se manda para outra pessoa e funciona sem JavaScript: produtos/filters.tsx:27, estoque/filters.tsx:12 e 49, financeiro/summary.tsx:201, components/page/pagination.tsx:28-34. Vale generalizar para ordenação de coluna quando as tabelas existirem.
- `Submit` com `useFormStatus` (components/form/submit.tsx:19-21) desabilita e troca o rótulo durante o envio — é o que impede registrar a mesma venda duas vezes num clique duplo no balcão. Está aplicado em todos os formulários do ERP.
- Os números de resumo vêm do banco sobre o período inteiro, não da página visível: `erp_sales_summary` (vendas/page.tsx:96), `finance_summary` e `finance_cashflow` (financeiro/page.tsx:87 e 92), e o `count: 'exact'` alimenta a paginação real. Os KPIs podem ser redesenhados sem medo de estarem mentindo.
- Registro cancelado nunca desaparece da lista: continua visível, riscado, com selo e com o motivo (sale-rows.tsx:145-169, entry-rows.tsx:53-59, receipt.tsx:211-223). É a decisão certa para um ERP e deve ser preservada na migração para tabela.

### Achados

#### Gravidade alto

**`apps/web/src/app/(app)/erp/produtos/page.tsx:145`**

Todas as 11 telas do ERP estão presas num container centrado, dentro de um `main` que é `min-w-0 flex-1` (app-shell.tsx:153) ao lado de uma sidebar de `w-64` (app-shell.tsx:110). Em 1920px a área útil é 1664px e a tela usa 896px: sobram 768px de margem vazia (46%). Ocorrências: produtos/page.tsx:145, vendas/page.tsx:127, estoque/page.tsx:146, 217 e 304, financeiro/page.tsx:138 e 278, produtos/[id]/page.tsx:207, vendas/[id]/page.tsx:136 (todas max-w-4xl = 896px); vendas/formas/page.tsx:56 (max-w-3xl = 768px); vendas/nova/page.tsx:87 e 109 (max-w-5xl = 1024px); produtos/categorias/page.tsx:54 (max-w-2xl = 672px — a tela mais estreita do sistema inteiro, um formulário de duas colunas espremido em 672px).

> **Correção:** Trocar `mx-auto max-w-Nxl` por um container fluido com teto alto e padding responsivo, do tipo `w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:max-w-[1600px] 2xl:mx-auto`, e devolver a decisão de largura ao conteúdo: listas e tabelas ocupam tudo; blocos de leitura longa (descrição de produto, motivo de cancelamento) recebem `max-w-prose` no próprio elemento, não na página. Padronizar isso num componente `PageContainer` em components/page/ para não repetir a string em 14 arquivos.

**`apps/web/src/app/(app)/erp/produtos/product-rows.tsx:68`**

Nenhuma lista do ERP é tabela. Todas são `<ul>` de cartões-linha com `p-4`: product-rows.tsx:68-137, vendas/sale-rows.tsx:133-176, estoque/levels.tsx:148-200, financeiro/entry-rows.tsx:204-216. Cada linha tem ícone `size-10` mais 3 parágrafos empilhados, o que dá ~88-90px de altura; com POR_PAGINA = 50 (produtos/state.ts:32, vendas/state.ts:49, estoque/state.ts:21, financeiro/state.ts:65) isso é ~4.400px de rolagem por página. Não há cabeçalho de coluna, não há ordenação por coluna, e os valores não se alinham verticalmente entre linhas porque o preço fica num bloco `text-right` de largura variável. O único `<table>` de todo o ERP está em cashflow-chart.tsx:258, escondido dentro de um `<details>` fechado por padrão (linha 253).

> **Correção:** Criar um primitivo `Table` em src/components/ui/table.tsx (thead/tbody/th/td com `tabular-nums`, `sticky top-0` no thead e cabeçalho clicável que escreve `?ordem=` na URL, no mesmo padrão GET dos filtros atuais) e converter as quatro listas. Alvo de densidade: linha de ~44px com `py-2.5`, colunas fixas (nome, categoria, saldo, preço, margem) e o ícone de situação como célula de 32px, não como avatar de 40px. Guardar o cartão-linha só para o layout de celular, via `hidden md:table-row` / `md:hidden`.

**`apps/web/src/app/(app)/erp/estoque/page.tsx:327`**

Quando a leitura do estoque falha, a tela mostra um erro e, logo abaixo, um empty state tranquilizador. O guarda da linha 144 exige `produtosR.error === null`, então em caso de erro o código cai na aba de saldo com `produtos = []`; a linha 314 renderiza o FormError e a linha 327 renderiza `EmptyState titulo="Nada nesta situação"` cujo corpo (linha 338) diz “Nenhum cadastro está nesta situação agora — o que é bom sinal.”. Falha de banco vira “bom sinal”. Pior: o cabeçalho na linha 134 usa `contagem(totalControlados, ...)` e afirma “0 produtos com controle de estoque” como se fosse um fato. produtos/page.tsx:181, vendas/page.tsx:160 e financeiro/page.tsx:322 fazem certo — todos condicionam o empty state a `error === null`.

> **Correção:** Aplicar o mesmo guarda da lista de produtos: `pagina_.length === 0 && produtosR.error === null && erroNiveis === null`. Em caso de erro, substituir a lista por um bloco de falha com ação de recarregar, e omitir a contagem do cabeçalho (ou trocar por “—”) em vez de afirmar zero.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:79`**

O maior arquivo do sistema é um único componente: `SaleForm` vai da linha 79 à 737, 658 linhas de JSX num só corpo de função, com 12 chamadas de `useState`/`useActionState`/`useTransition` (linhas 81-93 e 265-268). Dentro dele estão embutidos, sem extração: a busca com dropdown (305-354), a lista de itens (358-457), o cadastro rápido de cliente (504-555), o bloco de totais e desconto (557-594), o fieldset de pagamentos com troco e divisão (596-712) e a observação (714-726). Os dois outros formulários do módulo fazem o oposto e extraem um subcomponente `Campos`: produtos/product-form.tsx:131 e financeiro/entry-form.tsx:97.

> **Correção:** Quebrar em `ProductSearch`, `SaleLineItem`, `QuickCustomer`, `PaymentSplit` e `SaleTotals` no mesmo diretório, mantendo `SaleForm` como orquestrador com o estado. Mover `pagamentos`/`valorEditado`/`valorDe` para um `usePayments()` e `linhas`/`itens`/`adicionar`/`passo`/`tirar` para um `useSaleLines()`, ambos em vendas/hooks.ts. Isso é pré-requisito para o redesenho: hoje não dá para mexer na coluna de itens sem reler 700 linhas.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:331`**

O painel de resultados da busca de produto é renderizado no fluxo normal, não sobreposto. O `<div className="relative">` da linha 305 nunca é usado como âncora: o `<ul>` da linha 332 só tem `mt-2 overflow-hidden rounded-md border`, sem `absolute`. Resultado: a cada tecla no campo de código de barras, até 8 resultados (linha 111, `.slice(0, 8)`) entram no layout e empurram toda a lista de itens da venda ~330px para baixo; ao apagar o termo, tudo salta de volta. Na tela do balcão, que é a mais usada e a que se opera com leitor sem olhar, isso é o pior lugar possível para um salto de layout.

> **Correção:** Posicionar o painel como overlay: `absolute top-full right-0 left-0 z-20 mt-2 max-h-80 overflow-y-auto bg-surface-raised shadow-lg` dentro do `relative` da linha 309 (o que envolve o input), não do 305. Aproveitar para dar ao conjunto a semântica de combobox, listada no achado de acessibilidade abaixo.

**`apps/web/src/app/(app)/erp/financeiro/cashflow-chart.tsx:94`**

O gráfico de fluxo de caixa tem viewBox fixo (`0 0 640 240`, das constantes ALTURA=240 na linha 7 e `largura={640}` na linha 41) e a `<svg>` recebe `h-auto w-full` (linha 97). Isso significa que tudo dentro dele — incluindo os `text-[11px]` das linhas 152, 210, 229 e 232 e a espessura das linhas — escala junto com a largura do container, e a altura é amarrada à largura por 240/640. Hoje, em max-w-4xl, o SVG renderiza ~792px de largura: fator 1,24, texto em ~13,6px, altura 297px. Alargar a página para 1600px, que é a correção nº 1 pedida, leva o fator a 2,5: texto de 27px e um gráfico de 600px de altura. Ou seja, o gráfico quebra exatamente na mudança que o dono quer.

> **Correção:** Desacoplar escala de layout: manter o viewBox só para a geometria das barras e usar `preserveAspectRatio="none"` com altura fixa em CSS (`h-64 md:h-72`), tirando todo texto de dentro do SVG — eixos, rótulos de semana e o selo “esta semana” viram elementos HTML posicionados sobre o gráfico, que não escalam. Alternativa mais simples: medir a largura no cliente e gerar o viewBox com a largura real em pixels, para fator 1,0 sempre.

**`apps/web/src/app/(app)/erp/financeiro/cashflow-chart.tsx:158`**

O gráfico não tem tooltip, tem o balão nativo do navegador: um `<title>` dentro do `<g>` (linhas 158-160). Isso só aparece com mouse, depois de ~1s de espera, sem estilo, e nunca aparece no teclado nem no toque. Além disso não há área de captura por coluna: as únicas superfícies que disparam o balão são os `<rect>` das barras (161-204), que só existem quando `hRecebido > 0` etc. — uma semana sem movimento fica sem alvo nenhum, e o espaço entre barras também. A referência que o dono passou pede “gráfico grande com tooltip” e “série pontilhada do período anterior”; aqui não há nem tooltip real, nem série de comparação.

> **Correção:** Adicionar por semana um `<rect>` invisível de largura `grupo` cobrindo a altura toda, com `tabIndex={0}` e handlers de `mouseenter`/`focus`, e desenhar um tooltip HTML posicionado (o componente já precisaria virar `'use client'`, ou usar um wrapper cliente só para a camada de hover). Junto: um `<line>` de crosshair na coluna ativa e a série do período anterior como polyline tracejada, que é o que diferencia o gráfico dos sistemas de referência.

**`apps/web/src/app/(app)/erp/produtos/page.tsx:158`**

Não existe nenhum feedback de carregamento em filtro, busca ou paginação do ERP. Não há `loading.tsx` em nenhuma rota de `erp/` (o único do grupo é app/(app)/loading.tsx). E esse global não ajuda aqui por dois motivos: primeiro, ele é um esqueleto genérico de 3 cartões em `md:grid-cols-3` dentro de `max-w-5xl` (loading.tsx:12 e 23), que não tem a forma de nenhuma tela do ERP — nem faixa de KPIs, nem lista, nem gráfico; segundo, mudança de searchParam na mesma rota não remonta o segmento, então nem esse esqueleto aparece. Todo filtro é `<form method="get">` com `<Button type="submit">` comum (produtos/filters.tsx:60, estoque/filters.tsx:68 e 116, vendas/sale-rows.tsx:117, financeiro/page.tsx:309) e a paginação é `<Link>` puro (components/page/pagination.tsx:46 e 58). Entre clicar em “Filtrar” e a tela mudar não acontece absolutamente nada na interface.

> **Correção:** Criar loading.tsx por rota (erp/produtos, erp/vendas, erp/estoque, erp/financeiro) com esqueleto da forma real daquela tela: faixa de 4 KPIs, barra de filtro e N linhas de tabela. Para searchParams, envolver a lista num `<Suspense key={JSON.stringify(params)}>` com fallback de linhas em `animate-pulse`, e usar `useLinkStatus` na paginação e `useFormStatus` no botão Filtrar para o estado pendente imediato.

#### Gravidade média

**`apps/web/src/app/(app)/erp/vendas/sale-rows.tsx:63`**

Existem três implementações diferentes do mesmo cartão de KPI dentro do ERP, e elas não se parecem: sale-rows.tsx:63-77 (`<dl>`, sem ícone, sem link, sem estado ativo), financeiro/summary.tsx:35-78 (com ícone, link opcional, cor no valor) e estoque/levels.tsx:37-73 (com ícone, link obrigatório, `aria-current` e borda de estado ativo). As três repetem literalmente a mesma string `flex min-w-0 flex-col gap-1 rounded-lg border ... bg-surface-raised p-3 sm:p-4`. Nenhuma tem variação vs período anterior nem sparkline — o alvo pede as duas coisas —, e nenhuma usa o `CountUp` que já existe em components/page/count-up.tsx e é usado só pelo painel (painel/dashboard.tsx:79). Todas travam em `lg:grid-cols-4`, enquanto a referência tem faixa de 5.

> **Correção:** Um componente único `StatCard` em src/components/page/stat-card.tsx com props `rotulo`, `valor`, `formato`, `delta` (valor + período de comparação), `serie` (array para a sparkline SVG de ~60×20), `Icone`, `href` e `ativo`, usando CountUp por dentro. Trocar os três lugares por ele e subir a grade para `grid-cols-2 md:grid-cols-3 xl:grid-cols-5` assim que a página ficar larga.

**`apps/web/src/app/(app)/erp/produtos/filters.tsx:27`**

A mesma barra de busca + filtros está reimplementada quatro vezes, com quatro grades diferentes: produtos/filters.tsx:27-63 (`grid-cols-[1.5fr_1fr]`), estoque/filters.tsx:49-73 (`grid-cols-[1fr_auto]`), vendas/sale-rows.tsx:91-121 (`grid-cols-2`) e financeiro/page.tsx:284-313 (`grid-cols-[1fr_auto]`, escrita inline dentro da página). Nenhuma usa o `SearchBox` compartilhado de components/page/search-box.tsx — que existe, tem ícone de lupa e é usado só pelo CRM (crm/contatos/page.tsx:119 e crm/empresas/page.tsx:101). Consequência visível: no CRM o campo de busca tem lupa, no ERP não tem em lugar nenhum; e cada tela do ERP alinha os selects de um jeito.

> **Correção:** Estender `SearchBox` para aceitar `filtros?: ReactNode` como slot à direita e adotá-lo nas quatro telas, ou extrair um `FilterBar` em src/components/page/filter-bar.tsx com layout fixo (busca flexível à esquerda, selects de largura fixa, botão à direita) e um único breakpoint de empilhamento. Não pode haver quatro respostas para “onde fica o filtro”.

**`apps/web/src/app/(app)/erp/financeiro/summary.tsx:201`**

`FinanceTabs` (summary.tsx:201-229) e `StockTabs` (estoque/filters.tsx:12-37) são o mesmo componente escrito duas vezes: mesma `<nav>` com `mb-6 flex gap-1 border-b border-line-subtle`, mesmos links com `-mb-px border-b-2 px-3 py-2 text-sm` e a mesma condicional `border-surface-brand font-medium` / `border-transparent text-content-muted`. A única diferença é que a versão do financeiro tem `overflow-x-auto` e a do estoque não — ou seja, num celular estreito as abas do estoque cortam e as do financeiro rolam.

> **Correção:** Extrair `Tabs` para src/components/ui/tabs.tsx recebendo `{ chave, rotulo, href }[]` e a chave ativa, com `overflow-x-auto` sempre. Isso também prepara o terreno para o CRM, que vai precisar do mesmo primitivo.

**`apps/web/src/app/(app)/erp/movement-list.tsx:36`**

Os empty states do ERP estão divididos em duas classes. Uns usam o componente `EmptyState` (ícone em círculo, título, frase, botão de ação): produtos/page.tsx:183 e 197, vendas/page.tsx:162 e 179, vendas/nova/page.tsx:90, estoque/page.tsx:148 e 328, financeiro/page.tsx:157, 324 e 339. Outros são um parágrafo cinza solto: movement-list.tsx:36, categorias/categories.tsx:130, formas/payment-methods.tsx:129 e 150, financeiro/summary.tsx:161 e recibo/receipt.tsx:155. O contraste fica gritante na própria tela de estoque: a aba “Saldo” tem empty state com ícone e botão (page.tsx:328) e a aba “Movimentações”, ao lado, tem uma única frase cinza dentro de um card (page.tsx:239 chamando movement-list.tsx:36).

> **Correção:** Passar `EmptyState` para todos, aceitando uma variante compacta (`denso`) para o caso de estar dentro de um `CardContent`: mesmo ícone, mesmo título, mesma frase explicativa, e ação quando houver o que fazer (“Registrar movimentação”, “Adicionar categoria”, “Cadastrar forma”). O alvo do dono cita explicitamente empty state com ícone, frase e botão.

**`apps/web/src/app/(app)/erp/financeiro/page.tsx:93`**

A aba Visão do financeiro tem janela de tempo fixa e invisível: `finance_cashflow` é chamado com `addDays(segunda, -28)` a `addDays(segunda, 34)` (linhas 94-95), ou seja 9 semanas cravadas no código, sem nenhum controle na tela. Não há seletor 7/30/90 dias (a referência pede), não há como olhar o trimestre, e o título do card é só “Fluxo de caixa” (linha 153) sem dizer o período que está sendo mostrado. É incoerente dentro do próprio ERP: a tela de vendas tem seletor de período (sale-rows.tsx:93-98, hoje/7d/30d/tudo) e escreve o período na descrição do cabeçalho (vendas/page.tsx:130).

> **Correção:** Adicionar `?periodo=` na aba Visão com opções 30/90/180 dias (ou 4/9/26 semanas), no mesmo padrão GET do resto, derivar as datas do parâmetro em vez das constantes, e escrever o intervalo resolvido no `CardTitle` ou numa `CardDescription` (“28/07 a 04/10, por semana”).

**`apps/web/src/app/(app)/erp/financeiro/summary.tsx:175`**

O painel “Vencendo até daqui a 7 dias” é um beco sem saída. Cada item da lista é um `<Link>` que aponta para `/erp/financeiro?aba=receber` ou `?aba=pagar` (linha 175) — a lista inteira, sem filtro e sem âncora no lançamento clicado. Quem vê “Aluguel · venceu ontem” em vermelho e clica cai na aba “A receber/A pagar” em aberto, ordenada por vencimento, e tem que procurar o item de novo. A lista ainda é cortada em 8 itens (financeiro/page.tsx:105) sem nenhum “ver todos” nem contagem do que ficou de fora. É justamente o painel que a referência chama de “próxima melhor ação”, e ele não permite agir.

> **Correção:** Levar ao lançamento específico: `/erp/financeiro?aba={aba}&filtro=vencidos&q={descricao}#lanc-{id}` com `id` no `<li>` de entry-rows.tsx, ou melhor, oferecer a baixa direto no painel reaproveitando o formulário de entry-rows.tsx:121-148. Acrescentar rodapé com “+N vencendo” quando a consulta bater no limite de 8.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:293`**

Os três layouts de duas colunas do ERP quebram exatamente no breakpoint em que a sidebar aparece. `lg:grid-cols-[1fr_22rem]` (sale-form.tsx:293), `lg:grid-cols-[1fr_18rem]` (vendas/[id]/receipt.tsx:105) e `lg:grid-cols-[1fr_18rem]` (produtos/[id]/page.tsx:231) disparam em 1024px de viewport — o mesmo ponto em que a `<aside className="hidden w-64 ... lg:block">` do shell (app-shell.tsx:110) passa a ocupar 256px. Conta em 1024px na tela de venda: 1024 − 256 (sidebar) = 768 de área útil; menos 64 de `lg:px-8`, menos 24 de `gap-6`, menos 352 da coluna de fechamento, sobram 328px para a coluna de itens — onde tem que caber nome do produto, botão −, campo de quantidade, unidade, botão +, total e lixeira na mesma linha (sale-form.tsx:383-443).

> **Correção:** Subir esses três para `xl:` (1280px) ou, melhor, trocar por container queries (`@container` no `main` e `@3xl:grid-cols-[1fr_22rem]`), que é o que realmente descreve a intenção: a coluna lateral só entra quando a área de conteúdo — não o viewport — comporta as duas.

**`apps/web/src/app/(app)/erp/estoque/levels.tsx:153`**

Convivem três densidades de linha diferentes dentro do mesmo módulo, às vezes na mesma tela. Linhas de saldo em `p-4` com ícone de 40px, ~90px de altura (levels.tsx:153); linhas de movimentação em `py-2.5` com ícone de 16px, ~54px (movement-list.tsx:49); linhas do recibo em `py-2.5` (receipt.tsx:116); linhas do financeiro em `p-4` mais uma faixa de botões por linha (entry-rows.tsx:45 e 82). Trocar da aba “Saldo” para a aba “Movimentações” em /erp/estoque muda o ritmo vertical pela metade sem que nada na informação justifique.

> **Correção:** Definir duas densidades e só duas, como tokens de layout: `linha-densa` (py-2.5, ícone 16px) para razões e históricos, `linha-larga` (py-3, ícone 32px) para listas navegáveis com identidade visual. Aplicar via o mesmo primitivo `Table`/`Row` do achado das tabelas, em vez de classes soltas por arquivo.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:728`**

O botão principal da venda fica desabilitado sem dizer por quê, na maior parte dos casos. `disabled={!pronto}` na linha 728, com `pronto = itensOk && pagamentosOk && !descontoInvalido && clienteOk` (linha 227), mas a única explicação adjacente é a das linhas 731-733, que só cobre `!clienteOk`. Se a quantidade de uma linha estiver inválida, o motivo está lá em cima na linha 444-452; se o pagamento não bater, está na 702-711, dentro do fieldset. Ainda no carrinho vazio, o botão exibe “Registrar venda · R$ 0,00” — anuncia o valor zero como se fosse um total legítimo.

> **Correção:** Substituir o `disabled` mudo por uma lista de pendências imediatamente acima do botão (“Falta: quantidade do item X · R$ 12,00 nos pagamentos”), construída dos mesmos predicados que já existem, e trocar o rótulo por “Adicione um item para registrar” enquanto `linhas.length === 0`, escondendo o total zero.

#### Gravidade baixo

**`apps/web/src/app/(app)/erp/produtos/page.tsx:204`**

Quando a consulta falha, a tela renderiza um `<ul>` vazio com borda e fundo, o que aparece como um filete horizontal arredondado logo abaixo da mensagem de erro. A condicional `produtos.length === 0 && lista.error === null ? <EmptyState/> : <ProductRows/>` (linha 181) manda para `ProductRows` quando há erro, e `ProductRows` sempre devolve `<ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">` (product-rows.tsx:68), mesmo sem filhos. Mesma coisa em vendas/page.tsx:199 com sale-rows.tsx:133 e em financeiro/page.tsx:346 com entry-rows.tsx:204.

> **Correção:** Guarda de uma linha no topo de cada componente de lista (`if (itens.length === 0) return null;`), ou trocar o ternário por três ramos explícitos: erro, vazio, lista.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:463`**

A coluna de fechamento usa `lg:sticky lg:top-20` (80px), mas o header do shell tem `h-14` e é `sticky top-0` (app-shell.tsx:79), ou seja, 56px. A própria sidebar do shell usa `sticky top-14` (app-shell.tsx:111), que é o valor certo. O `top-20` é um número mágico que não corresponde a nada no layout e deixa 24px de folga arbitrária.

> **Correção:** Trocar por `lg:top-14`, ou definir `--altura-header: 3.5rem` em globals.css e usar `lg:top-[var(--altura-header)]` nos dois lugares, para que mudar a altura do header não quebre nenhuma coluna fixa.

**`apps/web/src/app/(app)/erp/vendas/sale-form.tsx:332`**

A busca de produto é um combobox sem a semântica de combobox. O `<ul>` de resultados (linha 332) não tem `role="listbox"`, o `<Input>` (linha 314) não tem `role="combobox"`, `aria-expanded` nem `aria-controls`, e `aoTeclarNaBusca` (linhas 141-150) só trata Enter — setas para cima e para baixo não navegam os resultados, então quem digita um nome parcial com 5 resultados não tem como escolher o terceiro sem tirar a mão do teclado e usar o mouse. O aviso de item adicionado vai só para um `<p className="sr-only" aria-live="polite">` (linha 296), ou seja, quem enxerga não recebe confirmação nenhuma além de o item aparecer.

> **Correção:** Aplicar o padrão combobox completo (`role="combobox"` + `aria-expanded` + `aria-activedescendant` no input, `role="listbox"`/`role="option"` na lista) e tratar ArrowDown/ArrowUp/Escape no `onKeyDown` com um índice ativo destacado. Ao construir o primitivo, vale já resolver para o `Select`/`Command` que o resto do sistema também vai precisar.

**`apps/web/src/app/(app)/erp/financeiro/cashflow-chart.tsx:31`**

O gráfico de fluxo é emitido duas vezes no DOM: `<Grafico ... largura={360} className="sm:hidden">` (linhas 31-38) e `<Grafico ... largura={640} className="hidden sm:block">` (linhas 39-46). São dois SVGs completos, com dois `<defs>` de padrões de hachura e o dobro dos `<rect>`, dos quais metade está sempre invisível. Os ids são distintos (`fluxo-estreito`/`fluxo-largo`), então não há colisão, mas o custo de DOM e de animação (`animate-grow` roda nos dois) é dobrado, e qualquer ajuste precisa ser feito em duas configurações.

> **Correção:** Um SVG só, com a largura do viewBox vinda de container query ou de uma medição no cliente, e a regra de rótulo (`rotuloACada`) derivada da largura medida em vez de duplicar a árvore. Como a refatoração de escala do achado anterior já vai mexer nesse arquivo, convém resolver os dois juntos.

**`apps/web/src/app/(app)/erp/financeiro/entry-rows.tsx:38`**

Cada linha do financeiro é um componente cliente com três `useActionState` próprios (linhas 38-40: baixa, desfazer, cancelar) e ainda um `.map` sobre os três estados no fim (linha 178). Com POR_PAGINA = 50 (financeiro/state.ts:65), uma página de contas em aberto monta 150 estados de ação e, como o bloco de ações é renderizado inline em toda linha (linhas 81-119), a tela mostra 100 botões “Registrar recebimento”/“Cancelar” empilhados. Visualmente é ruído constante que compete com os valores; funcionalmente é peso de hidratação por linha.

> **Correção:** Mover as ações para um menu por linha (um `DropdownMenu` — que não existe ainda em components/ui) ou revelá-las no hover/foco da linha, e içar os `useActionState` para o componente da lista, passando o id do lançamento no FormData, em vez de instanciar três por linha.


---

## Movimento, estados e acessibilidade (eixo transversal) — apps/web

A camada de movimento existe mas é rasa e mal distribuída: três utilitários (`animate-enter`, `animate-grow`, `animate-fill`) cobrem 32 ocorrências e 19 das 34 telas de `(app)` não têm movimento nenhum; não há transição de entrada de página, de abertura de gaveta, de dropdown, nem toast. Os estados de rota são mínimos: um único `loading.tsx` genérico para 33 telas, um `error.tsx`, nenhum `not-found.tsx` dentro de `(app)` (os 12 `notFound()` jogam a pessoa para fora do shell), nenhum `global-error.tsx`, nenhum skeleton por tela. Em acessibilidade, o alicerce é bom (foco global, `aria-live`, `role=img` com tabela alternativa nos gráficos, tabela de dados para os SVGs), mas há duas falhas duras: o anel de foco é recortado por `overflow-hidden` em 11 listas e no menu da conta, e `--content-subtle` tem 2,81:1 no tema claro — reprova AA em texto usado em todo o app. Dez `window.confirm()` nativos são hoje a única "caixa de diálogo" do produto.

### O que já está bom e deve ser preservado

- Os dois gráficos SVG são exemplares em acessibilidade e devem virar o molde de qualquer gráfico novo: `role="img"` + `aria-labelledby` apontando para `<title>`/`<desc>` com o resumo em números (sales-chart.tsx:78-81, cashflow-chart.tsx:99-103), e uma tabela `<details>` com `<caption>` `sr-only`, `scope="col"`/`scope="row"` e `tabular-nums` repetindo todos os valores (sales-chart.tsx:152-188, cashflow-chart.tsx:251-296). A informação nunca depende só da cor: entrada/saída se distinguem por posição em relação ao eixo, previsto se distingue do realizado por hachura, e "hoje" tem rótulo escrito além da cor.
- `components/page/count-up.tsx` é a maneira certa de animar número: o valor final vem do servidor e é o que renderiza sem JS; o `requestAnimationFrame` só entra para quem não pediu movimento reduzido (checagem explícita de `matchMedia` na linha 36, além da regra CSS); o leitor de tela lê o valor final uma vez via `sr-only` e a contagem fica em `aria-hidden`; a limpeza escreve o valor final. Vale generalizar para a faixa de KPIs inteira.
- O bloco `@media (prefers-reduced-motion: reduce)` em globals.css:277-287 zera `animation-delay` junto da duração, e o comentário explica por quê — sem isso os itens escalonados ficariam invisíveis durante o atraso. É uma armadilha que quase todo projeto cai; aqui está resolvida. Manter ao adicionar as novas keyframes.
- O `EmptyState` (components/page/empty-state.tsx) tem a estrutura certa — ícone, título, explicação e slot de ação — e os textos são genuinamente bons: dizem o que está vazio, por que importa e o que fazer (automacoes/page.tsx:185, avisos/page.tsx:93, crm/oportunidades/page.tsx:115). Doze dos 23 usos já passam `acao`. É o padrão a generalizar para os 10 `Vazio` do painel e para os empties em texto solto.
- Os anúncios de mudança assíncrona para leitor de tela existem e estão corretos: `aria-live="polite"` com `sr-only` em board.tsx:115, agenda.tsx:85 e sale-form.tsx:296/590, alimentados depois da confirmação do servidor e não no otimismo. `FormError`/`FormSuccess` usam `role="alert"`/`role="status"` com a distinção certa entre interromper e não interromper.
- O quadro de oportunidades oferece duas rotas para o mesmo movimento — arrastar (mouse) e o `<details>` "Mover para…" (teclado, toque, leitor de tela), ambos pela mesma função `mover()` (board.tsx:90-104 e 402-430). O comentário do arquivo declara isso como regra, não como acaso. Mesmo raciocínio no `Switch` (checkbox nativo com cara de interruptor) e no `Select` (nativo de propósito): preferir o elemento da plataforma antes de reimplementar.
- O link "Pular para o conteúdo" existe e está correto (app-shell.tsx:72-77, com `focus:not-sr-only` e `#conteudo` no `<main>`), o `lang="pt-BR"` está no `<html>`, e o script de tema roda antes da primeira pintura (layout.tsx:56-60) evitando o flash de claro — três coisas que quase sempre faltam.

### Achados

#### Gravidade alto

**`apps/web/src/app/globals.css:215`**

O anel de foco global (`:focus-visible { outline: 2px solid; outline-offset: 2px }`) é recortado por `overflow-hidden` em 11 contêineres de lista e no menu da conta. O `<Link>` de cada linha ocupa toda a largura do `<ul className="overflow-hidden rounded-lg border ...">`, então o outline — desenhado 2px FORA da caixa — cai fora da área visível do pai e é cortado. Os arquivos afetados: contact-rows.tsx:19, company-rows.tsx:17, product-rows.tsx:68, sale-rows.tsx:133, levels.tsx:148, entry-rows.tsx:204, agenda.tsx:104, leads/page.tsx:172, equipe/page.tsx:112, sale-form.tsx:363 e user-menu.tsx:77. Nas listas há um paliativo (`focus-visible:bg-surface-subtle`), mas #f6f9fc sobre #ffffff dá 1,06:1 — invisível. No user-menu não há paliativo nenhum: navegar de teclado até "Minha conta" ou "Sair" não mostra nada.

> **Correção:** Trocar `outline` por `box-shadow` no anel global (box-shadow também é recortado; então a saída real é `outline-offset: -2px` para elementos dentro de contêiner recortado, ou remover `overflow-hidden` do `<ul>` e arredondar a primeira/última linha via `first:rounded-t-lg last:rounded-b-lg`). Como já existe um primitivo de lista repetido 11 vezes com a mesma string de classes, extrair `components/ui/list.tsx` e resolver o foco em um lugar só. Substituir o `focus-visible:bg-surface-subtle` por um indicador com ≥3:1 (barra lateral em `bg-surface-brand` + fundo).

**`apps/web/src/app/globals.css:66`**

`--content-subtle: var(--tvx-gray-400)` (#8e9bb0) no tema claro tem 2,81:1 sobre `--surface` (#ffffff), 2,66:1 sobre `--surface-subtle` e 2,50:1 sobre `--surface-muted`. Reprova WCAG AA para texto normal (4,5:1) e reprova até o piso de 3:1 de texto grande. E não é decoração: carrega as notas dos KPIs (dashboard.tsx:89 `text-xs text-content-subtle`), o detalhe dos cartões (summary.tsx:66, levels.tsx:70), os rótulos dos eixos dos gráficos (`fill-content-subtle` em cashflow-chart.tsx:229/232), a data dos avisos (notification-list.tsx:65), o `placeholder:` de todo input (input.tsx:9/51) e o código de erro (error.tsx:44). No tema escuro o mesmo token passa (5,28:1) — o defeito é só do claro.

> **Correção:** Escurecer `--tvx-gray-400` para algo em torno de #6b7a91 (≈4,6:1 sobre branco) ou repontar `--content-subtle` para `--tvx-gray-450` (#76849a, 3,79:1 — ainda insuficiente para texto normal) e criar um `--content-subtle` de verdade a 4,5:1. Depois varrer os usos: nota de KPI e placeholder não são conteúdo dispensável.

**`apps/web/src/app/(app)/loading.tsx:12`**

Existe um único `loading.tsx` em todo `apps/web` e ele fica na raiz do grupo `(app)`, então a mesma silhueta serve as 33 telas internas: um título, uma linha e uma grade de 3 cartões em `max-w-5xl`. Nenhuma tela de lista (contatos, produtos, vendas, financeiro, estoque) tem essa forma — todas são `<ul>` de linhas cheias; o quadro de oportunidades é colunas horizontais; o balcão (`erp/vendas/nova`) é um formulário de duas colunas. O comentário do próprio arquivo diz "a página não salta quando os dados chegam", e é exatamente o que acontece em 32 das 33 telas. Também não há `loading.tsx` por segmento nem nenhum outro skeleton no código (a única outra ocorrência de `animate-pulse` está nas linhas 17 do mesmo arquivo).

> **Correção:** Extrair um primitivo `components/ui/skeleton.tsx` e criar `loading.tsx` por família de tela: um de lista (faixa de filtros + 6-8 linhas), um de painel (KPIs + gráfico + laterais), um de detalhe e um de formulário. Reaproveitar o mesmo grid da página real para que o esqueleto ocupe as mesmas caixas.

**`apps/web/src/app/not-found.tsx:11`**

Não existe `not-found.tsx` dentro de `(app)`. Os 12 `notFound()` das rotas internas (crm/contatos/[id]/page.tsx:52 e :65, crm/empresas/[id]/page.tsx:52 e :63, crm/oportunidades/[id]/page.tsx:54 e :68, erp/produtos/[id]/page.tsx:60 e :73, erp/vendas/[id]/page.tsx:53 e :67, admin/clientes/[id]/page.tsx:61 e :96) caem no `app/not-found.tsx` da raiz, que renderiza `min-h-dvh` centralizado FORA do `AppShell`. Abrir um link quebrado para um produto faz a barra lateral, o cabeçalho, o sino e o seletor de empresa sumirem — a pessoa é ejetada do sistema e só tem "Voltar para a visão geral". Também não há `global-error.tsx`: uma falha no layout raiz entrega a página branca padrão do Next.

> **Correção:** Criar `app/(app)/not-found.tsx` renderizado dentro do shell, reaproveitando o `EmptyState` com um botão de volta para a lista do módulo. Criar `app/global-error.tsx` com a marca e o `digest`.

**`apps/web/src/app/(app)/erp/financeiro/entry-rows.tsx:106`**

Há 10 `window.confirm()` como única confirmação de ação destrutiva no produto: entry-rows.tsx:106 (desfazer baixa), erp/produtos/[id]/status-actions.tsx:59 (apagar produto de vez), erp/vendas/[id]/cancel-form.tsx:28 (cancelar venda), automacoes/rules.tsx:173 (excluir regra), equipe/team-forms.tsx:293, configuracoes/forms.tsx:205, erp/produtos/categorias/categories.tsx:86, crm/oportunidades/funis/editor.tsx:66, admin/clientes/[id]/forms.tsx:114 e :216. O diálogo nativo do navegador ignora todos os tokens, não acompanha o tema escuro, não aceita o ícone nem a badge de severidade, trava a aba inteira e não tem animação de abertura. É o momento de maior risco do sistema — apagar um cadastro — vestido como um alerta de 1998. Somado a isso, não existe nenhum `role="dialog"` no app fora da gaveta mobile (app-shell.tsx:127).

> **Correção:** Construir `components/ui/dialog.tsx` sobre o `<dialog>` nativo (`showModal()` já dá foco-trap, Escape e backdrop de graça) com `@starting-style` para a entrada, e trocar os 10 `window.confirm` por ele, tipando severidade (`danger` para apagar, `warning` para suspender). Para o caso irreversível, exigir digitar o nome.

#### Gravidade média

**`apps/web/src/components/shell/app-shell.tsx:116`**

A gaveta mobile e o overlay aparecem e somem instantaneamente: `{open && (<div className="fixed inset-0 z-40 lg:hidden">...)}` sem nenhuma classe de transição. O overlay pisca de transparente para `rgb(11 20 36/0.5)` num quadro e o painel de 72 de largura surge pronto. O mesmo vale para o dropdown da conta (user-menu.tsx:74-78) e para todos os painéis inline que abrem por `useState` sem `animate-enter` (entry-rows.tsx:121 e :150, automacoes/rules.tsx:44, admin/clientes/[id]/forms.tsx:195). Já existe `animate-enter` no repo e ele é aplicado a formulários que abrem (contact-form.tsx:72, deal-form.tsx:75), o que torna a inconsistência ainda mais visível.

> **Correção:** Adicionar keyframes `tvx-slide-in-left` (gaveta), `tvx-fade` (overlay) e `tvx-pop` (dropdown/popover, com `transform-origin` no gatilho) em globals.css ao lado de `tvx-enter`, e aplicá-los nos três lugares. A regra de `prefers-reduced-motion` em globals.css:277 já cobre os novos.

**`apps/web/src/components/shell/app-shell.tsx:55`**

A gaveta declara `role="dialog" aria-modal="true"` (linhas 127-128) mas não tem foco-trap: o effect só dá foco inicial ao botão de fechar (linha 59) e escuta Escape. Tab a partir do último item do menu leva o foco para o conteúdo atrás do overlay, que continua no DOM e agora está coberto — a pessoa navega de teclado num lugar que não vê. Também não devolve o foco para o botão "Abrir menu" ao fechar (nem por Escape, nem por clique no overlay, nem pela mudança de rota na linha 51). O `UserMenu` (user-menu.tsx:37-50) é pior: não move o foco para dentro ao abrir, não navega por setas apesar de declarar `role="menu"`/`role="menuitem"`, e não devolve o foco ao gatilho no Escape.

> **Correção:** Reescrever a gaveta sobre `<dialog>` nativo com `showModal()` — foco-trap, Escape e `inert` no resto da página saem de graça e o foco volta sozinho. No `UserMenu`, guardar o elemento do gatilho e chamar `.focus()` no fechamento; ou trocar `role="menu"` por um popover simples, já que os filhos são `<form>` e `<a>`, que não são filhos válidos de `menu`.

**`apps/web/src/app/(app)/crm/oportunidades/board.tsx:327`**

`style={{ animationDelay: `${Math.min(ordem, 8) * 30}ms` }}` combinado com `animate-enter` (linha 329) e `animation-fill-mode: both` em globals.css:246. Quando o cartão muda de etapa via `useOptimistic` (linha 95), o React o desmonta de um `<ul>` e o monta em outro — a animação reinicia com o atraso do novo índice. Um cartão que cai na sexta posição fica com `opacity: 0` por até 240ms antes de começar a aparecer. No arrastar-e-soltar isso lê como "o cartão sumiu", que é o oposto do que a interação precisa comunicar. O mesmo padrão `Math.min(i, N) * Xms` está em 7 listas, onde é correto (entrada de página) — aqui não é.

> **Correção:** Zerar o atraso no cartão movido (guardar o id em `useState` e omitir o `animationDelay` para ele), ou trocar o `animate-enter` do cartão por uma animação de destaque que não parta de `opacity: 0` — um pulso de `background`/`border` em `--surface-accent-soft` que confirme onde o cartão caiu.

**`apps/web/src/app/(app)/crm/atividades/agenda.tsx:122`**

O botão de concluir/reabrir a atividade não tem padding nem dimensão: `className="mt-0.5 shrink-0 rounded-full text-content-subtle transition-colors ..."` e o único filho é um ícone `size-5`. O alvo de toque fica em 20x20px, abaixo do mínimo de 24x24 da WCAG 2.5.8 e muito abaixo dos 44px confortáveis no celular — e é a ação mais repetida da agenda. Na mesma família: notification-list.tsx:75 força `className="size-8"` sobre `size="icon"` (32px), theme-toggle.tsx:97 usa `size-7` (28px) com `gap-0.5` entre três alvos, e `buttonVariants` size `sm` é `h-8` (button.tsx:18).

> **Correção:** Dar ao botão `grid size-9 place-items-center -m-2 p-2` (área clicável de 36px sem mexer no ritmo visual da linha) ou usar `Button variant="ghost" size="icon"`. Revisar os `size-7`/`size-8` restantes contra o piso de 24px, e considerar um `size="icon-sm"` explícito no cva em vez de `className="size-8"` ad hoc.

**`apps/web/src/app/(app)/painel/dashboard.tsx:122`**

Existem dois padrões de estado vazio disputando o mesmo papel. O bom é `components/page/empty-state.tsx` — ícone em círculo, título, texto e slot `acao` — usado 23 vezes, das quais 12 passam `acao`. O ruim é `function Vazio` aqui, um `<p>` tracejado sem ícone, sem título e sem botão, usado 10 vezes no painel (linhas 224, 227, 254, 279, 281, 355, 357, 375, 394, 396) — exatamente na tela que o dono quer que pareça o mockup, onde o alvo pede "empty states com ícone, frase explicativa e botão de ação". Há ainda um terceiro nível, texto solto: movement-list.tsx:36 (`<p className="text-sm text-content-muted">{vazio}</p>`), payment-methods.tsx:130 e :153, automacoes/rules.tsx:57, admin/clientes/[id]/history.tsx:78 e :152.

> **Correção:** Apagar `Vazio` e usar `EmptyState` no painel, dando a cada caso uma ação real ("Abrir o balcão", "Criar o funil", "Lançar a primeira conta"). Adicionar uma variante compacta ao `EmptyState` para caber dentro de card. Fazer `MovementList` e `payment-methods` receberem um `EmptyState` em vez de string.

**`apps/web/src/components/page/search-box.tsx:23`**

Não existe busca global nem atalho de teclado em lugar nenhum: a varredura por `keydown`/`metaKey`/`ctrlKey`/`accessKey` em todo `src` retorna só dois resultados, ambos para Escape (app-shell.tsx:63 e user-menu.tsx:45). O `SearchBox` é um formulário GET por tela, montado por página, e nem aparece no header (app-shell.tsx:79-106, que tem só logo, badge, sino, tema e conta). O alvo definido pelo dono pede "busca global com atalho Ctrl+K no header".

> **Correção:** Criar `components/shell/command-menu.tsx` sobre `<dialog>` com gatilho em Ctrl/Cmd+K e `/`, ancorado no header, com uma dica visual `<kbd>Ctrl K</kbd>` no botão de busca. Enquanto a busca cruzada de verdade não existir no servidor, limitar o escopo à navegação entre telas (já há `config/navigation.ts` com os itens e as permissões) e rotular claramente o que ainda não busca dado — sem inventar resultado.

**`apps/web/src/components/form/messages.tsx:22`**

Não há toast nem nenhuma notificação transitória no app (busca por `toast`/`sonner`/`snackbar` em todo `src`: zero). Todo retorno de ação vira `FormSuccess`/`FormError` inline, que nasce no lugar onde estava o botão, empurra o layout e nunca some. Em `entry-rows.tsx:178-184` isso é literal: três resultados de ação (`baixa`, `desfeita`, `cancelada`) são mapeados e empilhados dentro do `<li>`, e ao dar baixa em várias contas seguidas a lista vai crescendo de mensagens permanentes. `FormSuccess` também não tem `aria-live` além do `role="status"` implícito — funciona, mas a mensagem fica visualmente enterrada no fim da linha.

> **Correção:** Criar `components/ui/toast.tsx` com uma região `aria-live="polite"` única no `AppShell`, entrada por `tvx-enter` e saída por fade, e migrar as confirmações de ação de linha (baixa, desfazer, cancelar, mover cartão, concluir atividade) para ela. Manter o inline só para erro de validação de campo, que precisa ficar ao lado do campo.

**`apps/web/src/app/(app)/painel/sales-chart.tsx:89`**

O "tooltip" dos dois gráficos é `<title>` de SVG (sales-chart.tsx:89, cashflow-chart.tsx:158): balão do sistema operacional, com ~1s de atraso, fonte e cor do SO, sem tema escuro, sem seguir o cursor, e que não aparece no foco por teclado nem no toque. O alvo pede "gráfico grande com tooltip". Em cashflow-chart.tsx o `<title>` ainda vem DEPOIS do fragmento `{s.atual && ...}` dentro do `<g>` (linhas 138-160), então na semana atual ele não é o primeiro filho — posição que a spec de SVG pede para o mapeamento de nome acessível.

> **Correção:** Manter `<title>`/`<desc>` e a tabela `<details>` como camada acessível (isso está certo e é raro de ver feito), e somar um tooltip HTML posicionado: um `<rect>` invisível de largura total por coluna com `onPointerMove`/`onFocus`, `tabIndex={0}`, e um painel absoluto com os tokens do tema. Mover o `<title>` para primeiro filho do `<g>` em cashflow-chart.tsx.

**`apps/web/src/components/shell/sidebar-nav.tsx:22`**

O item de menu ainda não pronto vira `<span aria-disabled="true">` com o motivo só no atributo `title` (linhas 22-28): `Bloqueado — ${item.blockedBy}` ou 'Ainda não construído. Ver docs/PROJECT_STATE.md'. `title` não é focável, não abre por teclado, não aparece no toque, e o `<span>` não entra na ordem de tabulação — quem navega sem mouse nunca descobre por que o módulo está apagado. Além disso `text-content-subtle` nesses itens é o token de 2,81:1 do achado anterior, o que deixa o próprio rótulo quase ilegível no tema claro.

> **Correção:** Trocar por `<button type="button" disabled aria-describedby>` ou manter o span mas adicionar `tabIndex={0}` com um tooltip real (o mesmo primitivo do achado do gráfico) e um `<span className="sr-only">` com o motivo completo — hoje o `sr-only` da linha 40 só diz o rótulo do status, não o motivo.

#### Gravidade baixo

**`apps/web/src/app/(app)/erp/financeiro/entry-rows.tsx:45`**

Inconsistência no escalonamento de entrada. Sete listas aplicam `animate-enter` com atraso por índice — contact-rows.tsx:23 (`Math.min(i,10)*20`), company-rows.tsx:21, product-rows.tsx:72, sale-rows.tsx:137, levels.tsx:152, agenda.tsx:111, notification-list.tsx:32 (`Math.min(i,8)*25`), board.tsx:327 (`Math.min(i,8)*30`) — com três cadências diferentes. Já `entry-rows.tsx:45`, `automacoes/runs.tsx:47` e `sale-form.tsx:373` usam `animate-enter` sem atraso nenhum: a lista inteira aparece em bloco, o que anula o efeito. E `movement-list.tsx:49` não tem `animate-enter`, então o razão do estoque entra sem movimento numa tela onde a lista vizinha entra escalonada.

> **Correção:** Padronizar a cadência (ex.: 20ms, teto em 10 itens) num utilitário — `@utility animate-enter-stagger` com `--tvx-i` como custom property, ou um helper `atrasoDaLinha(i)` em `lib/utils.ts` — e aplicar nas quatro listas que ficaram de fora.

**`apps/web/src/app/globals.css:218`**

A regra global `:focus-visible` declara `border-radius: 0.25rem` junto do outline. Isso não arredonda só o anel: altera o `border-radius` do próprio elemento. Como está em `@layer base` e as utilidades do Tailwind vêm depois, só afeta elementos sem classe de raio — mas neles a forma muda visivelmente ao receber foco (um `<summary>` ou `<button>` sem `rounded-*` vira arredondado ao tabular e volta ao sair). É movimento não intencional, o oposto do que a seção se propõe.

> **Correção:** Remover `border-radius` da regra de foco. O outline já acompanha o raio do elemento nos navegadores atuais; onde faltar raio, colocá-lo na classe do componente.

**`apps/web/src/app/globals.css:277`**

O bloco `@media (prefers-reduced-motion: reduce)` aplica `animation-duration: 0.01ms !important` e `animation-iteration-count: 1 !important` a `*`. Isso é correto para `tvx-enter`/`tvx-grow`/`tvx-fill` e para o `animate-pulse` do esqueleto, mas congela também os cinco `animate-spin` de estado pendente (form/submit.tsx:24, (auth)/form-parts.tsx:51, crm/leads/lead-form.tsx:30, crm/leads/convert-form.tsx:33, convite/accept-form.tsx:18). Para quem pede menos movimento, o botão "Salvando…" fica com um ícone de spinner parado numa rotação aleatória — indicador de progresso que não indica progresso. O texto ainda muda, então não é falha dura, mas o ícone congelado passa a mentir.

> **Correção:** Excluir os indicadores de progresso do bloco (`*:not(.motion-safe-spin)` ou uma regra específica que restaure `animation-duration` para `.animate-spin`), ou trocar o spinner por uma barra indeterminada que respeite a preferência sem congelar — por exemplo pulsar opacidade em 2s, que é aceitável sob reduced-motion.

**`apps/web/src/components/ui/input.tsx:10`**

`Input`, `Select` e `Textarea` declaram `transition-colors duration-150` (linhas 10, 36 e 52) mas nenhuma cor muda por interação: não há `focus:border-*`, `hover:border-*` nem `focus:bg-*` em nenhum dos três. A transição não anima nada. Do lado do foco, os campos dependem só do outline global — que funciona, mas deixa a borda do campo idêntica em repouso e em foco, e num formulário denso como o balcão (sale-form.tsx) isso reduz a leitura de onde se está.

> **Correção:** Ou remover a transição morta, ou (melhor) dar o estado que ela deveria animar: `focus:border-ring` e `hover:border-line-strong`, mantendo o outline global por cima. `aria-invalid:border-danger` já existe e passaria a transicionar de verdade.


---

## Primitivos e tokens (src/components/ui, src/components/page, src/components/form, src/lib/utils.ts, src/app/globals.css)

A camada de cor é boa, mas não existe camada de tipografia: `@theme inline` não define nenhum `--text-*`, e 87% de todas as utilidades de tamanho no app são `text-sm` ou `text-xs` — não há display, metric, caption nem label. A escala de raios foi deslocada dois passos sem tocar o fim da escala, então `rounded-xl` e `rounded-3xl` viram o mesmo valor e `rounded-2xl` (2rem) ficou maior que `rounded-3xl` (1.5rem); a escala de sombra tem quatro níveis mas 18 dos 20 usos são `shadow-xs`, ou seja, a elevação é plana na prática. Os 6 primitivos cobrem menos da metade do que as telas precisam: faltam table, dialog, dropdown, tabs, tooltip, skeleton, toast, combobox, stat/KPI, progress e sparkline, e por isso há 5 implementações incompatíveis de cartão de KPI, 10 `window.confirm` no lugar de diálogo, 10 `title=` no lugar de tooltip e uma lista de duplicações que reimplementam primitivos que já existem. O botão não tem foco, estado ativo nem loading, e o `hover` da variante principal escurece no tema escuro em vez de clarear.

### O que já está bom e deve ser preservado

- A camada semântica de cor é bem feita e vale preservar inteira: `--surface-*`, `--content-*`, `--border-*`, `--state-*` com o `@theme inline` (globals.css:130-166) fazendo as utilidades referenciarem a variável, de modo que `.dark` troca o tema sem gerar um segundo conjunto de classes. É a decisão certa e está documentada no próprio arquivo (linhas 126-129).
- `color-scheme: light`/`dark` declarado nas duas raízes (globals.css:87, 91): os controles nativos — seletor de data, lista do `<select>`, barra de rolagem — seguem o tema sem uma linha de JS. Isso é o que torna a decisão de usar `<select>` nativo (ui/input.tsx:24-30) defensável, e ela deve ser mantida.
- O bloco `prefers-reduced-motion` (globals.css:277-287) zera duração E delay, com o comentário explicando por que o delay importa (sem ele o item escalonado ficaria invisível). A maioria dos sistemas erra exatamente isso.
- `CountUp` (page/count-up.tsx) é honesto: o servidor entrega o valor final, a animação só roda para quem não pediu movimento reduzido, termina exatamente no valor do banco, e o leitor de tela lê o valor uma vez via `sr-only` com a contagem em `aria-hidden`. O padrão deve ser generalizado para o número do `Stat` novo.
- Os dois gráficos SVG (painel/sales-chart.tsx:74-82 e erp/financeiro/cashflow-chart.tsx:95) têm `role="img"` com `<title>` e `<desc>` descrevendo o dado em texto, e cada um oferece a mesma informação em `<table>` dentro de um `<details>`. É acessibilidade de gráfico feita direito e é a base sobre a qual o gráfico grande com tooltip do alvo visual deve ser construído — não jogar fora.
- `EmptyState` (page/empty-state.tsx) já tem a forma que o alvo visual pede — ícone, frase explicativa e slot de ação — e é usado de forma consistente. Só precisa da correção tipográfica do h2.
- `Field` + `describedBy` (form/field.tsx) centralizam o `aria-describedby` de erro e dica em vez de deixar cada tela ligar à mão, e o comentário explica por que. O contrato está certo; o que falta é a API cobrir os casos densos para as telas pararem de contorná-lo.
- `Switch` sobre `<input type=checkbox" role="switch">` (ui/switch.tsx) e `Select` nativo: as duas decisões de usar o controle nativo estão documentadas com a razão e economizam muito código de acessibilidade. Manter a regra ao criar os primitivos novos — usar `<dialog>` nativo no Dialog, pelo mesmo motivo.
- O tom `mock` no Badge (ui/badge.tsx:17) é a materialização correta da regra do CLAUDE.md na camada de UI. O primitivo está certo; o problema é só que ninguém o usa.
- `ThemeToggle` (theme-toggle.tsx) usa `useSyncExternalStore` para ler localStorage com SSR, com fallback para `system` e try/catch em storage bloqueado, e o comentário explica por que não é um effect com setState. É o padrão certo e não deve ser mexido.
- O `cn()` de lib/utils.ts (clsx + tailwind-merge) está correto e é usado de forma consistente, o que torna viável dar override em qualquer primitivo sem duplicar classe conflitante.

### Achados

#### Gravidade alto

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:130`**

O bloco `@theme inline` (linhas 130-187) define cor, fonte, raio, sombra e easing, mas NENHUM token de tipografia: não há `--text-*`, `--leading-*` nem `--tracking-*`. O resultado é que a escala tipográfica do produto é a escala crua do Tailwind e ninguém a governa. Contagem real no app (src/app + src/components): text-sm 195, text-xs 158, text-2xl 18, text-xl 15, text-3xl 9, text-base 7, text-lg 3. Ou seja, 353 de 405 usos (87%) são 14px ou 12px, e só 9 elementos no sistema inteiro passam de 24px. Não existe nível de `display`, `metric`, `caption` nem `label` — o número forte de um KPI é escrito à mão como `font-display text-lg font-bold sm:text-2xl` (painel/dashboard.tsx:79-84) ou `font-display text-xl font-bold sm:text-2xl` (erp/financeiro/summary.tsx:59) ou `font-display text-xl font-bold` (crm/oportunidades/board.tsx:277), três valores diferentes para o mesmo papel.

> **Correção:** Definir a escala em `@theme inline`: `--text-display`, `--text-h1`, `--text-h2`, `--text-h3`, `--text-body`, `--text-caption`, `--text-label`, `--text-metric` (com `--text-metric--line-height: 1` e `font-variant-numeric: tabular-nums`), cada um com line-height par. Depois trocar os 353 usos de text-sm/text-xs pelos papéis semânticos e proibir tamanho cru fora do @theme via lint.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:173`**

A escala de raios sobrescreve `--radius-xs` a `--radius-2xl` deslocando tudo dois passos para cima, mas deixa `--radius-3xl` (1.5rem) e `--radius-4xl` (2rem) nos defaults do Tailwind (node_modules/tailwindcss/theme.css:397-404). Resultado: `rounded-xl` (1.5rem) === `rounded-3xl` (1.5rem), `rounded-2xl` (2rem) === `rounded-4xl` (2rem), e a escala deixa de ser monotônica — `rounded-2xl` (2rem) é MAIOR que `rounded-3xl` (1.5rem). Além disso o `rounded` sem sufixo continua valendo `--radius: 0.25rem` (theme.css:508), um quinto valor fora da escala Tivexy, e está usado 12 vezes no app ao lado de rounded-md (0.75rem) e rounded-lg (1rem).

> **Correção:** Sobrescrever também `--radius-3xl` e `--radius-4xl` para manter a progressão, ou (melhor) abandonar os apelidos de tamanho e nomear por papel: `--radius-control` (botão/campo), `--radius-card`, `--radius-panel`, `--radius-pill`. Eliminar os 12 `rounded` sem sufixo.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:180`**

Existem quatro níveis de sombra (`--shadow-xs` a `--shadow-lg`, linhas 180-183) mas na prática a elevação é plana: no app inteiro há 18 usos de `shadow-xs`, 1 de `shadow-sm`, 1 de `shadow-lg` e ZERO de `shadow-md`. Card (ui/card.tsx:7), Button brand (ui/button.tsx:10), Button danger (ui/button.tsx:14) e ThemeToggle ativo (theme-toggle.tsx:99) usam todos `shadow-xs`, então card, botão e pílula ficam no mesmo plano. É uma das causas diretas da queixa de que a tela é plana e feia. Complementarmente, `--shadow-2xs`, `--shadow-xl` e `--shadow-2xl` ficaram nos defaults do Tailwind, que são preto puro `rgb(0 0 0 / …)` — contradizendo o comentário da linha 172 ("tinta azulada, nunca preto puro").

> **Correção:** Reescrever a elevação como papéis — `--shadow-card`, `--shadow-raised`, `--shadow-overlay` (dropdown/popover), `--shadow-modal` — e aplicá-los: card em raised, dropdown/tooltip em overlay, diálogo em modal. Sobrescrever também 2xs/xl/2xl com a tinta azulada, ou removê-los do alcance.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/button.tsx:5`**

O `cva` do botão não declara NENHUM estado de foco, de pressionado, nem de carregando. Só há `hover:` e `disabled:`. Foco depende inteiramente da regra global `:focus-visible` de globals.css:215-219 (outline 2px + offset 2px), que é a mesma para um link de texto e para um botão sólido — e que fica cortada quando o botão está dentro de um contêiner `overflow-hidden` (11 listas usam esse padrão). Estado `active:` não existe em lugar nenhum do sistema: a busca por `active:` no app retorna 1 ocorrência real, e é `lg:active:cursor-grabbing` no kanban (crm/oportunidades/board.tsx:331). Loading só existe acoplado a formulário, via `useFormStatus` em components/form/submit.tsx — qualquer botão cliente com trabalho assíncrono fica sem feedback.

> **Correção:** Adicionar ao cva base: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`, um `active:` por variante (translate-y-px + escurecer/clarear o fundo) e uma prop `carregando` que troca o conteúdo por `<Loader2 className="animate-spin"/>` mantendo a largura, com `aria-busy`. Reescrever `Submit` para delegar a essa prop em vez de duplicar o markup.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/button.tsx:10`**

A variante principal usa `hover:bg-[var(--tvx-blue-700)]` — valor cru, fora da camada semântica, e fixo para os dois temas. No tema claro `--surface-brand` é blue-600 (#1648a6) e o hover blue-700 (#103b8a) escurece, o que está certo. No tema escuro `--surface-brand` vira blue-500 (#2360d4, globals.css:99) e o hover continua indo para blue-700 (#103b8a), ou seja, o botão ESCURECE ao passar o mouse no tema escuro, quando deveria clarear. É o botão de ação primária do sistema inteiro se comportando ao contrário em metade dos temas.

> **Correção:** Criar `--surface-brand-hover` na camada semântica (blue-700 no claro, blue-300/400 no escuro) e usar `hover:bg-surface-brand-hover`. Mesmo tratamento para `--surface-brand-active`.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/button.tsx:14`**

A variante `danger` é `bg-danger text-white`. No tema escuro `--state-danger` é #ff8378 (globals.css:116), um salmão claro; texto branco sobre #ff8378 dá cerca de 2,2:1 de contraste, muito abaixo do mínimo de 4,5:1. O mesmo defeito está no selo de avisos não lidos: components/shell/notification-bell.tsx:31 usa `bg-danger ... text-white`. Os dois são elementos de alerta, exatamente os que precisam ser lidos.

> **Correção:** Criar `--content-on-danger` na camada semântica (branco no claro, `--tvx-ink-900` no escuro) e trocar `text-white` por `text-content-on-danger` nos dois lugares. Conferir o mesmo para `bg-success`/`bg-warning` caso ganhem variante sólida.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/button.tsx:9`**

Não há ênfase visual nenhuma no produto. A variante `brand` (a primária) aparece explicitamente 1 vez em todo o app (src/app/not-found.tsx:23) e mais 6 vezes implicitamente via `buttonVariants()` sem argumento. Contra isso: `variant="ghost"` 42 vezes e `variant="outline"` 29 vezes. Setenta e um botões sem preenchimento contra sete com. Nenhuma tela tem um ponto focal de ação — é literalmente a queixa do dono sobre a tela ser feia e sem hierarquia, mensurável em contagem de variantes.

> **Correção:** Definir a regra "uma ação primária por tela" e aplicá-la: o botão principal de cada PageHeader (novo produto, nova venda, novo lead, convidar, registrar movimentação) passa a `brand`. Manter `outline` para ações secundárias e `ghost` só para ícones dentro de linhas e para o header.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:205`**

A regra de base força Manrope + `letter-spacing: -0.02em` em TODO h1, h2, h3 e h4, sem distinguir título de vitrine de título de interface. O próprio código já documenta que isso quebra em 16px: o comentário de components/ui/card.tsx:17-22 explica que "Plano e módulos" virava "Planoemódulos", e o CardTitle precisa desfazer a regra global com `font-sans ... tracking-normal` (card.tsx:26). Mas components/page/empty-state.tsx:28 renderiza `<h2 className="font-medium text-content">` SEM desfazer — ou seja, todo título de estado vazio do sistema (o componente usado em praticamente toda lista) cai exatamente no defeito que o card documenta: Manrope com -0,02em em 16px.

> **Correção:** Tirar a regra de h1-h4 da camada base. Manrope passa a ser opt-in via `font-display`, aplicada só em PageHeader (page/header.tsx:22) e no número de KPI. Corrigir empty-state.tsx:28 com o mesmo `font-sans tracking-normal` do CardTitle, ou melhor, com o token `--text-h3` da escala nova.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/dashboard.tsx:57`**

Existem CINCO implementações independentes e mutuamente incompatíveis do cartão de KPI, nenhuma delas primitivo: `Indicador` em painel/dashboard.tsx:57 (bg-surface-subtle, text-lg→2xl, sem ícone), `Cartao` em erp/estoque/levels.tsx:37 (bg-surface-raised, text-xl→2xl, com ícone, é link/filtro), `Cartao` em erp/financeiro/summary.tsx:35 (idêntico ao anterior mas com href opcional), `SalesSummary` em erp/vendas/sale-rows.tsx:30-79 (mesmo visual escrito inline como <dl>, sem ícone), `Resumo` em crm/oportunidades/board.tsx:257 (px-4 py-3 + shadow-xs, layout em linha de base). Três paddings diferentes, três tamanhos de número diferentes, dois fundos diferentes. E o mais importante: NENHUMA das cinco mostra variação contra o período anterior nem sparkline — que é justamente o alvo visual definido pelo dono ("rótulo + número forte + variação + sparkline"). O único lugar que calcula comparação é `comparacaoSemanal` em src/lib/painel/dashboard.ts, e o resultado é jogado em texto corrido por `variacaoEmTexto` (dashboard.tsx:160-164).

> **Correção:** Criar `src/components/ui/stat.tsx` com um só componente: rótulo, ícone opcional, valor (token `--text-metric`, tabular-nums), delta com seta e cor (`+12,4% vs período anterior`), sparkline SVG opcional e `href` opcional para virar filtro. Substituir as cinco implementações. A sparkline pode reusar a matemática já existente em painel/sales-chart.tsx:44.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/admin/clientes/[id]/forms.tsx:114`**

Não existe primitivo de diálogo, e por isso TODA confirmação destrutiva do sistema é `window.confirm` nativo — 10 ocorrências: admin/clientes/[id]/forms.tsx:114 (suspender empresa) e :216 (trocar plano), automacoes/rules.tsx:173 (excluir regra), configuracoes/forms.tsx:205 (excluir tipo), crm/oportunidades/funis/editor.tsx:66, equipe/team-forms.tsx:293 (remover membro), erp/financeiro/entry-rows.tsx:106, erp/produtos/categorias/categories.tsx:86, erp/produtos/[id]/status-actions.tsx:59 (apagar produto), erp/vendas/[id]/cancel-form.tsx:28 (cancelar venda). O `confirm` nativo ignora o tema, ignora a tipografia, trava a thread, não aceita o verbo destrutivo em destaque, e pode ser suprimido pelo navegador ("não deixar este site criar mais diálogos") — quando suprimido, ele retorna false e a ação silenciosamente não acontece.

> **Correção:** Criar `src/components/ui/dialog.tsx` sobre `<dialog>` nativo (`showModal()` já dá foco preso, Esc e backdrop) com `AlertDialog` derivado: título, corpo, botão destrutivo `variant="danger"` e cancelar `variant="outline"`. Trocar as 10 chamadas.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/shell/user-menu.tsx:74`**

O único menu suspenso do sistema é feito à unha. Ele tem `role="menu"` e `role="menuitem"` (linhas 75, 96, 118, 129) mas não implementa o padrão de menu: não há navegação por seta para cima/baixo, não há roving tabindex, não há Home/End, não há retorno de foco ao gatilho quando fecha com Esc, e o fechamento por clique fora usa `pointerdown` no document (linha 44) sem verificar se o alvo é o próprio gatilho — clicar no gatilho com o menu aberto dispara o fechamento e o toggle na mesma interação. Anunciar `role="menu"` sem o teclado do menu é pior para leitor de tela do que não anunciar.

> **Correção:** Extrair `src/components/ui/dropdown-menu.tsx` com o padrão completo (setas, Home/End, Esc devolvendo foco, fechamento por clique fora que ignora o gatilho) e reusar no UserMenu. Se não houver apetite para o teclado completo, trocar `role="menu"` por um grupo de links comum, que é honesto.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/erp/vendas/sale-form.tsx:331`**

O buscador de produtos da tela de venda é um combobox feito à mão: um `<Input>` (linha ~318) seguido de uma `<ul>` de `<button>` (linhas 331-348) que aparece quando há resultados. Não tem `role="combobox"`, `aria-expanded`, `aria-controls`, `role="listbox"`/`role="option"` nem `aria-activedescendant`. Para leitor de tela, a lista de resultados simplesmente não está associada ao campo — a pessoa digita e nada é anunciado. É a tela mais crítica do ERP (é ela que registra dinheiro) e é a que tem o widget mais complexo sem primitivo.

> **Correção:** Criar `src/components/ui/combobox.tsx` com o padrão ARIA 1.2 de combobox com listbox (setas navegam, Enter escolhe, Esc fecha, `aria-activedescendant` acompanha) e usar em sale-form.tsx. O mesmo primitivo serve para a busca global com Ctrl+K que o alvo visual pede e que hoje não existe em lugar nenhum (busca por `ctrl+k`, `cmdk`, `metaKey` no app retorna zero).

#### Gravidade média

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/input.tsx:31`**

O primitivo `Select` existe (input.tsx:31-44) mas duas telas ignoram e escrevem `<select>` cru copiando as classes: admin/clientes/novo/new-client-form.tsx:88-94 (`h-9.5 w-full rounded-md border border-line-field bg-surface px-3 text-sm text-content` — cópia quase literal, mas com `px-3` onde o primitivo usa `px-2.5`) e crm/leads/convert-form.tsx:107-112 (`h-8 ... px-2 text-xs` — um tamanho compacto que o primitivo não oferece). Como o primitivo não tem variante de tamanho, quem precisa de um campo pequeno abandona o primitivo. Além disso Input usa `px-3` (linha 8) e Select usa `px-2.5` (linha 35): lado a lado num filtro, o texto dos dois não alinha.

> **Correção:** Dar a Input/Select/Textarea um `size` compartilhado (`sm` h-8 / `md` h-9.5 / `lg` h-11, já que sale-form.tsx:324 também pede h-11 à mão) com o mesmo padding horizontal em ambos, e converter os dois `<select>` crus.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/form/field.tsx:14`**

O `Field` sempre renderiza um `<Label>` visível acima de um empilhamento vertical, e não aceita rótulo oculto nem layout em grade. Por isso todo formulário denso o abandona e reescreve a peça: crm/leads/lead-form.tsx:146-195 é uma cópia completa de Field + describedBy (mesmo `flex flex-col gap-1.5`, mesmo `(opcional)`, mesmos ids `-erro`/`-dica`), automacoes/rule-editor.tsx:295-315 monta Label sr-only + Select + `<p role="alert" id={...-erro}>` na mão, e erp/vendas/formas/payment-methods.tsx:42 e rule-editor.tsx:333 montam grades de campos sem Field. São quatro reimplementações do mesmo contrato de acessibilidade, cada uma podendo errar o `aria-describedby` de um jeito diferente.

> **Correção:** Estender Field com `rotuloOculto?: boolean` e `orientacao?: 'vertical' | 'inline'`, e expor um `FieldRow`/`FieldGroup` para grades. Depois deletar `Campo` de lead-form.tsx:146 e converter rule-editor e payment-methods.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/form/messages.tsx:9`**

`FormError`/`FormSuccess` existem, mas o padrão de retorno de formulário foi reimplementado em volta deles quatro vezes com o nome `Retorno` (admin/clientes/[id]/forms.tsx:14, configuracoes/forms.tsx:17, crm/oportunidades/funis/editor.tsx:26, equipe/team-forms.tsx:70), e o erro em si tem duas aparências concorrentes: `bg-danger-soft` (o token, em messages.tsx:13, convite/accept-form.tsx:45) contra `bg-danger/10` (mistura na hora, em (auth)/form-parts.tsx:19, admin/clientes/novo/new-client-form.tsx:81, admin/failed-runs.tsx:61, crm/leads/lead-form.tsx:94, crm/leads/convert-form.tsx:97). As duas não dão a mesma cor: no tema escuro `--state-danger-soft` é `rgb(217 70 58 / 0.16)` e `bg-danger/10` é `#ff8378` a 10%, salmão claro. O mesmo erro aparece com duas cores dependendo da tela.

> **Correção:** Um único `<FormFeedback estado={...}/>` em components/form/messages.tsx que resolve erro/ok/aviso, usado nas quatro telas. Substituir todos os `bg-danger/10` por `bg-danger-soft` e proibir a mistura com opacidade sobre tokens de estado.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/form/submit.tsx:14`**

`Submit` existe e resolve o clique duplo, mas foi reimplementado três vezes com o mesmo corpo: (auth)/form-parts.tsx:45 (`Enviar`), crm/leads/lead-form.tsx:24 (`Enviar`) e crm/leads/convert-form.tsx:23 (`Enviar`). Os três repetem `useFormStatus` + `Loader2 animate-spin`, cada um com um tamanho de ícone diferente (form-parts usa `size-4` explícito, Submit confia no `[&_svg]:size-4` do botão).

> **Correção:** Deletar as três cópias e importar `Submit`. Se (auth) precisa de largura total e size lg, passa por props — `<Submit className="w-full" size="lg">`.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/crm/oportunidades/board.tsx:287`**

A função `iniciais()` de components/ui/avatar.tsx:4 está copiada verbatim em crm/oportunidades/board.tsx:287-292 (mesmo split, mesmo `.at(-1)`, mesmo `toLocaleUpperCase('pt-BR')`), e o próprio Avatar está reimplementado duas vezes como span solto: board.tsx:392-396 (`size-6 rounded-full bg-surface-accent-soft text-[0.625rem] font-semibold text-content-accent` — que é exatamente `<Avatar tamanho="sm">`) e components/shell/user-menu.tsx:63-68 (`size-6 rounded-full bg-surface-brand text-[0.625rem]`, com o detalhe de que aqui as "iniciais" são `email.slice(0, 2)`, linha 52, não iniciais de nome).

> **Correção:** Importar `Avatar` e `iniciais` nos dois lugares e apagar a cópia de board.tsx:287. O Avatar precisa ganhar uma variante de tom (`accent` | `brand`) para cobrir o caso do UserMenu, e um tamanho `xs` se `size-6` não bastar.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/erp/estoque/filters.tsx:12`**

Não existe primitivo de abas nem de grupo segmentado, e o padrão foi reinventado em cinco lugares com três aparências diferentes. Abas com sublinhado: erp/estoque/filters.tsx:12-37 (`StockTabs`) e erp/financeiro/summary.tsx:201-228 (`FinanceTabs`) — mesmo markup, um com `overflow-x-auto` e outro sem. Pílulas: crm/atividades/page.tsx:101-119 (links `rounded-full border px-3 py-1 text-xs`), crm/oportunidades/page.tsx:217-233 (links `rounded-full border px-3 py-1 text-sm` — mesmo padrão, tamanho de texto diferente) e crm/oportunidades/board.tsx:141-160 (botões `h-8 rounded-full border px-3 text-xs` com `aria-pressed`, não `aria-current`). Três semânticas (`aria-current="page"`, `aria-pressed`, `aria-current="true"` em erp/estoque/levels.tsx:57) para a mesma ideia de "este filtro está ativo".

> **Correção:** Criar `src/components/ui/tabs.tsx` (abas de navegação por URL, com sublinhado) e `src/components/ui/segmented.tsx` (grupo de pílulas, com `aria-pressed` para estado de cliente e `aria-current` para link). Converter os cinco. O seletor 7/30/90 dias do alvo visual sai do mesmo `Segmented`.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/erp/estoque/levels.tsx:182`**

Não há primitivo de tooltip, e o sistema usa o `title=` nativo em 10 lugares como substituto: erp/estoque/levels.tsx:182 e :190 (botões de ícone "Entrada" e "Contagem", que são AÇÕES só com ícone), automacoes/rule-editor.tsx:410, avisos/notification-list.tsx:78, crm/oportunidades/funis/editor.tsx:79 e :168, crm/oportunidades/board.tsx:392, crm/leads/convert-form.tsx:65, painel/dashboard.tsx:139, theme-toggle.tsx:94, notification-bell.tsx:24. O `title` nativo demora ~1s para aparecer, não aparece no toque, não aparece no foco por teclado, e não respeita o tema — é invisível para quem navega por teclado justamente nos botões que não têm rótulo de texto.

> **Correção:** Criar `src/components/ui/tooltip.tsx` (aparece no hover e no focus-visible, `role="tooltip"` ligado por `aria-describedby`, Esc fecha) e trocar os `title` que acompanham ação. Onde o `title` só duplica o `aria-label` (notification-bell.tsx:24), pode simplesmente sair.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/loading.tsx:10`**

Existe um único esqueleto no sistema inteiro — src/app/(app)/loading.tsx — e não há nenhum primitivo `Skeleton` nem um único `<Suspense>` no app (a busca por `Suspense` em src/app retorna zero). Consequência: qualquer navegação apaga a tela inteira e mostra um esqueleto genérico de três cartões em `max-w-5xl`, que não tem a forma de nenhuma das telas reais (as listas são `max-w-4xl` com linhas, não cartões). Nada carrega em pedaço: painel, gráfico, lista e painéis laterais chegam todos juntos ou nenhum chega.

> **Correção:** Criar `src/components/ui/skeleton.tsx` (bloco com o `animate-pulse` e o raio do sistema) e usar `<Suspense>` por seção no painel e nas listas, com esqueletos que copiam a forma real: `SkeletonStat`, `SkeletonRow`, `SkeletonChart`.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/painel/sales-chart.tsx:159`**

Só existem duas `<table>` no app inteiro (painel/sales-chart.tsx:159 e erp/financeiro/cashflow-chart.tsx:258), as duas escondidas dentro de um `<details>` como alternativa textual ao gráfico. Nenhuma lista de dados usa tabela: as 10 listas do sistema são `<ul>` de `<Link>` (erp/produtos/product-rows.tsx:68, erp/vendas/sale-rows.tsx:133, erp/financeiro/entry-rows.tsx:204, erp/estoque/levels.tsx:148, crm/contatos/contact-rows.tsx:19, crm/empresas/company-rows.tsx:17, crm/leads/page.tsx:172, crm/atividades/agenda.tsx:104, equipe/page.tsx:112, erp/vendas/sale-form.tsx:363), com o mesmo contêiner copiado literalmente em todas: `overflow-hidden rounded-lg border border-line-subtle bg-surface-raised`. Cada linha tem ~60px de altura e empilha três textos, o que é legítimo no celular mas desperdiça a tela num monitor largo e impede ordenar por coluna.

> **Correção:** Criar `src/components/ui/table.tsx` (cabeçalho fixo, zebra opcional, coluna numérica alinhada à direita com tabular-nums, ordenação por link de URL) e um `ListRow` que encapsule o contêiner repetido. As listas densas (produtos, vendas, lançamentos, estoque) viram tabela a partir de `lg`, mantendo o formato de linha no celular.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/erp/produtos/product-rows.tsx:68`**

As 11 listas usam `overflow-hidden` no contêiner (product-rows.tsx:68 e as outras 10 citadas acima). O anel de foco global é `outline: 2px solid + outline-offset: 2px` (globals.css:216-217), e outline com offset positivo é desenhado FORA da caixa — o `overflow-hidden` do pai corta esse anel nas bordas esquerda e direita de toda linha, e em cima/embaixo na primeira e na última. As linhas tentam compensar com `focus-visible:bg-surface-subtle` (product-rows.tsx:77, contact-rows.tsx:28, company-rows.tsx:26, sale-rows.tsx:142), que é a mesma cor do hover — quem navega por teclado não distingue "o mouse está aqui" de "o foco está aqui".

> **Correção:** Trocar `overflow-hidden` por arredondamento nas linhas de ponta (`first:rounded-t-lg last:rounded-b-lg`), ou usar `outline-offset: -2px` dentro de lista. E dar ao foco um tratamento distinto do hover (barra de acento à esquerda, ou anel interno).

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:185`**

Os tokens de movimento existem mas quase ninguém os usa: `--ease-standard` aparece uma única vez no app inteiro (components/ui/button.tsx:6) e `--ease-out` zero vezes fora dos próprios keyframes. Não há token de duração — há 10 `duration-150` escritos à mão e 34 `transition-colors` sem duração nenhuma (caem no default do Tailwind). O vocabulário de movimento do produto inteiro é: uma transição de cor de 150ms, um fade-in de 280ms em lista (`animate-enter`, 25 usos), uma barra que cresce (`animate-grow`, 5) e uma que enche (`animate-fill`, 2). Só 1 `transition-transform` e 1 `transition-shadow` no sistema todo — nada se move, nada se eleva. É a queixa do dono sobre as animações, em números.

> **Correção:** Criar `--duration-fast/base/slow` no @theme e aplicar junto com `--ease-standard` num utilitário `transition-base`. Adicionar elevação no hover de cartão clicável (`hover:shadow-raised` + `hover:-translate-y-px`) e transição de transform nos itens de kanban e nos cartões de KPI.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:245`**

O `animate-enter` é aplicado em 25 lugares — inclusive em cada `<li>` de lista, com `animationDelay` calculado inline (`Math.min(i, 10) * 20ms` em product-rows.tsx:72, e equivalentes nas outras listas). Como a navegação é server-side com links, trocar de página na paginação, aplicar um filtro ou voltar pelo botão do navegador remonta a lista inteira e re-executa a cascata de fade-in do zero, toda vez. Um fade de entrada escalonado é agradável na primeira vez e irritante na décima — quem filtra estoque três vezes seguidas vê a mesma coreografia três vezes.

> **Correção:** Limitar `animate-enter` ao primeiro carregamento da rota (ou a itens realmente novos, como o resultado de uma ação), e não a toda renderização de lista. Alternativa barata: manter o fade mas remover o `animationDelay` escalonado das listas paginadas.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/badge.tsx:17`**

O tom `mock` existe no Badge (linha 17), foi criado explicitamente para cumprir a regra inegociável do CLAUDE.md ("Mocks podem existir... desde que rotulados no código e na UI como MOCK, DEMO, STUB ou PLACEHOLDER"), e NUNCA é usado: a busca por `tone="mock"` em src/app e src/components retorna zero. Os tons usados são brand (8), warning (3), danger (2), success (1). O único sinal global de honestidade no produto é o selo `tone="warning"` com o texto "Em construção" em components/shell/app-shell.tsx:94-96 — que é vago e não aponta o que é simulado. Ou nada é simulado (e aí o primitivo é código morto), ou algo é simulado sem rótulo (e aí é violação direta da regra do repositório).

> **Correção:** Decidir e registrar: se não há mock, remover o tom ou documentar que é para uso futuro; se há, marcar cada ponto com `<Badge tone="mock">MOCK</Badge>`. Esta auditoria é de primitivos e não varreu os dados — quem auditar a dimensão de dados precisa cruzar isto.

#### Gravidade baixo

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/(app)/tutorial/page.tsx:153`**

Barra de progresso feita à mão em dois lugares diferentes, sem primitivo: tutorial/page.tsx:153-166 (`role="progressbar"` com aria-valuemin/max/now, trilha `h-2 rounded-full bg-surface-muted`, preenchimento `bg-success animate-fill`) e painel/dashboard.tsx:130-156 (`FunnelBars`, trilha `h-2.5 rounded-full bg-surface-muted`, preenchimento `bg-content-accent animate-fill`, SEM `role="progressbar"` e sem valor acessível — só o número ao lado em texto). Duas alturas, duas cores, uma com semântica e outra sem.

> **Correção:** Criar `src/components/ui/progress.tsx` com `valor`/`maximo`/`tom` e a semântica ARIA embutida, e usá-lo nos dois. As barras de funil do painel passam a ser `Progress` numa lista.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/app/globals.css:215`**

A regra global de foco define `border-radius: 0.25rem` dentro de `:focus-visible` (linha 218). Isso não ajusta o anel — muda o raio do próprio elemento enquanto ele está focado. Elementos com utilitário `rounded-*` estão protegidos (a camada `utilities` vence a `base`), mas qualquer elemento sem raio explícito — links de texto, `<summary>` em crm/oportunidades/board.tsx:404 e erp/financeiro/cashflow-chart.tsx:254, `<details>` em admin/clientes/[id]/history.tsx:92 — muda de forma no instante em que recebe foco.

> **Correção:** Remover `border-radius` da regra de `:focus-visible`. O outline já acompanha o raio do elemento nos navegadores atuais.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/card.tsx:14`**

O Card usa `p-5` (20px) em header, content e footer (linhas 14, 37, 43), mas o resto do sistema respira em p-3/p-4: a contagem de padding no app é p-4 29×, p-3 18×, p-5 4× (que são os próprios subcomponentes do Card). Um cartão de KPI com `p-3 sm:p-4` (erp/financeiro/summary.tsx:71) ao lado de um Card com `p-5` não alinha. Além disso o Card não tem variante de densidade e não tem slot de ação no header — quem quer título + link à direita tem de sobrescrever o layout, como painel/dashboard.tsx:104 (`CardHeader className="flex flex-row flex-wrap items-center justify-between"`).

> **Correção:** Alinhar o padding do Card ao passo do sistema (p-4, com `densidade="compacta"` em p-3) e adicionar um `CardAction` posicionado à direita no header, para o painel parar de reescrever o flex.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/shell/sidebar-nav.tsx:86`**

O rótulo de seção em versalete monoespaçado é um papel tipográfico real e recorrente, mas não tem token e aparece em três tamanhos arbitrários diferentes para o mesmo uso: `text-[0.6875rem]` em shell/sidebar-nav.tsx:86, crm/leads/page.tsx:163 e crm/atividades/agenda.tsx:95; `text-[0.625rem]` em shell/user-menu.tsx:88 e admin/clientes/novo/new-client-form.tsx:270; `text-xs` em automacoes/rule-editor.tsx:320. Há ainda `text-[10px]` em notification-bell.tsx:31 e `text-[11px]` nos rótulos dos dois gráficos (painel/sales-chart.tsx:97 e :129, erp/financeiro/cashflow-chart.tsx:152, :210, :229, :232).

> **Correção:** Definir `--text-eyebrow` (o rótulo mono em versalete) e `--text-micro` (selo e rótulo de eixo de gráfico) no @theme, e substituir os 16 tamanhos arbitrários. Um componente `SectionLabel` resolve o eyebrow de uma vez.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/button.tsx:6`**

A classe base do botão inclui `disabled:pointer-events-none`. Isso impede que o navegador mostre o `title` num botão desabilitado e impede qualquer tooltip futura de explicar POR QUE a ação está bloqueada — que é justamente quando a explicação importa. Já há uma tela que precisou contornar isso colocando o `title` num `<span>` irmão em vez de no controle: crm/leads/convert-form.tsx:65.

> **Correção:** Trocar por `disabled:cursor-not-allowed` (que é o que Input/Select/Textarea já fazem, input.tsx:11, :38, :53) e manter os eventos de ponteiro, para que o tooltip novo consiga explicar o bloqueio.

**`C:/Users/rurik/Repositorios/TivexyWebSite/apps/web/src/components/ui/avatar.tsx:24`**

`Avatar` só oferece `sm` (size-6) e `md` (size-9), só o tom accent (linha 31, `bg-surface-accent-soft text-content-accent`) e não aceita imagem. Isso já forçou duas reimplementações (user-menu.tsx:63 precisava de fundo brand, board.tsx:392 é uma cópia do tamanho sm) e não cobre o avatar maior das páginas de detalhe de contato e empresa.

> **Correção:** Adicionar `tamanho: 'xs' | 'sm' | 'md' | 'lg'`, `tom: 'accent' | 'brand' | 'neutral'` e suporte opcional a `src`. Depois converter os dois usos à mão.

