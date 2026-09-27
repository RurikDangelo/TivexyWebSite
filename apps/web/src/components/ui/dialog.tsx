'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/*
 * Diálogo sobre o `<dialog>` nativo com `showModal()`.
 *
 * A escolha do elemento nativo não é economia de código: foco preso, Escape,
 * inércia do fundo e a camada superior (top layer) são do navegador, e nenhuma
 * reimplementação em React empata com eles. Por viver na top layer, o diálogo
 * também ignora `z-index` — a escala `--z-*` não se aplica aqui.
 *
 * Entrada e saída por `@starting-style` + `transition-behavior: allow-discrete`
 * (`transition-discrete`): sem isso o `display: none` do estado fechado corta a
 * animação de saída no primeiro quadro. `overlay` precisa estar na lista de
 * propriedades em transição — é ela que segura o elemento na top layer até o
 * fim. O bloco `prefers-reduced-motion` de `globals.css` já zera a duração de
 * tudo isto; não há classe de movimento reduzido aqui de propósito.
 */
const painel = cva(
  [
    /* `p-0` e a largura explícita anulam o padding e o `width: fit-content` do agente. */
    'm-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0',
    'rounded-panel border border-line-subtle bg-surface-elevated text-content-default shadow-modal',
    /* Fechado, o agente aplica `display: none`; só o estado aberto vira flex. */
    'open:flex',

    /* Véu: cor literal porque `::backdrop` não herda da página em navegador antigo. */
    'backdrop:bg-[rgb(11_20_36/0.55)] dark:backdrop:bg-[rgb(2_5_12/0.7)]',
    'backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-[var(--duration-fast)] backdrop:ease-[var(--ease-standard)]',
    'open:backdrop:opacity-100 starting:open:backdrop:opacity-0',

    /*
     * O estado base é o fechado, e é dele que saem duração e curva da SAÍDA:
     * a transição usa o tempo do estado de destino. Entrar demora 240ms e
     * desacelera; sair leva 150ms e acelera — o que vai embora não se acompanha.
     */
    'translate-y-2 scale-[0.98] opacity-0',
    'transition-[opacity,translate,scale,overlay,display] transition-discrete',
    'duration-[var(--duration-fast)] ease-[var(--ease-in)]',
    'open:translate-y-0 open:scale-100 open:opacity-100',
    'open:duration-[var(--duration-base)] open:ease-[var(--ease-out)]',
    'starting:open:translate-y-2 starting:open:scale-[0.98] starting:open:opacity-0',
  ],
  {
    variants: {
      tamanho: {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
      },
    },
    defaultVariants: { tamanho: 'md' },
  },
);

export type TamanhoDoDialogo = NonNullable<VariantProps<typeof painel>['tamanho']>;

/**
 * A mecânica compartilhada por `Dialog` e `AlertDialog`: sincronizar o elemento
 * nativo com a prop `aberto`, travar o fundo e devolver o foco ao gatilho.
 */
function useDialogoNativo(aberto: boolean, aoFechar: () => void) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const gatilho = useRef<HTMLElement | null>(null);
  const pressionouNoVeu = useRef(false);

  useEffect(() => {
    const elemento = dialogo.current;
    if (elemento === null) return;

    if (aberto && !elemento.open) {
      /* Guardado antes de abrir: depois de `showModal()` o foco já é do diálogo. */
      gatilho.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      elemento.showModal();
    } else if (!aberto && elemento.open) {
      elemento.close();
    }
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;

    /*
     * O modal deixa o fundo inerte, mas não impede a roda do mouse de rolar a
     * página atrás. Esconder a barra de rolagem alarga o documento e joga o
     * conteúdo para a direita — daí a compensação pela largura da barra, que no
     * Windows é visível a cada abertura.
     */
    const corpo = document.body;
    const overflowAnterior = corpo.style.overflow;
    const recuoAnterior = corpo.style.paddingRight;
    const larguraDaBarra = window.innerWidth - document.documentElement.clientWidth;

    corpo.style.overflow = 'hidden';
    if (larguraDaBarra > 0) corpo.style.paddingRight = `${larguraDaBarra}px`;

    return () => {
      corpo.style.overflow = overflowAnterior;
      corpo.style.paddingRight = recuoAnterior;
    };
  }, [aberto]);

  /* `close` cobre todos os caminhos de fechamento — Escape, véu e `close()`. */
  function aoFecharNativo() {
    const alvo = gatilho.current;
    gatilho.current = null;
    /*
     * O navegador também devolve o foco sozinho, mas só quando o gatilho ainda
     * está lá: uma ação que remove a linha que abriu o diálogo deixaria o foco
     * no `<body>`, e a navegação por teclado recomeçaria do topo da página.
     */
    if (alvo !== null && alvo.isConnected) alvo.focus();
    /* Escape fecha o elemento sem passar pelo estado de quem controla. */
    if (aberto) aoFechar();
  }

  /*
   * Clique no véu: o evento do `::backdrop` chega com `target` no próprio
   * `<dialog>`. Exigir que o pressionar também tenha começado ali evita que
   * selecionar um texto e soltar o botão fora feche o diálogo.
   */
  function aoPressionar(evento: MouseEvent<HTMLDialogElement>) {
    pressionouNoVeu.current = evento.target === evento.currentTarget;
  }

  function aoClicar(evento: MouseEvent<HTMLDialogElement>) {
    if (evento.target !== evento.currentTarget) return;
    if (!pressionouNoVeu.current) return;
    aoFechar();
  }

  return { dialogo, aoFecharNativo, aoPressionar, aoClicar };
}

