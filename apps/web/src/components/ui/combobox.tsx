'use client';

import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import {
  CLASSES_DO_PAINEL_FLUTUANTE,
  usePosicaoFlutuante,
  type AlinhamentoFlutuante,
  type LadoFlutuante,
} from '@/components/ui/dropdown-menu';
import { Input, type TamanhoDeCampo } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/*
 * Campo de busca com lista (P9).
 *
 * Duas telas pediram este componente, por motivos opostos:
 *
 * 1. O buscador de produto da venda desenhava a lista COMO IRMÃ do campo, no
 *    fluxo do documento — abrir a lista empurrava o carrinho 330px para baixo
 *    no meio do lançamento. Aqui o painel vai para um portal no `<body>` em
 *    `position: fixed`: ele paira, nada abaixo se mexe, e nenhum
 *    `overflow-hidden` de cartão o recorta.
 * 2. Os `<select>` de contatos, oportunidades e atividades listam centenas de
 *    linhas. Um `<select>` de 500 opções não é escolha, é rolagem.
 *
 * O padrão é o ARIA 1.2 de combobox com listbox: o foco NUNCA sai do campo —
 * quem anda é o `aria-activedescendant`. É o que permite continuar digitando
 * enquanto a lista se move, que é o gesto inteiro deste controle.
 *
 * Honestidade (CLAUDE.md): este componente não inventa opção nenhuma. Tudo o
 * que aparece veio de `buscar`. Lista vazia antes de digitar e lista vazia
 * depois de buscar são estados DIFERENTES e dizem coisas diferentes, e falha
 * de busca se anuncia como falha — nunca como "nada encontrado".
 */

export interface OpcaoDoCombobox {
  /** O que vai para o formulário — id, normalmente. */
  valor: string;
  /** Texto visível e nome acessível da opção. */
  rotulo: string;
  /** Segunda linha: documento, e-mail, código. */
  descricao?: string;
  /** Canto direito: preço, saldo, unidade. Já formatado por quem chama. */
  detalhe?: string;
  /** Aparece e é anunciada, mas não pode ser escolhida. */
  desabilitado?: boolean;
}

/**
 * A busca. Pode ser síncrona (filtro de um array já carregado) ou assíncrona.
 *
 * O `sinal` chega para quem faz rede: a cada tecla a busca anterior é abortada.
 * Quem filtra em memória simplesmente ignora o segundo parâmetro.
 */
export type BuscadorDeOpcoes<O extends OpcaoDoCombobox = OpcaoDoCombobox> = (
  texto: string,
  sinal: AbortSignal,
) => Promise<readonly O[]> | readonly O[];

/** O que `renderOpcao` recebe além da opção. */
export interface EstadoDaOpcao {
  /** É a opção sob o cursor do teclado (`aria-activedescendant`). */
  ativa: boolean;
  /** É a opção atualmente escolhida no campo. */
  selecionada: boolean;
  /** Termo que produziu esta lista. */
  termo: string;
}

export interface ComboboxProps<O extends OpcaoDoCombobox = OpcaoDoCombobox> {
  /**
   * Nome acessível do campo e da lista.
   *
   * Havendo `<label>` visível (o caminho normal, via `Field`), repita aqui o
   * mesmo texto: nome acessível diferente do rótulo visível quebra comando de
   * voz.
   */
  rotulo: string;
  placeholder: string;
  buscar: BuscadorDeOpcoes<O>;
  /** Recebe `null` quando a escolha é desfeita pelo X ou por Escape. */
  aoEscolher: (opcao: O | null) => void;
  /** Escolha atual. Controlado por quem chama — o campo não guarda seleção. */
  valor?: O | null;
  /** Com `nome`, emite o `<input type="hidden">` que o `<form>` envia. */
  nome?: string;
  /** Id do campo, para o `<label htmlFor>`. Use `idDoCampo(nome, escopo)`. */
  id?: string;
  size?: TamanhoDeCampo;
  /** Ícone à esquerda. `null` remove; o padrão é a lupa. */
  Icone?: LucideIcon | null;
  desabilitado?: boolean;
  obrigatorio?: boolean;
  /**
   * Esvazia o campo depois de escolher, em vez de exibir o rótulo escolhido.
   * É o modo do buscador de produto: escolher é adicionar ao carrinho e voltar
   * ao começo, não preencher um valor.
   */
  limparAoEscolher?: boolean;
  /** Espera entre a última tecla e a busca. */
  atrasoMs?: number;
  /** Frase do "nada encontrado". O padrão cita o termo procurado. */
  vazioRotulo?: string;
  /** Frase de antes de digitar, quando a busca vazia não devolve nada. */
  inicialRotulo?: string;
  renderOpcao?: (opcao: O, estado: EstadoDaOpcao) => ReactNode;
  lado?: LadoFlutuante;
  alinhamento?: AlinhamentoFlutuante;
  className?: string;
  classNamePainel?: string;
  autoFocus?: boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
}

