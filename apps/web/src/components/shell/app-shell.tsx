'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { MembershipStatus, Viewer } from '@tivexy/core';

import { BrandSymbol, Logo } from '@/components/brand/logo';
import { Breadcrumb, type DegrauDaTrilha } from '@/components/page/breadcrumb';
import { CommandMenu } from '@/components/shell/command-menu';
import { NotificationBell } from '@/components/shell/notification-bell';
import { SidebarFooter } from '@/components/shell/sidebar-footer';
import { SidebarNav } from '@/components/shell/sidebar-nav';
import { TenantSwitcher } from '@/components/shell/tenant-switcher';
import { UserMenu } from '@/components/shell/user-menu';
import { Button } from '@/components/ui/button';
import { ToastProvider } from '@/components/ui/toast';
import { utilityNavigation, visibleNavigation, type VisibleItem } from '@/config/navigation';
import type { TenantOption } from '@/lib/auth/active-tenant';
import type { Terms } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

/*
 * A casca, invertida.
 *
 * Antes: header de largura total levando o logo, `<aside>` nascendo abaixo
 * dele, `<main>` sem container. Agora: grade de duas colunas na raiz, a coluna
 * da esquerda com o logo e o contexto da empresa, e o header começando DEPOIS
 * dela — que é o desenho do alvo.
 *
 * O arquivo inteiro é cliente porque três coisas aqui são estado de navegador e
 * não de servidor: a gaveta, o colapso e o caminho atual. O conteúdo não paga
 * por isso — `children` chega pronto do Server Component do layout e atravessa
 * esta árvore sem ser reconstruído no navegador.
 *
 * ## Contrato com a `SidebarNav` (agente B desta onda)
 *
 * O `<aside>` é `group/sidebar` e carrega `data-collapsed="true|false"`. Quem
 * desenha item de menu esconde o rótulo com
 * `group-data-[collapsed=true]/sidebar:…`. Não existe prop de colapso: o
 * atributo é a fonte única, e é ele que também governa o rodapé daqui.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Faixa de largura
 *
 * Três faixas, e a do meio é a que não existia: entre 768 e 1023px — iPad em
 * retrato, janela dividida em desktop — não havia navegação nenhuma, só o
 * hambúrguer. Agora ali a coluna nasce em trilho de ícones.
 *
 * Os valores espelham os breakpoints `md` e `lg` do Tailwind. Ler por
 * `matchMedia` (e não por `innerWidth` num efeito) é o que mantém uma fonte só
 * para a decisão que o CSS já toma.
 * ──────────────────────────────────────────────────────────────────────────── */

type Faixa = 'gaveta' | 'trilho' | 'coluna';

const CONSULTA_COLUNA = '(min-width: 64rem)';
const CONSULTA_TRILHO = '(min-width: 48rem)';

function assinarFaixa(aoMudar: () => void): () => void {
  const coluna = window.matchMedia(CONSULTA_COLUNA);
  const trilho = window.matchMedia(CONSULTA_TRILHO);
  coluna.addEventListener('change', aoMudar);
  trilho.addEventListener('change', aoMudar);
  return () => {
    coluna.removeEventListener('change', aoMudar);
    trilho.removeEventListener('change', aoMudar);
  };
}

function lerFaixa(): Faixa {
  if (window.matchMedia(CONSULTA_COLUNA).matches) return 'coluna';
  return window.matchMedia(CONSULTA_TRILHO).matches ? 'trilho' : 'gaveta';
}

/* O servidor não tem janela. `coluna` é o caso mais comum e o mais barato de errar. */
const FAIXA_NO_SERVIDOR = (): Faixa => 'coluna';

/* ────────────────────────────────────────────────────────────────────────────
 * Preferência de colapso
 *
 * Estado externo ao React, como o tema: mora no `localStorage` e é lido por
 * `useSyncExternalStore`, que resolve SSR sem efeito-que-chama-setState e sem
 * descompasso de hidratação.
 *
 * `null` é um terceiro valor de verdade — "nunca decidi" —, e é o que deixa a
 * largura seguir a faixa da tela. Quem decide uma vez manda nas três faixas.
 * ──────────────────────────────────────────────────────────────────────────── */

