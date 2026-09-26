'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';
import type { Viewer } from '@tivexy/core';

import { SectionLabel } from '@/components/ui/section-label';
import { Tooltip } from '@/components/ui/tooltip';
import { statusLabel, visibleNavigation, type VisibleItem } from '@/config/navigation';
import type { Terms } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

/*
 * O modo colapsado é desenhado por CSS, não por estado.
 *
 * A coluna colapsada tem 64px e mostra só ícone. Tudo que reage a isso lê o
 * `data-collapsed` que o `AppShell` escreve no `<aside>` — que também carrega
 * `group/sidebar`. Assim o menu não re-renderiza para a coluna encolher, e a
 * gaveta mobile, que nunca colapsa, simplesmente não tem o atributo.
 *
 * As classes `group-data-[collapsed]/sidebar:*` estão escritas por extenso de
 * propósito: o Tailwind lê o arquivo como texto e só gera a classe que
 * encontra inteira. Montar o prefixo numa constante e concatenar produziria
 * CSS nenhum — e um modo colapsado que não colapsa.
 */

/*
 * 32px de altura: `py-1.5` sobre `text-label` (14px/1.3) dá 30px de caixa, e o
 * ícone de 16px cabe sem esticar a linha. É a densidade que faz caber o menu
 * inteiro mais o rodapé numa tela de 768px de altura.
 */
const itemBase = [
  'relative flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-label',
  /* Só cor: animar tamanho ou posição de item de menu produz lista tremendo. */
  'transition-[color,background-color] transition-base',
  'group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:px-0',
];

const iconeBase = 'size-4 shrink-0';

/**
 * A mesma linha do menu, para quem desenha o rodapé da sidebar.
 *
 * Avisos, conta, tema e colapso ficam a três pixels dos itens do menu, na
 * mesma coluna: se cada um escrever a própria altura e o próprio respiro, a
 * costura entre nav e rodapé aparece. Exportar a classe custa menos que um
 * componente com prop para cada caso — quem usa compõe com `cn()` e trata o
 * estado ativo por conta própria, que no rodapé é outra coisa (tema escolhido,
 * coluna colapsada) e não "você está aqui".
 */
export const classeDeItemDaSidebar = cn(itemBase);

/*
 * A barra de 3px à esquerda do item ativo.
 *
 * O DESIGN_SYSTEM pedia `--color-line-accent` aqui, e a medição desaconselhou:
 * esse token é `rgb(22 72 166 / 0.35)`, feito para borda de campo sobre
 * `--surface`. Composto sobre `--surface-accent-strong` (blue-100) ele dá
 * **1,80:1** — abaixo dos 3:1 que a WCAG 1.4.11 pede de um indicador não
 * textual, e na prática uma barra que não se enxerga. `--content-accent` dá
 * 6,72:1 no claro e 6,15:1 no escuro, e é a mesma tinta do ícone: barra e
 * ícone leem como um sinal só, em vez de dois azuis brigando.
 */
const barraAtiva = [
  /* Sem `content-['']`: a variante `before:` do Tailwind v4 já registra `--tw-content` como `""`. */
  'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px]',
  'before:-translate-y-1/2 before:rounded-e-pill before:bg-content-accent',
];

/** O rótulo some da vista na coluna colapsada, mas nunca do nome acessível. */
const rotuloBase = 'min-w-0 truncate group-data-[collapsed]/sidebar:sr-only';

/** O que o `Tooltip` injeta no gatilho — daí o gatilho ser elemento, não nó. */
type Gatilho = ReactElement<{ readonly 'aria-describedby'?: string }>;

/**
 * A dica que só existe com a coluna colapsada.
 *
 * Com a coluna aberta o rótulo está na tela, e uma dica repetiria o que já se
 * lê. Colapsada, ela repete o rótulo que o `sr-only` do link continua dando —
 * redundância curta para quem lê a tela, e a única forma de quem usa o
 * ponteiro descobrir o que o ícone significa. A alternativa, tirar o rótulo do
 * HTML e deixar a dica no lugar dele, deixaria o link sem nome acessível:
 * `aria-describedby` descreve, não nomeia.
 */
function ComDica({
  conteudo,
  ativa,
  children,
}: {
  conteudo: string;
  ativa: boolean;
  children: Gatilho;
}) {
  if (!ativa) return children;
  return (
    <Tooltip conteudo={conteudo} lado="direita" className="w-full">
      {children}
    </Tooltip>
  );
}

/** Por que este item não leva a lugar nenhum. É o texto da dica, não enfeite. */
function motivoDe(item: VisibleItem): string {
  if (item.status === 'blocked') {
    return item.blockedBy === undefined ? 'Bloqueado.' : `Bloqueado — ${item.blockedBy}`;
  }
  return 'Ainda não construído. Ver docs/PROJECT_STATE.md';
}

