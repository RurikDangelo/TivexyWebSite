import Link from 'next/link';
import type { KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

export interface ItemSegmentado<Chave extends string = string> {
  chave: Chave;
  /** Texto visível — é também o nome acessível. Escreva "7 dias", não "7d". */
  rotulo: string;
}

export interface ItemSegmentadoLink<Chave extends string = string> extends ItemSegmentado<Chave> {
  href: string;
}

interface SegmentedComum {
  /** Nome acessível do controle: o que o leitor de tela anuncia antes das opções. */
  rotulo: string;
  className?: string;
}

export interface SegmentedLinkProps<Chave extends string = string> extends SegmentedComum {
  como: 'link';
  itens: readonly ItemSegmentadoLink<Chave>[];
  /** `NoInfer`: a chave ativa tem de existir em `itens`, ou nada fica escolhido. */
  ativa: NoInfer<Chave>;
}

export interface SegmentedBotaoProps<Chave extends string = string> extends SegmentedComum {
  como: 'botao';
  itens: readonly ItemSegmentado<Chave>[];
  ativa: NoInfer<Chave>;
  /**
   * Obrigatório, ao contrário do rascunho da seção 7. Um grupo de botões sem
   * para onde mandar a escolha é um controle morto, e o compilador é o lugar
   * barato de descobrir isso.
   */
  aoTrocar: (chave: Chave) => void;
}

export type SegmentedProps<Chave extends string = string> =
  SegmentedLinkProps<Chave> | SegmentedBotaoProps<Chave>;

/*
 * Trilho afundado. É ele que faz a opção escolhida parecer levantada — sem o
 * fundo mais baixo, "escolhido" viraria só uma cor de texto diferente.
 *
 * Rola no eixo x quando a lista não cabe (o seletor de funil pode ter oito):
 * embrulhar em duas linhas partiria o trilho no meio e destruiria as pontas
 * arredondadas.
 */
const TRILHO =
  'inline-flex max-w-full items-center overflow-x-auto rounded-pill border border-line-subtle bg-surface-sunken p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * Uma pílula do trilho. Sem `gap` entre elas de propósito: segmento encostado
 * em segmento é o que separa um controle segmentado de uma fileira de chips —
 * e era como as três versões anteriores, todas com borda própria, liam.
 *
 * 32px de altura (8px de toque a mais que o mínimo de 24), uma só — as três
 * pílulas que este componente substitui tinham três alturas diferentes.
 */
function pilula(ativo: boolean): string {
  return cn(
    'inline-flex h-8 shrink-0 items-center justify-center rounded-pill px-3 text-label whitespace-nowrap',
    'transition-[color,background-color,box-shadow] transition-base',
    /* O trilho rola no eixo x, o que faz o navegador recortar o y junto. */
    'focus-visible:-outline-offset-2',
    ativo
      ? /*
         * No escuro `--shadow-card` é `none` por contrato (seção 5): lá a
         * elevação é superfície, não sombra. Só que navy-900 sobre navy-990 é
         * um degrau curto para carregar sozinho o estado escolhido, então a
         * pílula ativa toma emprestado o anel de luz de `raised`.
         */
        'bg-surface-panel text-content shadow-card dark:shadow-raised'
      : 'text-content-muted hover:text-content',
  );
}

/**
 * Escolha única dentro da tela: período de 7/30/90 dias, funil, recorte de lista.
 *
 * Duas encarnações, porque são duas coisas diferentes:
 * - `como="link"` — a escolha vive no endereço (`?periodo=30d`). Links de
 *   verdade, `aria-current`, zero JavaScript, funciona antes de hidratar.
 * - `como="botao"` — a escolha vive no estado do pai. Grupo de rádio ARIA
 *   completo, com setas, Home/End e foco acompanhando a seleção.
 *
 * Substitui as três pílulas divergentes do sistema (board, agenda e funis),
 * que tinham três alturas e duas semânticas — `aria-pressed` em link, que é
 * justamente o atributo errado quando a escolha é um endereço.
 *
 * Note que o arquivo **não** é `'use client'`. O risco R5 do contrato reserva
 * a fronteira de cliente a Tooltip, Dialog, DropdownMenu, Combobox, Toast e
 * CommandMenu; marcar este módulo arrastaria a variante de link — que é o
 * seletor de período do painel — para o cliente sem necessidade nenhuma. A
 * variante de botão só é alcançável a partir de quem já é cliente, porque
 * `aoTrocar` é uma função e função não atravessa a fronteira do servidor.
 */
export function Segmented<Chave extends string>(props: SegmentedProps<Chave>) {
  if (props.itens.length === 0) return null;

  return props.como === 'link' ? <SegmentedLinks {...props} /> : <SegmentedRadios {...props} />;
}

function SegmentedLinks<Chave extends string>({
  rotulo,
  itens,
  ativa,
  className,
}: SegmentedLinkProps<Chave>) {
  return (
    /*
     * `role="group"`, e não `<nav>`: escolher período ou funil é ajuste dentro
     * da tela, não navegação entre telas — essa é do `Tabs`. Promover cada
     * filtro a landmark entulha a lista de landmarks e esconde a navegação de
     * verdade no meio do ruído.
     */
    <div role="group" aria-label={rotulo} className={cn(TRILHO, className)}>
      {itens.map((item) => (
        <Link
          key={item.chave}
          href={item.href}
          /* `aria-current`, nunca `aria-pressed`: aqui a escolha é o endereço. */
          aria-current={item.chave === ativa ? 'page' : undefined}
          className={pilula(item.chave === ativa)}
        >
          {item.rotulo}
        </Link>
      ))}
    </div>
  );
}

/** Setas circulam, Home/End vão às pontas; o resto segue para o navegador. */
function destinoDaTecla(tecla: string, indice: number, total: number): number | null {
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (indice + 1) % total;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (indice - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

function SegmentedRadios<Chave extends string>({
  rotulo,
  itens,
  ativa,
  aoTrocar,
  className,
}: SegmentedBotaoProps<Chave>) {
  const indiceAtivo = itens.findIndex((item) => item.chave === ativa);
  /*
   * Um grupo de rádio tem UMA parada na ordem de tabulação, e ela é a opção
   * escolhida. Quando `ativa` não casa com item nenhum, a primeira assume o
   * posto — senão o controle inteiro sairia do Tab e ficaria inalcançável.
   */
  const paradaDoTab = indiceAtivo === -1 ? 0 : indiceAtivo;

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const destino = destinoDaTecla(evento.key, indice, itens.length);
    if (destino === null) return;
    evento.preventDefault();

    /*
     * No padrão de rádio a seta escolhe, não só passeia: foco e seleção andam
     * juntos. O foco vai pelo DOM, e não por `useRef`, porque este módulo é
     * compartilhado entre servidor e cliente (ver o comentário do `Segmented`)
     * e um hook aqui quebraria a variante de link no servidor.
     */
    const vizinha = evento.currentTarget.parentElement?.children[destino];
    if (vizinha instanceof HTMLElement) vizinha.focus();

    aoTrocar(itens[destino].chave);
  }

  return (
    <div role="radiogroup" aria-label={rotulo} className={cn(TRILHO, className)}>
      {itens.map((item, indice) => {
        const ativo = item.chave === ativa;
        return (
          <button
            key={item.chave}
            type="button"
            /*
             * `role="radio"` com `aria-checked`, não `aria-pressed`: as opções
             * são mutuamente exclusivas. `aria-pressed` descreveria cada pílula
             * como um interruptor independente, que é como o board lia antes —
             * "Tudo, não pressionado" e "Sou responsável, pressionado" soam
             * como dois filtros somados, e não como uma escolha entre dois.
             */
            role="radio"
            aria-checked={ativo}
            tabIndex={indice === paradaDoTab ? 0 : -1}
            onClick={() => aoTrocar(item.chave)}
            onKeyDown={(evento) => aoTeclar(evento, indice)}
            className={pilula(ativo)}
          >
            {item.rotulo}
          </button>
        );
      })}
    </div>
  );
}