const CHAVE_DO_COLAPSO = 'tivexy-sidebar-colapsada';

/** `undefined` = ainda não lida do storage. Depois disso, o valor vale para a aba. */
let colapsoEmMemoria: boolean | null | undefined;
const ouvintesDoColapso = new Set<() => void>();

function assinarColapso(aoMudar: () => void): () => void {
  ouvintesDoColapso.add(aoMudar);
  /* Outra aba trocou a preferência: `storage` só dispara entre abas. */
  const aoTrocarDeAba = (evento: StorageEvent) => {
    if (evento.key !== null && evento.key !== CHAVE_DO_COLAPSO) return;
    colapsoEmMemoria = undefined;
    aoMudar();
  };
  window.addEventListener('storage', aoTrocarDeAba);
  return () => {
    ouvintesDoColapso.delete(aoMudar);
    window.removeEventListener('storage', aoTrocarDeAba);
  };
}

function lerColapso(): boolean | null {
  if (colapsoEmMemoria === undefined) {
    try {
      const bruto = localStorage.getItem(CHAVE_DO_COLAPSO);
      colapsoEmMemoria = bruto === '1' ? true : bruto === '0' ? false : null;
    } catch {
      /* Navegação privada ou site-data bloqueado: sem preferência guardada. */
      colapsoEmMemoria = null;
    }
  }
  return colapsoEmMemoria;
}

const COLAPSO_NO_SERVIDOR = (): boolean | null => null;

function gravarColapso(valor: boolean): void {
  /* Em memória primeiro: sem storage a escolha ainda vale para esta sessão. */
  colapsoEmMemoria = valor;
  try {
    localStorage.setItem(CHAVE_DO_COLAPSO, valor ? '1' : '0');
  } catch {
    /* idem */
  }
  ouvintesDoColapso.forEach((ouvinte) => ouvinte());
}

/* ──────────────────────────────────────────────────────────────────────────── */

export interface AppShellProps {
  children: ReactNode;
  viewer: Viewer;
  email: string | null;
  empresa: TenantOption | null;
  empresas: readonly TenantOption[];
  /** O vocabulário do tenant, para o menu falar a língua do nicho. */
  terms: Terms;
  /**
   * O sino. `null` sem empresa escolhida — aviso é de uma empresa, e então não
   * há sino. `naoLidos: null` quando a contagem falhou: sino sem número.
   */
  avisos: { naoLidos: number | null } | null;
}