/** Nem instantâneo (uma requisição por tecla) nem lento o bastante para se notar. */
const ATRASO_PADRAO = 180;

type SituacaoDaBusca = 'ociosa' | 'buscando' | 'pronta' | 'falhou';

interface ResultadoDaBusca<O extends OpcaoDoCombobox> {
  situacao: SituacaoDaBusca;
  /** Termo que produziu `opcoes`. `null` enquanto nenhuma busca terminou. */
  termo: string | null;
  opcoes: readonly O[];
}

/** Altura dos estados de texto do painel (buscando, vazio, erro) — não dança ao trocar. */
const CLASSES_DO_AVISO = 'flex items-center gap-2 px-2.5 py-3 text-caption text-content-muted';

export function Combobox<O extends OpcaoDoCombobox = OpcaoDoCombobox>({
  rotulo,
  placeholder,
  buscar,
  aoEscolher,
  valor = null,
  nome,
  id,
  size = 'md',
  Icone = Search,
  desabilitado = false,
  obrigatorio = false,
  limparAoEscolher = false,
  atrasoMs = ATRASO_PADRAO,
  vazioRotulo,
  inicialRotulo = 'Digite para buscar.',
  renderOpcao,
  lado = 'baixo',
  alinhamento = 'inicio',
  className,
  classNamePainel,
  autoFocus = false,
  'aria-describedby': descritoPor,
  'aria-labelledby': rotuladoPor,
  'aria-invalid': invalido,
}: ComboboxProps<O>) {
  const idGerado = useId();
  const idCampo = id ?? `${idGerado}-campo`;
  const idLista = `${idGerado}-lista`;

  const rotuloSelecionado = valor?.rotulo ?? '';
  const chaveSelecionada = valor?.valor ?? null;

  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(limparAoEscolher ? '' : rotuloSelecionado);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const [tentativa, setTentativa] = useState(0);
  const [resultado, setResultado] = useState<ResultadoDaBusca<O>>({
    situacao: 'ociosa',
    termo: null,
    opcoes: [],
  });

  const refCampo = useRef<HTMLInputElement>(null);
  /* Abrir por clique ou por seta busca na hora; digitar espera o debounce. */
  const buscaImediata = useRef(false);
  /* Ponteiro descendo dentro do painel não é saída do campo — ver `aoSairDoCampo`. */
  const apontandoNoPainel = useRef(false);

  /*
   * A âncora é a moldura do campo, não o `<input>`: o painel tem de alinhar
   * com a borda que se vê, e a borda é da moldura.
   */
  const { refGatilho, refPainel, estiloGatilho, estiloPainel } =
    usePosicaoFlutuante<HTMLDivElement>({
      aberto,
      lado,
      alinhamento,
      acompanharLarguraDoGatilho: true,
    });

  /*
   * `buscar` quase sempre chega como arrow inline, com identidade nova a cada
   * renderização. Depender dela no efeito da busca seria buscar de novo a cada
   * renderização — e como a busca renderiza, o laço não teria fim. O efeito
   * depende só do termo; a função vem sempre da última renderização.
   */
  const refBuscar = useRef(buscar);
  useEffect(() => {
    refBuscar.current = buscar;
  });

  /*
   * Escolha trocada de FORA: formulário limpo, ou a venda que acabou de
   * cadastrar o cliente e já o escolheu. Ajuste durante a renderização, que é
   * o padrão do React para seguir uma prop — um efeito aqui custaria uma
   * renderização a mais e uma piscada com o texto velho.
   *
   * Comparar o rótulo basta: é ele que vai para a tela, e duas opções com o
   * mesmo rótulo escreveriam a mesma coisa.
   */
  const [escolhaVista, setEscolhaVista] = useState(rotuloSelecionado);
  if (escolhaVista !== rotuloSelecionado) {
    setEscolhaVista(rotuloSelecionado);
    if (!limparAoEscolher) setTexto(rotuloSelecionado);
  }

  useEffect(() => {
    if (!aberto) return;

    const controlador = new AbortController();
    let vivo = true;

    const executar = () => {
      setResultado((atual) => ({ ...atual, situacao: 'buscando' }));
      void (async () => {
        try {
          const encontradas = await refBuscar.current(texto, controlador.signal);
          if (!vivo) return;
          setResultado({ situacao: 'pronta', termo: texto, opcoes: encontradas });
          /*
           * Primeira opção já ativa: é o que faz Enter funcionar com leitor de
           * código de barras, que digita e tecla Enter sem tocar nas setas.
           */
          setIndiceAtivo(encontradas.length > 0 ? 0 : -1);
        } catch {
          /* Aborto é rotina (uma tecla cancelou a busca anterior), não falha. */
          if (!vivo) return;
          setResultado((atual) => ({ ...atual, situacao: 'falhou' }));
          setIndiceAtivo(-1);
        }
      })();
    };

    if (buscaImediata.current) {
      buscaImediata.current = false;
      executar();
      return () => {
        vivo = false;
        controlador.abort();
      };
    }

    const relogio = window.setTimeout(executar, atrasoMs);
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
      controlador.abort();
    };
  }, [aberto, texto, atrasoMs, tentativa]);

  const abrir = (imediata: boolean) => {
    if (desabilitado) return;
    buscaImediata.current = imediata;
    setAberto(true);
  };

  const fechar = useCallback(
    (restaurarTexto: boolean) => {
      setAberto(false);
      setIndiceAtivo(-1);
      /*
       * Campo mostrando "Acme" com valor "Acme Ltda" escolhido é mentira sobre
       * o que vai ser enviado. Fechar sem escolher devolve o rótulo da escolha
       * que de fato está valendo. No modo de ação não há escolha valendo, e o
       * que foi digitado continua onde estava.
       */
      if (restaurarTexto && !limparAoEscolher) setTexto(rotuloSelecionado);
    },
    [limparAoEscolher, rotuloSelecionado],
  );

  const escolher = (opcao: O) => {
    if (opcao.desabilitado === true) return;
    aoEscolher(opcao);
    setTexto(limparAoEscolher ? '' : opcao.rotulo);
    setAberto(false);
    setIndiceAtivo(-1);
    refCampo.current?.focus();
  };

  const limpar = () => {
    setTexto('');
    if (valor !== null) aoEscolher(null);
    refCampo.current?.focus();
    /* Aberto, o campo vazio refaz a busca sozinho e a lista volta ao início. */
  };

  /* Ponteiro fora fecha. Captura, para que `stopPropagation` de uma linha de
   * lista não deixe o painel aberto para sempre. */
  useEffect(() => {
    if (!aberto) return;
    const aoApontarFora = (evento: PointerEvent) => {
      const alvo = evento.target;
      if (!(alvo instanceof Node)) return;
      if (refGatilho.current?.contains(alvo) === true) return;
      if (refPainel.current?.contains(alvo) === true) return;
      fechar(true);
    };
    document.addEventListener('pointerdown', aoApontarFora, true);
    return () => document.removeEventListener('pointerdown', aoApontarFora, true);
  }, [aberto, fechar, refGatilho, refPainel]);

  /* A opção ativa tem de estar visível: quem anda é o `aria-activedescendant`,
   * e o painel não rola atrás dele sozinho. */
  useEffect(() => {
    if (!aberto || indiceAtivo < 0) return;
    const opcoes = refPainel.current?.querySelectorAll<HTMLElement>('[role="option"]');
    opcoes?.item(indiceAtivo)?.scrollIntoView({ block: 'nearest' });
  }, [aberto, indiceAtivo, refPainel]);

  const total = resultado.opcoes.length;

  const mover = (passo: number) => {
    if (total === 0) return;
    setIndiceAtivo((atual) => {
      const proximo = atual < 0 ? (passo > 0 ? 0 : total - 1) : atual + passo;
      return ((proximo % total) + total) % total;
    });
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLInputElement>) => {
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        if (!aberto) {
          abrir(true);
          return;
        }
        /* Alt+Seta abre sem andar — é o gesto de "só me mostre a lista". */
        if (!evento.altKey) mover(1);
        return;

      case 'ArrowUp':
        evento.preventDefault();
        if (evento.altKey) {
          if (aberto) fechar(true);
          return;
        }
        if (!aberto) {
          abrir(true);
          return;
        }
        mover(-1);
        return;

      case 'Enter': {
        if (!aberto) return; /* Fechado, Enter é do formulário. */
        const opcao = indiceAtivo < 0 ? undefined : resultado.opcoes.at(indiceAtivo);
        if (opcao === undefined) return;
        /* Sem isto, escolher na lista também enviaria o formulário em volta. */
        evento.preventDefault();
        escolher(opcao);
        return;
      }

      case 'Escape':
        evento.preventDefault();
        if (aberto) {
          fechar(true);
          return;
        }
        /* Fechado, Escape limpa: é como o padrão ARIA repõe o campo em branco,
         * e é a única forma de limpar sem ponteiro (o X não é ponto de tabulação). */
        limpar();
        return;

      case 'Tab':
        /*
         * Tab NÃO aceita a opção ativa. A ativa é onde o cursor passou, não o
         * que a pessoa decidiu — confirmar por engano um item da lista é pior
         * do que sair sem escolher. Enter e clique escolhem; Tab só sai.
         */
        if (aberto) fechar(true);
        return;

      default:
        /* Home/End ficam com o cursor de texto: aqui isto é um campo de
         * digitação antes de ser uma lista. */
        return;
    }
  };

  const aoSairDoCampo = () => {
    /*
     * Arrastar a barra de rolagem do painel tira o foco do campo no Chrome.
     * Sem esta volta, rolar a lista com o mouse a fecharia.
     */
    if (apontandoNoPainel.current) {
      apontandoNoPainel.current = false;
      refCampo.current?.focus();
      return;
    }
    fechar(true);
  };

  const buscando = resultado.situacao === 'buscando';
  const falhou = resultado.situacao === 'falhou';
  const termoBuscado = resultado.termo;

  /*
   * Anúncio para leitor de tela. A lista é uma região que muda sozinha depois
   * da digitação: sem isto, quem não vê a tela não sabe se apareceram oito
   * resultados, nenhum, ou se a busca caiu.
   */
  let anuncio = '';
  if (aberto) {
    if (buscando) anuncio = 'Buscando…';
    else if (falhou) anuncio = 'A busca falhou.';
    else if (total > 0) anuncio = `${total} ${total === 1 ? 'resultado' : 'resultados'}.`;
    else if (termoBuscado !== null && termoBuscado !== '') anuncio = 'Nenhum resultado.';
  }

  const padding = cn(Icone !== null && 'pl-9', 'pr-9');

  return (
    <div className={cn('relative min-w-0', className)}>
      {/* O valor que o formulário envia é a ESCOLHA, nunca o que está digitado. */}
      {nome !== undefined && <input type="hidden" name={nome} value={valor?.valor ?? ''} />}

      <div ref={refGatilho} style={estiloGatilho} className="relative">
        {Icone !== null && (
          <Icone
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-subtle"
          />
        )}

        <Input
          ref={refCampo}
          id={idCampo}
          size={size}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={desabilitado}
          placeholder={placeholder}
          value={texto}
          aria-expanded={aberto}
          aria-controls={aberto ? idLista : undefined}
          aria-activedescendant={
            aberto && indiceAtivo >= 0 ? `${idLista}-opcao-${indiceAtivo}` : undefined
          }
          aria-autocomplete="list"
          aria-label={rotuladoPor === undefined ? rotulo : undefined}
          aria-labelledby={rotuladoPor}
          aria-describedby={descritoPor}
          aria-invalid={invalido}
          aria-required={obrigatorio ? true : undefined}
          onChange={(evento) => {
            setTexto(evento.target.value);
            abrir(false);
          }}
          onClick={() => abrir(true)}
          onKeyDown={aoTeclar}
          onBlur={aoSairDoCampo}
          className={padding}
        />

        {/* Uma casa à direita, três papéis em ordem de urgência. */}
        {buscando ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-content-subtle">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            <span className="sr-only">Buscando</span>
          </span>
        ) : texto !== '' && !desabilitado ? (
          <button
            type="button"
            /*
             * Fora da tabulação de propósito: entre o campo e o próximo campo
             * do formulário não cabe um terceiro parada. Por teclado, Escape
             * faz o mesmo.
             */
            tabIndex={-1}
            aria-label={`Limpar ${rotulo.toLocaleLowerCase('pt-BR')}`}
            onMouseDown={(evento) => evento.preventDefault()}
            onClick={limpar}
            className={cn(
              'absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center',
              'rounded-control text-content-subtle transition-colors transition-base',
              'hover:bg-surface-muted hover:text-content',
            )}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : (
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-content-subtle"
          />
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>

      {aberto &&
        createPortal(
          <div
            ref={refPainel}
            style={estiloPainel}
            onPointerDown={() => {
              apontandoNoPainel.current = true;
            }}
            className={cn(
              CLASSES_DO_PAINEL_FLUTUANTE,
              'max-h-[min(20rem,60dvh)] animate-pop',
              classNamePainel,
            )}
          >
            {falhou ? (
              <div className={CLASSES_DO_AVISO}>
                <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
                <span className="flex-1">Não foi possível buscar.</span>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => {
                    buscaImediata.current = true;
                    setTentativa((n) => n + 1);
                  }}
                  className="shrink-0 rounded-control px-2 py-1 text-label text-content-accent transition-base hover:bg-surface-muted"
                >
                  Tentar de novo
                </button>
              </div>
            ) : total === 0 && buscando ? (
              <p className={CLASSES_DO_AVISO}>
                <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
                Buscando…
              </p>
            ) : total === 0 ? (
              /*
               * Os dois vazios são coisas diferentes e não podem dizer a mesma
               * frase: "ainda não procurei" contra "procurei e não existe".
               */
              <p className={CLASSES_DO_AVISO}>
                {termoBuscado === null || termoBuscado === ''
                  ? inicialRotulo
                  : (vazioRotulo ?? `Nada encontrado para “${termoBuscado}”.`)}
              </p>
            ) : (
              <ul id={idLista} role="listbox" aria-label={rotulo} className="flex flex-col">
                {resultado.opcoes.map((opcao, indice) => {
                  const ativa = indice === indiceAtivo;
                  const selecionada = opcao.valor === chaveSelecionada;
                  const bloqueada = opcao.desabilitado === true;
                  return (
                    <li
                      key={opcao.valor}
                      id={`${idLista}-opcao-${indice}`}
                      role="option"
                      aria-selected={selecionada}
                      aria-disabled={bloqueada ? true : undefined}
                      /* Sem isto o campo perde o foco no mousedown e a lista
                       * fecha antes de o clique chegar. */
                      onMouseDown={(evento) => evento.preventDefault()}
                      onClick={() => escolher(opcao)}
                      className={cn(
                        'flex min-h-9 cursor-pointer items-center gap-3 rounded-control px-2.5 py-1.5 text-body',
                        'text-content-default transition-base',
                        ativa && !bloqueada && 'bg-surface-muted text-content',
                        bloqueada && 'cursor-not-allowed text-content-subtle',
                      )}
                    >
                      {renderOpcao === undefined ? (
                        <OpcaoPadrao opcao={opcao} />
                      ) : (
                        renderOpcao(opcao, { ativa, selecionada, termo: termoBuscado ?? '' })
                      )}
                      {selecionada && (
                        <Check aria-hidden className="size-4 shrink-0 text-content-accent" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Rótulo, descrição embaixo e detalhe à direita — a forma que as três telas pedem. */
function OpcaoPadrao({ opcao }: { opcao: OpcaoDoCombobox }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{opcao.rotulo}</span>
        {opcao.descricao !== undefined && (
          <span className="block truncate text-caption text-content-subtle">{opcao.descricao}</span>
        )}
      </span>
      {opcao.detalhe !== undefined && (
        <span className="shrink-0 text-num text-content-muted">{opcao.detalhe}</span>
      )}
    </>
  );
}