/**
 * Item que existe no menu mas ainda não leva a tela nenhuma.
 *
 * Era um `<span>` com `title=`: fora da ordem de tabulação, invisível no toque
 * e no teclado — justamente onde a explicação é a única coisa que o item tem a
 * oferecer. Agora é um `<button>` focável com `aria-disabled`, que é o par
 * certo: `disabled` de verdade tiraria o foco e levaria a dica junto.
 */
function ItemIndisponivel({ item }: { item: VisibleItem }) {
  const Icone = item.icon;

  return (
    <Tooltip conteudo={motivoDe(item)} lado="direita" className="w-full">
      <button
        type="button"
        aria-disabled="true"
        /* Sem `onClick`: botão sem ação não faz nada, que é exatamente o pedido. */
        className={cn(itemBase, 'cursor-not-allowed text-content-subtle')}
      >
        <Icone className={cn(iconeBase, 'opacity-60')} aria-hidden />
        <span className={rotuloBase}>{item.label}</span>
        {/* Colapsado não há 64px para ícone + marcador; ali a dica assume o recado. */}
        {item.status === 'blocked' ? (
          <Lock
            className="ml-auto size-3 shrink-0 opacity-60 group-data-[collapsed]/sidebar:hidden"
            aria-hidden
          />
        ) : (
          <span
            className="ml-auto size-1.5 shrink-0 rounded-pill bg-current opacity-40 group-data-[collapsed]/sidebar:hidden"
            aria-hidden
          />
        )}
        {/* Entra no nome do controle: "Leads (em construção)". O motivo vem na dica. */}
        <span className="sr-only">({statusLabel[item.status]})</span>
      </button>
    </Tooltip>
  );
}

function Item({
  item,
  colapsada,
  onNavigate,
}: {
  item: VisibleItem;
  colapsada: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icone = item.icon;

  if (item.status !== 'ready') return <ItemIndisponivel item={item} />;

  /* Sub-rota acende o pai: em `/crm/contatos/123` quem acende é "Contatos". */
  const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <ComDica conteudo={item.label} ativa={colapsada}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          itemBase,
          ativo
            ? ['bg-surface-accent-strong text-content', ...barraAtiva]
            : 'text-content-default hover:bg-surface-muted hover:text-content',
        )}
      >
        <Icone
          className={cn(iconeBase, ativo ? 'text-content-accent' : 'text-content-muted')}
          aria-hidden
        />
        <span className={rotuloBase}>{item.label}</span>
      </Link>
    </ComDica>
  );
}

/**
 * O menu desta pessoa, nesta empresa.
 *
 * Quem decide o que aparece e com que nome é `visibleNavigation()`, que é pura
 * e tem teste: a regra de acesso é a da rota, e o rótulo é o do vocabulário do
 * tenant. Aqui só se desenha.
 */
export function SidebarNav({
  viewer,
  terms,
  colapsada = false,
  onNavigate,
  className,
}: {
  viewer: Viewer;
  terms: Terms;
  /**
   * A coluna está no modo ícone.
   *
   * **Só decide o que o CSS não decide**: montar ou não a dica de cada item —
   * um `aria-describedby` não se liga e desliga por seletor. Todo o desenho do
   * modo colapsado continua vindo do `data-collapsed` do `<aside>`, para não
   * existirem duas verdades sobre a mesma largura.
   */
  colapsada?: boolean;
  /** Fechar a gaveta ao navegar. Sem gaveta, não existe. */
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3',
        'group-data-[collapsed]/sidebar:px-2',
        className,
      )}
    >
      {visibleNavigation(viewer, terms).map((grupo, indice) => (
        <div key={grupo.label ?? `grupo-${indice}`} className="flex flex-col gap-0.5">
          {grupo.label !== null && (
            <>
              {/*
               * `<div>`, não `<h2>`: o `<aside>` vem antes do `<main>` no DOM, e
               * quatro cabeçalhos de nível 2 antes do `<h1>` da página quebravam
               * a ordem de headings do documento inteiro. O `role="presentation"`
               * que a especificação cita seria redundante — um `<div>` não tem
               * semântica de título a remover —, e o nome da região já vem do
               * `aria-label` do `<nav>`.
               */}
              <SectionLabel className="px-2.5 pb-1 group-data-[collapsed]/sidebar:sr-only">
                {grupo.label}
              </SectionLabel>
              {/* Colapsada, o cabeçalho vira filete: o agrupamento sobrevive sem texto. */}
              <hr
                aria-hidden
                className="mx-2 mb-1 hidden border-t border-line-subtle group-data-[collapsed]/sidebar:block"
              />
            </>
          )}
          {grupo.items.map((item) => (
            <Item key={item.href} item={item} colapsada={colapsada} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}