export function AppShell({
  children,
  viewer,
  email,
  empresa,
  empresas,
  terms,
  avisos,
}: AppShellProps) {
  const pathname = usePathname();
  const [gavetaAberta, setGavetaAberta] = useState(false);

  const faixa = useSyncExternalStore(assinarFaixa, lerFaixa, FAIXA_NO_SERVIDOR);
  const preferencia = useSyncExternalStore(assinarColapso, lerColapso, COLAPSO_NO_SERVIDOR);
  const colapsada = preferencia ?? faixa === 'trilho';

  /*
   * Fechar a gaveta ao trocar de rota — inclusive por voltar/avançar do
   * navegador. Ajustar estado durante a renderização é o padrão do React para
   * isso; um efeito aqui causaria uma renderização em cascata.
   */
  const [ultimoCaminho, setUltimoCaminho] = useState(pathname);
  if (pathname !== ultimoCaminho) {
    setUltimoCaminho(pathname);
    setGavetaAberta(false);
  }

  /*
   * A gaveta é `md:hidden`. Girar o tablet com ela aberta a esconderia por CSS
   * sem fechá-la — e o `<dialog>` continuaria modal, com a página atrás inerte
   * e sem véu visível para clicar.
   */
  if (gavetaAberta && faixa !== 'gaveta') setGavetaAberta(false);

  /*
   * O rodapé sai da mesma derivação do menu — regra de rota, vocabulário do
   * tenant —, e não de uma segunda lista escrita à mão dentro do desenho.
   */
  const utilidades = useMemo(
    () => utilityNavigation(viewer, terms, { empresas: empresas.length }),
    [viewer, terms, empresas.length],
  );

  /* Um degrau só: a seção. Ver `trilhaDoHeader`. */
  const trilha = useMemo(
    () => trilhaDoHeader(viewer, terms, pathname, utilidades),
    [viewer, terms, pathname, utilidades],
  );

  const papel = papelNaEmpresa(viewer);

  return (
    /*
     * A região `aria-live` é única no app inteiro, e é ela que tira da tela os
     * `FormSuccess` permanentes que se empilhavam dentro das linhas de lista.
     * Montada aqui, e não por página: duas regiões concorrentes fazem o leitor
     * de tela anunciar fora de ordem.
     */
    <ToastProvider>
      <div
        className={cn(
          'min-h-dvh bg-surface-page',
          'md:grid md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]',
          /*
           * A largura da coluna é decidida em CSS, não em JavaScript: assim ela
           * já nasce certa no HTML do servidor, sem o salto de um quadro que um
           * `style` calculado depois da hidratação produziria.
           *
           * Sem preferência, a faixa decide — trilho entre `md` e `lg`.
           */
          preferencia === null && 'md:max-lg:[--sidebar-w:var(--sidebar-w-collapsed)]',
          preferencia === true && 'md:[--sidebar-w:var(--sidebar-w-collapsed)]',
        )}
      >
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[var(--z-overlay)] focus:rounded-control focus:bg-surface-brand focus:px-4 focus:py-2 focus:text-label focus:text-content-on-brand"
        >
          Pular para o conteúdo
        </a>

        {/* Coluna 1. `h-dvh` + `sticky`: a navegação não rola junto com a página. */}
        <aside
          /*
           * Presença, não valor: o menu e o rodapé leem
           * `group-data-[collapsed]/sidebar:*`, e um `data-collapsed="false"`
           * satisfaz o seletor tanto quanto um `"true"` — a coluna aberta
           * nasceria colapsada.
           */
          data-collapsed={colapsada ? '' : undefined}
          className="group/sidebar sticky top-0 hidden h-dvh flex-col overflow-hidden border-r border-line-subtle bg-surface-panel md:flex"
        >
          <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-line-subtle">
            {/*
             * Só o símbolo, e só com a coluna aberta: no trilho de 64px quem
             * precisa aparecer é a empresa em que a pessoa está, não a nossa
             * marca. O wordmark inteiro vive na gaveta e na tela de entrada.
             */}
            {!colapsada && (
              <BrandSymbol className="ml-3 h-6 shrink-0 text-content-accent" label="Tivexy" />
            )}
            <TenantSwitcher
              empresa={empresa}
              empresas={empresas}
              papel={papel}
              colapsada={colapsada}
              className={cn('min-w-0', !colapsada && 'pl-0')}
            />
          </div>

          {/* O `<nav>` de dentro já rola sozinho; aqui só mora o id do `aria-controls`. */}
          <div id="navegacao-lateral" className="flex min-h-0 flex-1 flex-col">
            <SidebarNav viewer={viewer} terms={terms} colapsada={colapsada} />
          </div>

          <SidebarFooter
            itens={utilidades}
            avisos={avisos}
            colapsada={colapsada}
            idDaNavegacao="navegacao-lateral"
            aoAlternarColapso={() => gravarColapso(!colapsada)}
          />
        </aside>

        {/* Coluna 2. */}
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-[var(--z-header)] flex h-[var(--header-h)] shrink-0 items-center border-b border-line-subtle bg-surface-page/80 px-4 backdrop-blur sm:px-6 lg:px-8 2xl:px-10">
            {/* O mesmo teto do `<main>`: em 2560px o header não descola do conteúdo. */}
            <div className="mx-auto flex w-full max-w-[var(--content-max)] items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Abrir menu"
                  aria-expanded={gavetaAberta}
                  aria-controls="menu-lateral"
                  onClick={() => setGavetaAberta(true)}
                >
                  <Menu aria-hidden />
                </Button>
                <Breadcrumb trilha={trilha} />
              </div>

              {/*
               * A busca global, que não existia em lugar nenhum do produto —
               * eram ~1500px de header vazio em 1920px. Ela navega entre telas
               * e diz, no próprio rodapé, que busca em registros ainda não
               * existe; ver `command-menu.tsx`.
               */}
              <div className="flex min-w-0 flex-1 justify-center">
                <CommandMenu viewer={viewer} terms={terms} />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {avisos !== null && <NotificationBell naoLidos={avisos.naoLidos} />}
                <UserMenu email={email} />
              </div>
            </div>
          </header>

          {/*
           * O dono do gutter e do teto. É o que permitiu às telas trocarem 35
           * literais `mx-auto max-w-*` por `<Page variant>`: o teto interno é
           * da variante, a margem externa é daqui.
           */}
          <main
            id="conteudo"
            className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-6 sm:px-6 lg:px-8 2xl:px-10"
          >
            {children}
          </main>
        </div>

        <GavetaDeNavegacao
          aberta={gavetaAberta}
          aoFechar={() => setGavetaAberta(false)}
          empresa={empresa}
          empresas={empresas}
          papel={papel}
          avisos={avisos}
          utilidades={utilidades}
        >
          {/* `onNavigate` fecha a gaveta no clique do item — não um `onClick` no
              contêiner, que fecharia também no clique que errou o alvo. */}
          <SidebarNav viewer={viewer} terms={terms} onNavigate={() => setGavetaAberta(false)} />
        </GavetaDeNavegacao>
      </div>
    </ToastProvider>
  );
}

