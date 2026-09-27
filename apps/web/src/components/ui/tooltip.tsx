'use client';

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';

import { cn } from '@/lib/utils';

/**
 * Dica de contexto — o reforço de um controle que já se explica sozinho.
 *
 * Abre no ponteiro e no `:focus-visible`, que é o que a torna alcançável por
 * teclado — era o defeito dos dez `title=` nativos que ela substitui (o
 * `title` só aparece no hover, e nunca em quem navega tabulando).
 *
 * `conteudo` é `string` de propósito: dica é reforço, não conteúdo. Aceitar
 * `ReactNode` abriria a porta para botão, link e texto que só existe ali —
 * exatamente o que nenhum usuário de toque ou de teclado conseguiria alcançar.
 */

/** Lado do gatilho onde a bolha nasce. Vira para o oposto quando não cabe. */
export type LadoDaDica = 'cima' | 'baixo' | 'esquerda' | 'direita';

/** O que a dica injeta no gatilho — por isso ele é um elemento, não um nó qualquer. */
interface AtributosDoGatilho {
  readonly 'aria-describedby'?: string;
}

export interface TooltipProps {
  /** Texto do reforço. Curto: se precisa de parágrafo, não é dica. */
  readonly conteudo: string;
  readonly lado?: LadoDaDica;
  /** Classe do embrulho inline em volta do gatilho — não da bolha. */
  readonly className?: string;
  readonly children: ReactElement<AtributosDoGatilho>;
}

/*
 * Entrar devagar, sair na hora. O atraso existe para o ponteiro atravessar uma
 * fileira de botões de ícone sem acender seis bolhas pelo caminho; a saída não
 * tem atraso porque a dica já foi lida. Quem chega pelo teclado também não
 * espera: tabular até um controle já é uma escolha, passar o mouse não é.
 */
const ATRASO_DE_ENTRADA_MS = 300;

/** Distância do gatilho até a bolha. Espelhada em `PONTE` como `h-2`/`w-2`. */
const AFASTAMENTO_PX = 8;

/** Respiro mínimo até a borda da janela antes de virar ou empurrar a bolha. */
const FOLGA_PX = 8;

const LADO_OPOSTO: Record<LadoDaDica, LadoDaDica> = {
  cima: 'baixo',
  baixo: 'cima',
  esquerda: 'direita',
  direita: 'esquerda',
};

/** Cresce a partir do gatilho: `tvx-pop` sem origem lê como pulo, não como abertura. */
const ORIGEM: Record<LadoDaDica, string> = {
  cima: 'origin-bottom',
  baixo: 'origin-top',
  esquerda: 'origin-right',
  direita: 'origin-left',
};

/*
 * Ponte de hover sobre o vão de 8px. Sem ela, o ponteiro que sai do gatilho em
 * direção à bolha atravessa um pedaço de página que não pertence à dica, o
 * `pointerleave` dispara e a bolha fecha antes de o ponteiro chegar — e a dica
 * deixa de ser "hoverable" (WCAG 1.4.13). É pseudo-elemento da própria bolha,
 * então a área só existe enquanto ela está aberta.
 */
const PONTE: Record<LadoDaDica, string> = {
  cima: 'before:absolute before:inset-x-0 before:top-full before:h-2',
  baixo: 'before:absolute before:inset-x-0 before:bottom-full before:h-2',
  esquerda: 'before:absolute before:inset-y-0 before:left-full before:w-2',
  direita: 'before:absolute before:inset-y-0 before:right-full before:w-2',
};

/*
 * Recuo da primeira passada, em CSS. Na primeira pintura o tamanho da bolha
 * ainda não é conhecido, e só a porcentagem de `translate` sabe medir "metade
 * de mim mesmo". É a mesma regra de `recuoEmPixels`, escrita na única
 * linguagem que serve antes de medir.
 *
 * Vai na propriedade `translate`, não em `transform`: `tvx-pop` anima
 * `transform`, e as duas no mesmo lugar fariam a bolha escorregar durante os
 * 120ms da entrada.
 */
const RECUO_PROVISORIO: Record<LadoDaDica, string> = {
  cima: `-50% calc(-100% - ${AFASTAMENTO_PX}px)`,
  baixo: `-50% ${AFASTAMENTO_PX}px`,
  esquerda: `calc(-100% - ${AFASTAMENTO_PX}px) -50%`,
  direita: `${AFASTAMENTO_PX}px -50%`,
};

interface Tamanho {
  readonly largura: number;
  readonly altura: number;
}

interface Colocacao {
  readonly lado: LadoDaDica;
  /** Coordenadas de `left`/`top` da bolha, que é `fixed`. */
  readonly x: number;
  readonly y: number;
  /** A bolha já foi medida: o recuo saiu do `translate` e entrou nas coordenadas. */
  readonly medida: boolean;
}