interface CascaProps {
  aberto: boolean;
  aoFechar: () => void;
  /** `alertdialog` no que interrompe para pedir uma decisão. */
  papel: 'dialog' | 'alertdialog';
  rotuladoPor: string;
  descritoPor: string | undefined;
  tamanho: TamanhoDoDialogo | undefined;
  /** O alerta não fecha pelo véu: a escolha tem de ser dita, não esbarrada. */
  fecharPeloVeu: boolean;
  className: string | undefined;
  children: ReactNode;
}

function CascaDeDialogo({
  aberto,
  aoFechar,
  papel,
  rotuladoPor,
  descritoPor,
  tamanho,
  fecharPeloVeu,
  className,
  children,
}: CascaProps) {
  const { dialogo, aoFecharNativo, aoPressionar, aoClicar } = useDialogoNativo(aberto, aoFechar);

  return (
    <dialog
      ref={dialogo}
      role={papel}
      /* Redundante com `showModal()`, mas o papel sobrescrito perde o estado modal em leitor antigo. */
      aria-modal
      aria-labelledby={rotuladoPor}
      aria-describedby={descritoPor}
      onClose={aoFecharNativo}
      onMouseDown={fecharPeloVeu ? aoPressionar : undefined}
      onClick={fecharPeloVeu ? aoClicar : undefined}
      className={cn(painel({ tamanho }), className)}
    >
      {children}
    </dialog>
  );
}

export interface DialogProps {
  aberto: boolean;
  /** Controlado: quem abriu fecha. Chamado também por Escape e pelo véu. */
  aoFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  tamanho?: TamanhoDoDialogo;
  /** Ações do rodapé. Sem rodapé, o diálogo é de leitura e sai pelo X. */
  rodape?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Diálogo modal de propósito geral.
 *
 * O botão de fechar é o primeiro focável em ordem de documento, e é nele que
 * `showModal()` põe o foco — previsível, e sempre a uma tecla da saída.
 */
export function Dialog({
  aberto,
  aoFechar,
  titulo,
  descricao,
  tamanho,
  rodape,
  className,
  children,
}: DialogProps) {
  const idTitulo = useId();
  const idDescricao = useId();

  return (
    <CascaDeDialogo
      aberto={aberto}
      aoFechar={aoFechar}
      papel="dialog"
      rotuladoPor={idTitulo}
      descritoPor={descricao === undefined ? undefined : idDescricao}
      tamanho={tamanho}
      fecharPeloVeu
      className={className}
    >
      <div className="flex items-start gap-3 border-b border-line-subtle p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* A base não estiliza mais h1-h4: cor e escala vêm do token. */}
          <h2 id={idTitulo} className="text-h2 text-content">
            {titulo}
          </h2>
          {descricao !== undefined && (
            <p id={idDescricao} className="text-caption text-content-muted">
              {descricao}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar"
          onClick={aoFechar}
          className="-mr-1 -mt-1 shrink-0"
        >
          <X aria-hidden />
        </Button>
      </div>

      {children !== undefined && (
        /* Só o corpo rola; cabeçalho e rodapé ficam à vista em diálogo alto. */
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-body">
          {children}
        </div>
      )}

      {rodape !== undefined && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle p-4">
          {rodape}
        </div>
      )}
    </CascaDeDialogo>
  );
}

export type SeveridadeDoAlerta = 'danger' | 'warning';

/*
 * `warning` confirma com o botão da marca porque a ação é reversível — pintar
 * de vermelho tudo que pede confirmação ensina a ignorar o vermelho.
 */
const SEVERIDADES = {
  danger: { Icone: OctagonAlert, aro: 'bg-danger-soft text-danger', variante: 'danger' },
  warning: { Icone: TriangleAlert, aro: 'bg-warning-soft text-warning', variante: 'brand' },
} as const;

/**
 * O botão que confirma, ciente de que a ação está em curso.
 *
 * Componente separado porque `useFormStatus` só enxerga o `<form>` acima dele —
 * e é esse estado que impede o clique duplo virar duas execuções.
 */
function BotaoConfirmar({
  severidade,
  rotulo,
  liberado,
  descritoPor,
}: {
  severidade: SeveridadeDoAlerta;
  rotulo: string;
  liberado: boolean;
  descritoPor: string | undefined;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={SEVERIDADES[severidade].variante}
      disabled={pending || !liberado}
      aria-busy={pending}
      aria-describedby={descritoPor}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Confirmando…
        </>
      ) : (
        rotulo
      )}
    </Button>
  );
}