/**
 * A gaveta mobile, sobre o `<dialog>` nativo.
 *
 * `showModal()` dá de graça o que a versão anterior não tinha: foco preso
 * (antes o Tab caminhava para dentro do `<main>` escondido atrás do véu),
 * Escape, inércia do fundo, véu e devolução do foco ao gatilho. A entrada e a
 * saída são `@starting-style` + `transition-behavior: allow-discrete` — antes
 * o bloco era montado por `{aberta && …}` e a gaveta piscava na tela.
 *
 * Por viver na top layer, o elemento ignora `z-index`: a escala `--z-*` não se
 * aplica aqui.
 */
function GavetaDeNavegacao({
  aberta,
  aoFechar,
  empresa,
  empresas,
  papel,
  avisos,
  utilidades,
  children,
}: {
  aberta: boolean;
  aoFechar: () => void;
  empresa: TenantOption | null;
  empresas: readonly TenantOption[];
  papel: string | null;
  avisos: { naoLidos: number | null } | null;
  utilidades: readonly VisibleItem[];
  children: ReactNode;
}) {
  const gaveta = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const elemento = gaveta.current;
    if (elemento === null) return;
    if (aberta && !elemento.open) elemento.showModal();
    else if (!aberta && elemento.open) elemento.close();
  }, [aberta]);

  /*
   * O modal deixa o fundo inerte, mas a roda do mouse ainda rola a página
   * atrás. Sem barra de rolagem visível no mobile não há compensação de
   * largura a fazer — diferente do `Dialog`, que abre em desktop.
   */
  useEffect(() => {
    if (!aberta) return;
    const corpo = document.body;
    const anterior = corpo.style.overflow;
    corpo.style.overflow = 'hidden';
    return () => {
      corpo.style.overflow = anterior;
    };
  }, [aberta]);

  return (
    <dialog
      ref={gaveta}
      id="menu-lateral"
      aria-label="Menu de navegação"
      /* Escape e o véu fecham pelo elemento; o estado de quem controla precisa saber. */
      onClose={aoFechar}
      onClick={(evento) => {
        /* Clique no véu chega com o alvo no próprio `<dialog>`. */
        if (evento.target === evento.currentTarget) aoFechar();
      }}
      className={cn(
        'fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-72 max-w-[85vw] flex-col overflow-hidden p-0 md:hidden',
        'border-r border-line-subtle bg-surface-panel text-content-default shadow-modal',
        /* Fechado, o agente aplica `display: none`; só o estado aberto vira flex. */
        'open:flex',
        'backdrop:bg-[rgb(11_20_36/0.55)] dark:backdrop:bg-[rgb(2_5_12/0.7)]',
        'backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-[var(--duration-fast)] backdrop:ease-[var(--ease-standard)]',
        'open:backdrop:opacity-100 starting:open:backdrop:opacity-0',
        /*
         * O estado base é o fechado, e é dele que saem duração e curva da
         * SAÍDA: a transição usa o tempo do estado de destino. Entrar demora
         * 240ms e desacelera; sair leva 150ms e acelera.
         */
        '-translate-x-full opacity-0',
        'transition-[opacity,translate,overlay,display] transition-discrete',
        'duration-[var(--duration-fast)] ease-[var(--ease-in)]',
        'open:translate-x-0 open:opacity-100',
        'open:duration-[var(--duration-base)] open:ease-[var(--ease-out)]',
        'starting:open:-translate-x-full starting:open:opacity-0',
      )}
    >
      <div className="flex h-[var(--header-h)] shrink-0 items-center justify-between gap-2 border-b border-line-subtle pl-3">
        <Logo className="text-content" />
        <Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={aoFechar}>
          <X aria-hidden />
        </Button>
      </div>

      {/*
       * `lista`, não `menu`: o painel do dropdown iria para um portal no
       * `<body>`, fora da top layer deste `<dialog>` — apareceria atrás do véu
       * e não receberia clique.
       */}
      <TenantSwitcher
        empresa={empresa}
        empresas={empresas}
        papel={papel}
        apresentacao="lista"
        aoNavegar={aoFechar}
        className="shrink-0 border-b border-line-subtle"
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

      {/* Sem botão de colapso: não há coluna para recolher dentro de uma gaveta. */}
      <SidebarFooter itens={utilidades} avisos={avisos} colapsada={false} aoNavegar={aoFechar} />
    </dialog>
  );
}