/** Ponto do gatilho a que a bolha se ancora, em coordenadas de janela. */
function ancorar(gatilho: DOMRect, lado: LadoDaDica): { readonly x: number; readonly y: number } {
  const meioX = gatilho.left + gatilho.width / 2;
  const meioY = gatilho.top + gatilho.height / 2;
  switch (lado) {
    case 'cima':
      return { x: meioX, y: gatilho.top };
    case 'baixo':
      return { x: meioX, y: gatilho.bottom };
    case 'esquerda':
      return { x: gatilho.left, y: meioY };
    case 'direita':
      return { x: gatilho.right, y: meioY };
  }
}

/** Do ponto de ancoragem até o canto superior-esquerdo da bolha, já medida. */
function recuoEmPixels(
  lado: LadoDaDica,
  bolha: Tamanho,
): { readonly x: number; readonly y: number } {
  switch (lado) {
    case 'cima':
      return { x: -bolha.largura / 2, y: -bolha.altura - AFASTAMENTO_PX };
    case 'baixo':
      return { x: -bolha.largura / 2, y: AFASTAMENTO_PX };
    case 'esquerda':
      return { x: -bolha.largura - AFASTAMENTO_PX, y: -bolha.altura / 2 };
    case 'direita':
      return { x: AFASTAMENTO_PX, y: -bolha.altura / 2 };
  }
}

/** Vira para o lado oposto só quando o pedido não cabe e o oposto cabe. */
function escolherLado(
  pedido: LadoDaDica,
  gatilho: DOMRect,
  bolha: Tamanho,
  janela: Tamanho,
): LadoDaDica {
  const cabe: Record<LadoDaDica, boolean> = {
    cima: gatilho.top - AFASTAMENTO_PX - bolha.altura >= FOLGA_PX,
    baixo: gatilho.bottom + AFASTAMENTO_PX + bolha.altura <= janela.altura - FOLGA_PX,
    esquerda: gatilho.left - AFASTAMENTO_PX - bolha.largura >= FOLGA_PX,
    direita: gatilho.right + AFASTAMENTO_PX + bolha.largura <= janela.largura - FOLGA_PX,
  };
  const oposto = LADO_OPOSTO[pedido];
  return cabe[pedido] || !cabe[oposto] ? pedido : oposto;
}

/** Mantém a bolha dentro da janela. Empatou o espaço, a folga inicial ganha. */
function limitar(inicio: number, tamanho: number, janela: number): number {
  const maximo = janela - FOLGA_PX - tamanho;
  return maximo < FOLGA_PX ? FOLGA_PX : Math.min(Math.max(inicio, FOLGA_PX), maximo);
}

/**
 * Segunda passada, com a bolha já pintada. Resolve três coisas que só se sabem
 * depois de medir:
 *
 * 1. se ela cabe no lado pedido — o tamanho depende do texto;
 * 2. se ela passou da borda da janela e precisa escorregar de volta;
 * 3. de onde o `fixed` está contando. A bolha é posicionada em coordenadas de
 *    janela, mas basta um ancestral com `backdrop-filter` (o header) ou com
 *    `translate` (card em hover) para ele virar bloco contêiner e a origem
 *    deixar de ser 0,0. O delta entre onde a bolha está e onde deveria estar
 *    revela essa origem — e é por isso que a dica não precisa de portal, o que
 *    a mantém funcionando dentro de `<dialog>` e de contêiner com
 *    `overflow: hidden`.
 */
function corrigir(atual: Colocacao, medida: DOMRect, gatilho: DOMRect, janela: Tamanho): Colocacao {
  const tamanho: Tamanho = { largura: medida.width, altura: medida.height };

  const recuoAtual = atual.medida
    ? { x: 0, y: 0 }
    : recuoEmPixels(atual.lado, tamanho); /* o `translate` da primeira passada */
  const origemX = medida.left - (atual.x + recuoAtual.x);
  const origemY = medida.top - (atual.y + recuoAtual.y);

  const lado = escolherLado(atual.lado, gatilho, tamanho, janela);
  const ancora = ancorar(gatilho, lado);
  const recuo = recuoEmPixels(lado, tamanho);

  return {
    lado,
    x: limitar(ancora.x + recuo.x, tamanho.largura, janela.largura) - origemX,
    y: limitar(ancora.y + recuo.y, tamanho.altura, janela.altura) - origemY,
    medida: true,
  };
}

