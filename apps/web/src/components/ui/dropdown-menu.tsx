'use client';

import { Check, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────────────────────
 * Posicionamento flutuante
 *
 * Fica neste arquivo, mas é exportado à parte: o combobox da onda seguinte
 * precisa da mesma âncora, e duas implementações de posicionamento é como
 * nasceram as cinco versões de cartão de KPI que o redesenho veio apagar.
 * ────────────────────────────────────────────────────────────────────────── */

export type LadoFlutuante = 'baixo' | 'cima';
export type AlinhamentoFlutuante = 'inicio' | 'fim';

export interface OpcoesDePosicao {
  aberto: boolean;
  /** Lado preferido. Vira para o oposto quando não couber. */
  lado?: LadoFlutuante;
  /** Borda do gatilho com que o painel se alinha. */
  alinhamento?: AlinhamentoFlutuante;
  /** Folga entre gatilho e painel, em px. */
  espacamento?: number;
  /** Painel nunca mais estreito que o gatilho — é o que o combobox quer. */
  acompanharLarguraDoGatilho?: boolean;
}

export interface PosicaoFlutuante<G extends HTMLElement = HTMLElement> {
  refGatilho: RefObject<G | null>;
  refPainel: RefObject<HTMLDivElement | null>;
  /** Vai no `style` do gatilho; só tem conteúdo no caminho da âncora CSS. */
  estiloGatilho: CSSProperties | undefined;
  estiloPainel: CSSProperties;
}

/** Folga mínima entre o painel e a borda da janela. */
const MARGEM_DA_JANELA = 8;
/** Abaixo disto o painel deixa de ser lista e vira fresta; melhor virar de lado. */
const ALTURA_MINIMA_DO_PAINEL = 96;

/*
 * `position-area` é o nome final da propriedade que em 2024 se chamou
 * `inset-area`. Exigir os dois suportes na mesma pergunta evita o navegador
 * intermediário, que entende `anchor-name` mas ignora a área — e que colaria
 * todo painel no canto superior esquerdo.
 */
let suporteAAncora: boolean | null = null;

function navegadorTemAncoraCss(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  const resposta =
    suporteAAncora ??
    (CSS.supports('anchor-name: --tvx-sonda') && CSS.supports('position-area: block-end'));
  suporteAAncora = resposta;
  return resposta;
}

const AREA_DA_ANCORA: Record<LadoFlutuante, Record<AlinhamentoFlutuante, string>> = {
  baixo: { inicio: 'block-end span-inline-end', fim: 'block-end span-inline-start' },
  cima: { inicio: 'block-start span-inline-end', fim: 'block-start span-inline-start' },
};

/* O painel cresce a partir da quina colada no gatilho — é o que `tvx-pop` pede. */
const ORIGEM_DA_ESCALA: Record<LadoFlutuante, Record<AlinhamentoFlutuante, string>> = {
  baixo: { inicio: 'top left', fim: 'top right' },
  cima: { inicio: 'bottom left', fim: 'bottom right' },
};

interface Medida {
  top: number;
  left: number;
  alturaMaxima: number;
  larguraMinima: number | null;
  lado: LadoFlutuante;
}

/*
 * `useLayoutEffect` avisa quando roda no servidor, e este componente é
 * renderizado lá antes de hidratar. No servidor não há retângulo para medir,
 * então cai para `useEffect`, que é inerte no SSR.
 */
const useEfeitoDeLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Ancora um painel a um gatilho, sem biblioteca.
 *
 * Dois caminhos. Onde a API de âncora do CSS existe, o navegador resolve
 * posição e colisão sozinho — nada de ouvir scroll, nada de re-renderizar a
 * cada pixel rolado. Onde não existe, mede-se com `getBoundingClientRect` e
 * reposiciona-se na mão: vira de lado quando o lado pedido não cabe, encolhe
 * a altura até o limite da janela e prende o eixo horizontal dentro dela.
 *
 * O painel é `position: fixed` porque quem o usa o manda para um portal no
 * `<body>`: assim nenhum `overflow-hidden` de cartão o recorta.
 */
export function usePosicaoFlutuante<G extends HTMLElement = HTMLElement>({
  aberto,
  lado = 'baixo',
  alinhamento = 'inicio',
  espacamento = 4,
  acompanharLarguraDoGatilho = false,
}: OpcoesDePosicao): PosicaoFlutuante<G> {
  const refGatilho = useRef<G | null>(null);
  const refPainel = useRef<HTMLDivElement | null>(null);

  /*
   * `useId` traz caracteres que não valem como <custom-ident> (`«r1»` no React
   * 19). A limpeza mantém o nome estável entre servidor e cliente, que é o que
   * importa — gerar por contador quebraria a hidratação.
   */
  const idBruto = useId();
  const nomeDaAncora = `--tvx-ancora-${idBruto.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const [medida, setMedida] = useState<Medida | null>(null);

  /*
   * Decidido na renderização, não num efeito: o painel só existe depois de um
   * clique, então nunca há HTML do servidor para divergir, e o caminho da
   * âncora já nasce posicionado, sem o quadro intermediário.
   */
  const usaAncora = aberto && navegadorTemAncoraCss();

  useEfeitoDeLayout(() => {
    if (!aberto || usaAncora) {
      setMedida(null);
      return;
    }

    const medir = () => {
      const gatilho = refGatilho.current;
      const painel = refPainel.current;
      if (gatilho === null || painel === null) return;

      const g = gatilho.getBoundingClientRect();
      const p = painel.getBoundingClientRect();

      const espacoAbaixo = window.innerHeight - g.bottom - espacamento - MARGEM_DA_JANELA;
      const espacoAcima = g.top - espacamento - MARGEM_DA_JANELA;

      /*
       * Só vira de lado quando o lado pedido não comporta o painel E o oposto
       * comporta mais: um menu que salta para cima sem precisar assusta mais
       * do que um menu com rolagem.
       */
      const espacoPedido = lado === 'baixo' ? espacoAbaixo : espacoAcima;
      const espacoOposto = lado === 'baixo' ? espacoAcima : espacoAbaixo;
      const ladoFinal: LadoFlutuante =
        p.height <= espacoPedido || espacoOposto <= espacoPedido
          ? lado
          : lado === 'baixo'
            ? 'cima'
            : 'baixo';

      const alturaMaxima = Math.max(
        ALTURA_MINIMA_DO_PAINEL,
        ladoFinal === 'baixo' ? espacoAbaixo : espacoAcima,
      );
      const altura = Math.min(p.height, alturaMaxima);

      const larguraMinima = acompanharLarguraDoGatilho ? g.width : null;
      const largura = Math.max(p.width, larguraMinima ?? 0);
      const esquerdaPedida = alinhamento === 'inicio' ? g.left : g.right - largura;

      const nova: Medida = {
        top: Math.round(
          ladoFinal === 'baixo' ? g.bottom + espacamento : g.top - espacamento - altura,
        ),
        left: Math.round(
          Math.min(
            Math.max(MARGEM_DA_JANELA, esquerdaPedida),
            /* Painel mais largo que a janela: encosta na margem e deixa rolar. */
            Math.max(MARGEM_DA_JANELA, window.innerWidth - largura - MARGEM_DA_JANELA),
          ),
        ),
        alturaMaxima: Math.round(alturaMaxima),
        larguraMinima: larguraMinima === null ? null : Math.round(larguraMinima),
        lado: ladoFinal,
      };

      /* Rolagem dispara dezenas de vezes por segundo; sem esta comparação seria
       * uma re-renderização por evento, mesmo com o painel parado. */
      setMedida((atual) =>
        atual !== null &&
        atual.top === nova.top &&
        atual.left === nova.left &&
        atual.alturaMaxima === nova.alturaMaxima &&
        atual.larguraMinima === nova.larguraMinima &&
        atual.lado === nova.lado
          ? atual
          : nova,
      );
    };

    medir();

    /* Captura para pegar também o scroll de contêineres internos, que não borbulha. */
    window.addEventListener('scroll', medir, { capture: true, passive: true });
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', medir, { capture: true });
      window.removeEventListener('resize', medir);
    };
  }, [aberto, usaAncora, lado, alinhamento, espacamento, acompanharLarguraDoGatilho]);

  let estiloPainel: CSSProperties;
  if (usaAncora) {
    estiloPainel = {
      position: 'fixed',
      positionAnchor: nomeDaAncora,
      positionArea: AREA_DA_ANCORA[lado][alinhamento],
      positionTryFallbacks: 'flip-block, flip-inline',
      marginBlock: `${espacamento}px`,
      minWidth: acompanharLarguraDoGatilho ? 'anchor-size(width)' : undefined,
      transformOrigin: ORIGEM_DA_ESCALA[lado][alinhamento],
    };
  } else if (medida === null) {
    /* Um quadro antes da medição. `useLayoutEffect` corrige antes da pintura;
     * a invisibilidade é o seguro para quando ele não correr a tempo. */
    estiloPainel = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };
  } else {
    estiloPainel = {
      position: 'fixed',
      top: medida.top,
      left: medida.left,
      maxHeight: medida.alturaMaxima,
      minWidth: medida.larguraMinima ?? undefined,
      transformOrigin: ORIGEM_DA_ESCALA[medida.lado][alinhamento],
    };
  }

  return {
    refGatilho,
    refPainel,
    estiloGatilho: usaAncora ? { anchorName: nomeDaAncora } : undefined,
    estiloPainel,
  };
}

/**
 * Moldura de qualquer painel flutuante da casa.
 *
 * Exportada porque combobox e popover precisam da mesma: `--surface-elevated`
 * sobre `--shadow-overlay` é o par que a seção 6 define para o que paira, e
 * duas molduras parecidas e diferentes é o defeito que o redesenho veio apagar.
 */
export const CLASSES_DO_PAINEL_FLUTUANTE =
  'z-[var(--z-popover)] overflow-y-auto overscroll-contain rounded-panel border border-line-subtle bg-surface-elevated p-1 shadow-overlay outline-none';

/* ──────────────────────────────────────────────────────────────────────────
 * Menu
 * ────────────────────────────────────────────────────────────────────────── */

interface ContextoDoMenu {
  fechar: (devolverFoco: boolean) => void;
}

const ContextoDoMenu = createContext<ContextoDoMenu | null>(null);

function useMenu(): ContextoDoMenu {
  const contexto = useContext(ContextoDoMenu);
  if (contexto === null) {
    throw new Error('DropdownItem só funciona dentro de <DropdownMenu>.');
  }
  return contexto;
}

/*
 * Itens desabilitados entram na lista de propósito: o padrão ARIA permite
 * pulá-los, mas um item que o teclado nunca alcança é um item cujo motivo
 * ninguém lê. A ativação é que fica bloqueada.
 */
function itensDoMenu(painel: HTMLElement): HTMLElement[] {
  return Array.from(painel.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
}

/** NFD separa o acento da letra; a faixa apaga os diacríticos que sobram. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Depois disto a digitação recomeça: é uma busca nova, não a continuação. */
const JANELA_DA_DIGITACAO = 600;

export interface DropdownMenuProps {
  /**
   * Conteúdo do botão que abre o menu — ícone e texto. É conteúdo, não
   * elemento: o `<button>` é deste componente, e aninhar outro dentro dele
   * produz HTML inválido.
   */
  gatilho: ReactNode;
  /**
   * Nome acessível do menu. O nome do *gatilho* vem do que estiver dentro
   * dele — num gatilho só de ícone, de um `<span className="sr-only">`.
   */
  rotulo: string;
  alinhamento?: AlinhamentoFlutuante;
  lado?: LadoFlutuante;
  desabilitado?: boolean;
  /** Classe do painel. */
  className?: string;
  classNameGatilho?: string;
  children: ReactNode;
}

/**
 * Menu suspenso com o padrão ARIA de menu button.
 *
 * Setas navegam em ciclo, Home/End vão às pontas, digitar pula para o item,
 * Escape fecha devolvendo o foco ao gatilho. O foco é foco de verdade (o
 * elemento recebe `.focus()`), não `aria-activedescendant`: itens de menu são
 * links e botões reais, e Enter neles tem de fazer o que o navegador já faz.
 *
 * O painel vai para um portal no `<body>`. Sem isso, o menu de uma linha de
 * tabela seria recortado pelo `overflow-hidden` do contêiner da lista.
 */
export function DropdownMenu({
  gatilho,
  rotulo,
  alinhamento = 'inicio',
  lado = 'baixo',
  desabilitado = false,
  className,
  classNameGatilho,
  children,
}: DropdownMenuProps) {
  const [aberto, setAberto] = useState(false);
  const [focoInicial, setFocoInicial] = useState<'primeiro' | 'ultimo'>('primeiro');

  const digitado = useRef('');
  const relogioDaDigitacao = useRef<number | null>(null);

  const { refGatilho, refPainel, estiloGatilho, estiloPainel } =
    usePosicaoFlutuante<HTMLButtonElement>({ aberto, lado, alinhamento });

  const id = useId();
  const idGatilho = `${id}-gatilho`;
  const idMenu = `${id}-menu`;

  const fechar = useCallback(
    (devolverFoco: boolean) => {
      setAberto(false);
      digitado.current = '';
      if (relogioDaDigitacao.current !== null) {
        window.clearTimeout(relogioDaDigitacao.current);
        relogioDaDigitacao.current = null;
      }
      if (devolverFoco) refGatilho.current?.focus();
    },
    [refGatilho],
  );

  const abrir = (foco: 'primeiro' | 'ultimo') => {
    setFocoInicial(foco);
    setAberto(true);
  };

  /* O menu button leva o foco para dentro ao abrir — inclusive por mouse. É o
   * que faz Escape ter para onde voltar e a seta seguinte saber onde está. */
  useEffect(() => {
    if (!aberto) return;
    const painel = refPainel.current;
    if (painel === null) return;
    const itens = itensDoMenu(painel);
    const alvo = focoInicial === 'ultimo' ? itens.at(-1) : itens.at(0);
    (alvo ?? painel).focus();
  }, [aberto, focoInicial, refPainel]);

  useEffect(() => {
    if (!aberto) return;

    const aoApontarFora = (evento: PointerEvent) => {
      const alvo = evento.target;
      if (!(alvo instanceof Node)) return;
      /*
       * O gatilho é exceção obrigatória: sem ela o `pointerdown` fecharia o
       * menu e o `click` do mesmo gesto o reabriria — o menu "não fecha" ao
       * clicar no próprio botão. Quem alterna é o `onClick` do gatilho.
       */
      if (refGatilho.current?.contains(alvo) === true) return;
      if (refPainel.current?.contains(alvo) === true) return;
      fechar(false);
    };

    /* Captura: um `stopPropagation` de qualquer linha de lista não pode
     * deixar o menu aberto para sempre. */
    document.addEventListener('pointerdown', aoApontarFora, true);
    return () => document.removeEventListener('pointerdown', aoApontarFora, true);
  }, [aberto, fechar, refGatilho, refPainel]);

  /* O relógio da digitação sobrevive ao desmonte se ninguém o parar. */
  useEffect(
    () => () => {
      if (relogioDaDigitacao.current !== null) window.clearTimeout(relogioDaDigitacao.current);
    },
    [],
  );

  const aoTeclarNoGatilho = (evento: KeyboardEvent<HTMLButtonElement>) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      abrir('primeiro');
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      abrir('ultimo');
    }
  };

  const aoTeclarNoPainel = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      fechar(true);
      return;
    }

    if (evento.key === 'Tab') {
      /*
       * O painel está num portal no fim do `<body>`: deixar o Tab seguir seu
       * curso jogaria o foco para depois da página inteira. Fecha e devolve o
       * foco ao gatilho — daí o Tab seguinte continua de onde a pessoa estava.
       */
      evento.preventDefault();
      fechar(true);
      return;
    }

    const painel = refPainel.current;
    if (painel === null) return;
    const itens = itensDoMenu(painel);
    if (itens.length === 0) return;

    const ativo = document.activeElement;
    const atual = ativo instanceof HTMLElement ? itens.indexOf(ativo) : -1;
    const focar = (indice: number) => {
      itens.at(((indice % itens.length) + itens.length) % itens.length)?.focus();
    };

    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        focar(atual + 1);
        return;
      case 'ArrowUp':
        evento.preventDefault();
        focar(atual <= 0 ? itens.length - 1 : atual - 1);
        return;
      case 'Home':
        evento.preventDefault();
        focar(0);
        return;
      case 'End':
        evento.preventDefault();
        focar(itens.length - 1);
        return;
      default:
        break;
    }

    if (evento.key.length !== 1 || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    /* Espaço sozinho ativa o item focado; só vira busca quando continua uma palavra. */
    if (evento.key === ' ' && digitado.current === '') return;

    evento.preventDefault();
    digitado.current += evento.key;
    if (relogioDaDigitacao.current !== null) window.clearTimeout(relogioDaDigitacao.current);
    relogioDaDigitacao.current = window.setTimeout(() => {
      digitado.current = '';
    }, JANELA_DA_DIGITACAO);

    /*
     * Uma letra só procura a partir do PRÓXIMO item, para que teclar "e" várias
     * vezes cicle entre os que começam com "e". Duas ou mais refinam o item
     * atual, senão "en" nunca encontraria "Entregas" estando nele.
     */
    const procurado = normalizar(digitado.current);
    const inicio = digitado.current.length === 1 ? atual + 1 : Math.max(atual, 0);
    for (let passo = 0; passo < itens.length; passo += 1) {
      const item = itens.at((inicio + passo) % itens.length);
      if (item !== undefined && normalizar((item.textContent ?? '').trim()).startsWith(procurado)) {
        item.focus();
        return;
      }
    }
  };

  const contexto = useMemo<ContextoDoMenu>(() => ({ fechar }), [fechar]);

  return (
    <>
      <button
        ref={refGatilho}
        type="button"
        id={idGatilho}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        disabled={desabilitado}
        style={estiloGatilho}
        onClick={() => (aberto ? fechar(false) : abrir('primeiro'))}
        onKeyDown={aoTeclarNoGatilho}
        className={cn(
          'inline-flex min-h-8 items-center gap-2 rounded-control text-label transition-base',
          'disabled:cursor-not-allowed disabled:opacity-50',
          classNameGatilho,
        )}
      >
        {gatilho}
      </button>

      {aberto &&
        createPortal(
          <ContextoDoMenu.Provider value={contexto}>
            <div
              ref={refPainel}
              id={idMenu}
              role="menu"
              aria-label={rotulo}
              tabIndex={-1}
              style={estiloPainel}
              onKeyDown={aoTeclarNoPainel}
              className={cn(
                CLASSES_DO_PAINEL_FLUTUANTE,
                /* `_` vira espaço: `calc(100vw-1rem)` sem espaços é CSS inválido
                 * e a regra inteira cairia em silêncio. */
                'max-h-[min(24rem,70dvh)] w-max min-w-44 max-w-[min(20rem,calc(100vw_-_1rem))] animate-pop',
                className,
              )}
            >
              {children}
            </div>
          </ContextoDoMenu.Provider>,
          document.body,
        )}
    </>
  );
}

export interface DropdownItemProps {
  children: ReactNode;
  /** Item que navega. Exclui `onSelect`. */
  href?: string;
  /** Item que executa. Exclui `href`. */
  onSelect?: () => void;
  Icone?: LucideIcon;
  destrutivo?: boolean;
  desabilitado?: boolean;
  /** Marca de escolhida numa lista de opções — vira `menuitemradio`. */
  selecionado?: boolean;
  /**
   * `submit` para o item que envia um `<form>` ao redor (Sair, trocar empresa):
   * é o único jeito honesto de disparar Server Action a partir de um menu.
   */
  type?: 'button' | 'submit';
  className?: string;
}

export function DropdownItem({
  children,
  href,
  onSelect,
  Icone,
  destrutivo = false,
  desabilitado = false,
  selecionado,
  type = 'button',
  className,
}: DropdownItemProps) {
  const { fechar } = useMenu();

  const classes = cn(
    'flex min-h-8 w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-label transition-base',
    /*
     * `focus:`, não `focus-visible:`: dentro de um menu o item focado É o item
     * realçado, mesmo quando o foco chegou por clique. O anel de `:focus-visible`
     * da base continua aparecendo por cima quando a origem é teclado.
     */
    destrutivo
      ? 'text-danger focus:bg-danger-soft hover:bg-danger-soft'
      : 'text-content-default focus:bg-surface-muted focus:text-content hover:bg-surface-muted hover:text-content',
    desabilitado &&
      'cursor-not-allowed text-content-subtle hover:bg-transparent focus:bg-transparent',
    className,
  );

  const conteudo = (
    <>
      {Icone !== undefined && <Icone className="size-4 shrink-0 opacity-70" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selecionado === true && (
        <Check className="size-4 shrink-0 text-content-accent" aria-hidden />
      )}
    </>
  );

  const papel = selecionado === undefined ? 'menuitem' : 'menuitemradio';

  if (desabilitado) {
    /* Continua no menu, focável e anunciado — só não age. Um item bloqueado
     * que some é um item cujo motivo ninguém descobre. */
    return (
      <span
        role={papel}
        aria-checked={selecionado}
        aria-disabled="true"
        tabIndex={-1}
        className={classes}
      >
        {conteudo}
      </span>
    );
  }

  if (href !== undefined) {
    return (
      <Link
        href={href}
        role={papel}
        aria-checked={selecionado}
        tabIndex={-1}
        /* Navegação já troca o contexto; devolver o foco ao gatilho da tela
         * anterior seria devolvê-lo a um botão que deixou de existir. */
        onClick={() => fechar(false)}
        className={classes}
      >
        {conteudo}
      </Link>
    );
  }

  return (
    <button
      type={type}
      role={papel}
      aria-checked={selecionado}
      tabIndex={-1}
      onClick={() => {
        if (type === 'submit') {
          /*
           * O React esvazia a atualização de estado ao fim do disparo do
           * clique, ANTES de o navegador executar a ação padrão do botão.
           * Fechar na hora arrancaria o `<button type="submit">` do DOM e o
           * envio nunca aconteceria — é o "Sair" que não sai. Adiar por uma
           * tarefa devolve a ordem.
           */
          window.setTimeout(() => fechar(false), 0);
          return;
        }
        onSelect?.();
        fechar(true);
      }}
      className={classes}
    >
      {conteudo}
    </button>
  );
}

export interface DropdownLabelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Cabeçalho de grupo dentro do menu.
 *
 * `role="presentation"` porque só `menuitem`, `separator` e `group` são filhos
 * legítimos de um `menu`: um `<h3>` solto aqui entraria na lista de títulos da
 * página e quebraria a ordem de headings da tela inteira.
 */
export function DropdownLabel({ children, className }: DropdownLabelProps) {
  return (
    <div
      role="presentation"
      className={cn('px-2.5 pt-2 pb-1 text-eyebrow uppercase text-content-subtle', className)}
    >
      {children}
    </div>
  );
}

export interface DropdownSeparatorProps {
  className?: string;
}

export function DropdownSeparator({ className }: DropdownSeparatorProps) {
  /* `-mx-1` cancela o `p-1` do painel: o traço atravessa, a lista respira. */
  return <div role="separator" className={cn('-mx-1 my-1 h-px bg-line-subtle', className)} />;
}