export interface AlertDialogProps {
  aberto: boolean;
  aoFechar: () => void;
  severidade: SeveridadeDoAlerta;
  titulo: string;
  /** O que acontece ao confirmar, dito antes de acontecer. */
  descricao?: ReactNode;
  confirmarRotulo: string;
  /**
   * A ação de confirmar. Recebe o `FormData` do diálogo, então aceita tanto um
   * callback quanto uma Server Action. O diálogo fecha quando ela termina; se
   * ela lançar, o diálogo continua aberto e o erro sobe.
   */
  confirmarAction: (dados: FormData) => void | Promise<void>;
  /**
   * Texto que a pessoa precisa digitar para liberar o botão. Para o
   * irreversível: desfazer um provisionamento passa por escrever o nome do
   * cliente, não por acertar a posição de um botão.
   */
  exigirTexto?: string;
  cancelarRotulo?: string;
  tamanho?: TamanhoDoDialogo;
  /** Detalhes adicionais — uma lista do que muda, por exemplo. */
  children?: ReactNode;
}

/**
 * Confirmação destrutiva, no lugar do `window.confirm()`.
 *
 * Escape e o botão Cancelar fecham; o véu não. O `window.confirm()` que este
 * componente substitui bloqueia a aba inteira, não é estilizável, não diz o que
 * está em jogo além de uma linha de texto e não sabe esperar por uma ação de
 * servidor.
 */
export function AlertDialog({
  aberto,
  aoFechar,
  severidade,
  titulo,
  descricao,
  confirmarRotulo,
  confirmarAction,
  exigirTexto,
  cancelarRotulo = 'Cancelar',
  tamanho,
  children,
}: AlertDialogProps) {
  const idTitulo = useId();
  const idDescricao = useId();
  const idCampo = useId();
  const idAjuda = useId();
  const [digitado, setDigitado] = useState('');

  /*
   * Zerar o campo na virada de `aberto`, durante a renderização: um effect aqui
   * causaria uma segunda renderização, e reabrir o diálogo com a confirmação
   * anterior ainda preenchida derrota a trava.
   */
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    setDigitado('');
  }

  /* Maiúsculas e espaços nas pontas não são o que se está confirmando. */
  const liberado =
    exigirTexto === undefined ||
    digitado.trim().toLocaleLowerCase('pt-BR') === exigirTexto.trim().toLocaleLowerCase('pt-BR');

  const { Icone, aro } = SEVERIDADES[severidade];

  async function confirmar(dados: FormData) {
    await confirmarAction(dados);
    aoFechar();
  }

  return (
    <CascaDeDialogo
      aberto={aberto}
      aoFechar={aoFechar}
      papel="alertdialog"
      rotuladoPor={idTitulo}
      descritoPor={descricao === undefined ? undefined : idDescricao}
      tamanho={tamanho}
      fecharPeloVeu={false}
      className={undefined}
    >
      <form action={confirmar} className="flex min-h-0 flex-col">
        <div className="flex min-h-0 gap-4 overflow-y-auto overscroll-contain p-4">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-pill', aro)}>
            <Icone className="size-5" aria-hidden />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id={idTitulo} className="text-h2 text-content">
                {titulo}
              </h2>
              {descricao !== undefined && (
                <p id={idDescricao} className="text-body text-content-muted">
                  {descricao}
                </p>
              )}
            </div>

            {children}

            {exigirTexto !== undefined && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idCampo} className="text-label text-content-default">
                  Para confirmar, digite{' '}
                  <span className="font-semibold text-content">{exigirTexto}</span>
                </label>
                <Input
                  id={idCampo}
                  name="confirmacao"
                  value={digitado}
                  onChange={(evento) => setDigitado(evento.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  aria-describedby={idAjuda}
                />
                <p id={idAjuda} className="text-caption text-content-subtle">
                  O botão de confirmar só libera com o texto igual ao de cima.
                </p>
              </div>
            )}
          </div>
        </div>

        {/*
         * Cancelar vem antes no documento: sem `exigirTexto`, é nele que
         * `showModal()` põe o foco, e o Enter distraído não destrói nada.
         */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle p-4">
          <Button type="button" variant="outline" onClick={aoFechar}>
            {cancelarRotulo}
          </Button>
          <BotaoConfirmar
            severidade={severidade}
            rotulo={confirmarRotulo}
            liberado={liberado}
            descritoPor={exigirTexto === undefined ? undefined : idAjuda}
          />
        </div>
      </form>
    </CascaDeDialogo>
  );
}