export function Tooltip({ conteudo, lado = 'cima', className, children }: TooltipProps) {
  const id = useId();
  const [colocacao, setColocacao] = useState<Colocacao | null>(null);
  const embrulho = useRef<HTMLSpanElement>(null);
  const bolha = useRef<HTMLSpanElement>(null);
  const cronometro = useRef<number | null>(null);

  const desagendar = useCallback(() => {
    if (cronometro.current !== null) {
      window.clearTimeout(cronometro.current);
      cronometro.current = null;
    }
  }, []);

  const abrir = useCallback(() => {
    desagendar();
    const caixa = embrulho.current?.getBoundingClientRect();
    if (caixa) setColocacao({ ...ancorar(caixa, lado), lado, medida: false });
  }, [desagendar, lado]);

  const fechar = useCallback(() => {
    desagendar();
    setColocacao(null);
  }, [desagendar]);

  /* Cronômetro pendente com o componente desmontado abriria uma bolha órfã. */
  useEffect(() => desagendar, [desagendar]);

  const aberta = colocacao !== null;

  useEffect(() => {
    if (!aberta) return;

    function aoTeclar(evento: KeyboardEvent) {
      /* Escape dispensa a dica sem tirar o foco do controle (WCAG 1.4.13).
       * Não interrompe a propagação: quem mais escuta Escape na tela — diálogo,
       * gaveta — foi aberto pelo usuário e continua no direito de responder. */
      if (evento.key === 'Escape') fechar();
    }

    function reancorar() {
      const caixa = embrulho.current?.getBoundingClientRect();
      if (caixa) setColocacao({ ...ancorar(caixa, lado), lado, medida: false });
    }

    document.addEventListener('keydown', aoTeclar);
    /* Em captura porque `scroll` não borbulha: assim a rolagem de qualquer
     * contêiner entre o gatilho e a janela reancora a bolha, que sendo `fixed`
     * não acompanha o gatilho sozinha. */
    window.addEventListener('scroll', reancorar, { capture: true, passive: true });
    window.addEventListener('resize', reancorar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('scroll', reancorar, { capture: true });
      window.removeEventListener('resize', reancorar);
    };
  }, [aberta, fechar, lado]);

  useEffect(() => {
    if (!colocacao || colocacao.medida) return;
    const medida = bolha.current?.getBoundingClientRect();
    const gatilho = embrulho.current?.getBoundingClientRect();
    if (!medida || !gatilho) return;
    /*
     * `useEffect` e não `useLayoutEffect`: a dica é renderizada no servidor
     * junto da página, e ali o efeito de layout só produz aviso no console. O
     * preço é um quadro na posição provisória — que só difere da final perto
     * da borda da janela, e coincide com os 120ms da entrada.
     */
    setColocacao(
      corrigir(colocacao, medida, gatilho, {
        largura: window.innerWidth,
        altura: window.innerHeight,
      }),
    );
  }, [colocacao]);

  function aoEntrarOPonteiro(evento: PointerEvent<HTMLSpanElement>) {
    /*
     * Só ponteiro que de fato pousa sobre as coisas. No toque o navegador
     * emula a entrada depois do toque: a bolha apareceria 300ms após o dedo
     * sair e ficaria lá, sem hover para terminar. O reforço no toque é o
     * `aria-describedby`, que continua no HTML.
     */
    if (evento.pointerType === 'touch') return;
    desagendar();
    cronometro.current = window.setTimeout(abrir, ATRASO_DE_ENTRADA_MS);
  }

  function aoFocar(evento: FocusEvent<HTMLSpanElement>) {
    /*
     * `:focus-visible` é a decisão do navegador sobre o que é navegação por
     * teclado. Reimplementá-la por "última tecla pressionada" erra justamente
     * no clique depois de um atalho — e o seletor nativo já acertou.
     */
    if (evento.target.matches(':focus-visible')) abrir();
  }

  const jaDescrito = children.props['aria-describedby'];
  const gatilho = cloneElement(children, {
    'aria-describedby': jaDescrito ? `${jaDescrito} ${id}` : id,
  });

  return (
    <span
      ref={embrulho}
      className={cn('relative inline-flex', className)}
      onPointerEnter={aoEntrarOPonteiro}
      onPointerLeave={fechar}
      onFocus={aoFocar}
      onBlur={fechar}
      /* Pressionou: a ação assumiu o lugar da dica, e no toque é o que evita
       * a bolha presa. O clique de mouse não reabre — não é `:focus-visible`. */
      onPointerDown={fechar}
    >
      {gatilho}
      {colocacao ? (
        <span
          ref={bolha}
          id={id}
          role="tooltip"
          style={{
            left: colocacao.x,
            top: colocacao.y,
            translate: colocacao.medida ? undefined : RECUO_PROVISORIO[colocacao.lado],
          }}
          className={cn(
            'fixed z-[var(--z-popover)] w-max max-w-64 rounded-control border border-line-subtle',
            'bg-surface-elevated px-2.5 py-1.5 text-caption text-pretty text-content shadow-overlay',
            /* Movimento reduzido é tratado pelo bloco global de `globals.css`,
             * que zera duração e atraso de qualquer animação. */
            'animate-pop',
            ORIGEM[colocacao.lado],
            PONTE[colocacao.lado],
          )}
        >
          {conteudo}
        </span>
      ) : (
        /*
         * Com a dica fechada o texto continua no HTML, fora da vista. É o que
         * garante o anúncio no instante em que o foco chega: se a descrição
         * só entrasse na árvore junto com a bolha, ela correria contra o
         * re-render e o leitor de tela anunciaria o controle sem o reforço.
         * Mesmo `id` nos dois ramos, e só um existe por vez.
         */
        <span id={id} className="sr-only">
          {conteudo}
        </span>
      )}
    </span>
  );
}