/**
 * A trilha do header: em que seção do produto a pessoa está.
 *
 * Um degrau só, de propósito. O segundo degrau seria o nome do registro aberto,
 * e esta casca não o conhece — derivá-lo do caminho imprimiria um UUID na tela.
 * Quem sabe o nome é a página, e é o `trilha` do `PageHeader` que o desenha.
 *
 * A autoridade sobre o rótulo é `visibleNavigation()`, a mesma do menu: título
 * e item de menu leem o mesmo vocabulário do tenant, e não têm como discordar.
 */
function trilhaDoHeader(
  viewer: Viewer,
  terms: Terms,
  pathname: string,
  /* O rodapé entra na busca: sem ele, `/conta` e `/avisos` ficariam sem trilha. */
  utilidades: readonly VisibleItem[],
): readonly DegrauDaTrilha[] {
  const candidatos = [
    ...visibleNavigation(viewer, terms).flatMap((grupo) => grupo.items),
    ...utilidades,
  ];

  let achado: VisibleItem | undefined;
  for (const item of candidatos) {
    if (pathname !== item.href && !pathname.startsWith(`${item.href}/`)) continue;
    /* O mais específico ganha: `/erp/vendas/nova` é Vendas, não Visão geral. */
    if (achado === undefined || item.href.length > achado.href.length) achado = item;
  }
  return achado === undefined ? [] : [{ rotulo: achado.label }];
}

/*
 * `satisfies`: um estado de vínculo novo no Core tem de parar a compilação
 * aqui, e não sair da tela em silêncio.
 */
const SITUACAO_DO_VINCULO = {
  active: null,
  invited: 'Convite pendente',
  suspended: 'Acesso suspenso',
} satisfies Record<MembershipStatus, string | null>;

/**
 * A segunda linha do seletor de empresa.
 *
 * O papel de verdade (`roles.name`) não chega à sessão: `current_viewer()`
 * devolve permissões, não o nome do cargo. Então aqui se diz o que de fato se
 * sabe — quem está acima do tenant, e quem ainda não tem acesso pleno a ele. É
 * menos do que o desenho pedia, e é o que existe.
 */
function papelNaEmpresa(viewer: Viewer): string | null {
  if (viewer.isSuperAdmin) return 'Super Admin';
  if (viewer.membershipStatus === null) return null;
  return SITUACAO_DO_VINCULO[viewer.membershipStatus];
}
