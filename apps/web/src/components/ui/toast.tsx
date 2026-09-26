'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Avisos efêmeros (P13 do DESIGN_SYSTEM).
 *
 * Existe para tirar da tela os `FormSuccess` permanentes que hoje se empilham
 * dentro de cada `<li>` depois de uma ação de linha — em `entry-rows.tsx` são
 * três de uma vez, e nenhum some. Confirmação de ação é mensagem de momento:
 * aparece, é anunciada, e sai.
 *
 * Fica "toast" em inglês porque "Avisos" já é um módulo do produto (a página e
 * o sino da casca); duas coisas diferentes não podem ter o mesmo nome. As
 * props, essas sim, são vocabulário do produto.
 */

export type TomDoToast = 'sucesso' | 'erro' | 'aviso' | 'informacao';

export interface AcaoDoToast {
  rotulo: string;
  aoAtivar: () => void;
}

export interface ToastPedido {
  titulo: string;
  descricao?: string;
  tom?: TomDoToast;
  /** `0` fica até fechar na mão. É o padrão de `erro` — ver `DURACAO_PADRAO`. */
  duracaoMs?: number;
  /** Um botão só, do tipo "Desfazer". Fechar o toast é sempre possível sem ele. */
  acao?: AcaoDoToast;
}

/** O que `useToast()` entrega. `mostrar` devolve o id, para fechar antes da hora. */
export interface Disparador {
  mostrar: (pedido: ToastPedido) => string;
  fechar: (id: string) => void;
}

export interface ToastProviderProps {
  children: ReactNode;
}

interface ToastNaTela extends ToastPedido {
  id: string;
  tom: TomDoToast;
  duracaoMs: number;
  saindo: boolean;
}

/*
 * Erro não expira sozinho: o que ninguém leu, ninguém corrigiu. Aviso fica
 * mais tempo que confirmação porque pede uma decisão, não só ciência.
 */
const DURACAO_PADRAO: Record<TomDoToast, number> = {
  sucesso: 5000,
  informacao: 5000,
  aviso: 7000,
  erro: 0,
};

/* Quatro toasts empilhados viram um painel. Os excedentes esperam a vez. */
const LIMITE_VISIVEL = 3;

/* Espelha `--duration-fast`, a duração de `animate-toast-out`. */
const DURACAO_DA_SAIDA_MS = 150;

const ICONE = {
  sucesso: CheckCircle2,
  erro: AlertCircle,
  aviso: AlertTriangle,
  informacao: Info,
} as const;

/* Cor nunca sozinha: o ícone acompanha, e o título diz o que houve. */
const COR_DO_ICONE: Record<TomDoToast, string> = {
  sucesso: 'text-success',
  erro: 'text-danger',
  aviso: 'text-warning',
  informacao: 'text-content-accent',
};

const COR_DA_BARRA: Record<TomDoToast, string> = {
  sucesso: 'bg-success',
  erro: 'bg-danger',
  aviso: 'bg-warning',
  informacao: 'bg-content-accent',
};

/* Contador de módulo em vez de `crypto.randomUUID()`: o id só precisa ser único nesta aba. */
let ultimoId = 0;

const ToastContext = createContext<Disparador | null>(null);

/**
 * Monte uma vez, na casca. A região `aria-live` é única na página: duas
 * regiões concorrentes fazem o leitor de tela anunciar fora de ordem.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly ToastNaTela[]>([]);
  const timersDeSaida = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const semMovimento = usePrefereMenosMovimento();

  const fechar = useCallback((id: string) => {
    /* Já saindo: o clique no X durante a animação não pode reagendar a remoção. */
    if (timersDeSaida.current.has(id)) return;

    setToasts((atuais) => atuais.map((t) => (t.id === id ? { ...t, saindo: true } : t)));

    timersDeSaida.current.set(
      id,
      setTimeout(() => {
        timersDeSaida.current.delete(id);
        setToasts((atuais) => atuais.filter((t) => t.id !== id));
      }, DURACAO_DA_SAIDA_MS),
    );
  }, []);

  const mostrar = useCallback((pedido: ToastPedido) => {
    const id = `toast-${++ultimoId}`;
    const tom = pedido.tom ?? 'informacao';
    setToasts((atuais) => [
      ...atuais,
      { ...pedido, id, tom, duracaoMs: pedido.duracaoMs ?? DURACAO_PADRAO[tom], saindo: false },
    ]);
    return id;
  }, []);

  useEffect(() => {
    const timers = timersDeSaida.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  /* Valor estável: quem só dispara toast não rerenderiza quando a fila muda. */
  const disparador = useMemo<Disparador>(() => ({ mostrar, fechar }), [mostrar, fechar]);

  return (
    <ToastContext.Provider value={disparador}>
      {children}
      {/*
       * A região existe desde o primeiro render, mesmo vazia: leitor de tela só
       * anuncia o que entra num `aria-live` que ele já observava. Criá-la junto
       * com o primeiro toast perde o primeiro anúncio.
       *
       * `pointer-events-none` na região e `auto` em cada toast — senão a faixa
       * vazia rouba o clique do rodapé da página inteira.
       */}
      <div
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-toast)] flex flex-col gap-2 p-4 sm:left-auto sm:w-96 sm:max-w-[calc(100vw-2rem)]"
      >
        {/* Fila de verdade: o excedente espera a vez em vez de sumir. */}
        {toasts.slice(0, LIMITE_VISIVEL).map((toast) => (
          <ToastItem key={toast.id} toast={toast} aoFechar={fechar} semMovimento={semMovimento} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Dispara um aviso efêmero. Só dentro da casca, onde o `ToastProvider` está montado. */
export function useToast(): Disparador {
  const disparador = useContext(ToastContext);
  if (disparador === null) {
    throw new Error('useToast() exige <ToastProvider> acima na árvore — ele é montado na casca.');
  }
  return disparador;
}

function ToastItem({
  toast,
  aoFechar,
  semMovimento,
}: {
  toast: ToastNaTela;
  aoFechar: (id: string) => void;
  semMovimento: boolean;
}) {
  const [sobOPonteiro, setSobOPonteiro] = useState(false);
  const [comFoco, setComFoco] = useState(false);
  /*
   * Ponteiro e foco pausam por motivos diferentes — ler e usar o botão — e um
   * não desfaz o outro: tirar o mouse enquanto o "Desfazer" está focado não
   * pode reiniciar a contagem.
   */
  const pausado = sobOPonteiro || comFoco;

  /* O que ainda falta do relógio. Sobrevive às pausas; por isso é ref, não estado. */
  const restanteMs = useRef(toast.duracaoMs);
  const retomadoEm = useRef(0);

  useEffect(() => {
    if (toast.duracaoMs === 0 || toast.saindo || pausado) return;

    retomadoEm.current = Date.now();
    const timer = setTimeout(() => aoFechar(toast.id), restanteMs.current);

    return () => {
      clearTimeout(timer);
      /* Desconta o que correu: sem isto, cada pausa devolveria o tempo cheio. */
      restanteMs.current = Math.max(0, restanteMs.current - (Date.now() - retomadoEm.current));
    };
  }, [pausado, toast.duracaoMs, toast.saindo, toast.id, aoFechar]);

  const Icone = ICONE[toast.tom];
  /*
   * Com movimento reduzido a barra some: a regra global zera a duração de toda
   * animação, e uma barra que chega vazia em 0,01ms mentiria sobre o tempo que
   * o toast ainda vai ficar na tela.
   */
  const mostrarBarra = toast.duracaoMs > 0 && !semMovimento;

  return (
    <div
      onMouseEnter={() => setSobOPonteiro(true)}
      onMouseLeave={() => setSobOPonteiro(false)}
      onFocus={() => setComFoco(true)}
      onBlur={() => setComFoco(false)}
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-panel border border-line-subtle bg-surface-elevated p-3 shadow-overlay',
        toast.saindo ? 'animate-toast-out' : 'animate-toast-in',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icone className={cn('mt-0.5 size-4 shrink-0', COR_DO_ICONE[toast.tom])} aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-label text-content">{toast.titulo}</p>
          {toast.descricao !== undefined && (
            <p className="mt-0.5 text-caption text-content-muted">{toast.descricao}</p>
          )}
          {toast.acao !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                toast.acao?.aoAtivar();
                aoFechar(toast.id);
              }}
            >
              {toast.acao.rotulo}
            </Button>
          )}
        </div>

        {/* 28px de alvo, acima do mínimo de 24px da seção de acessibilidade. */}
        <button
          type="button"
          onClick={() => aoFechar(toast.id)}
          aria-label="Fechar mensagem"
          className="-mt-0.5 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-control text-content-subtle transition-base hover:bg-surface-sunken hover:text-content"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {mostrarBarra && (
        /*
         * O relógio visível. Reaproveita o keyframe `tvx-fill` (scaleX 0→1) em
         * `reverse`, que é esvaziar. Tudo em `style` inline, não em utilidade:
         * a ordem entre `animate-fill` e uma propriedade arbitrária dentro da
         * mesma camada não é garantida, e a barra falharia em silêncio.
         */
        <span
          aria-hidden
          className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left', COR_DA_BARRA[toast.tom])}
          style={{
            animationName: 'tvx-fill',
            animationDuration: `${toast.duracaoMs}ms`,
            animationTimingFunction: 'linear',
            animationDirection: 'reverse',
            animationFillMode: 'both',
            /* A pausa do CSS acompanha a do `setTimeout`: os dois param juntos. */
            animationPlayState: pausado ? 'paused' : 'running',
          }}
        />
      )}
    </div>
  );
}

const CONSULTA_DE_MOVIMENTO = '(prefers-reduced-motion: reduce)';

function assinarMovimento(aoMudar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_DE_MOVIMENTO);
  consulta.addEventListener('change', aoMudar);
  return () => consulta.removeEventListener('change', aoMudar);
}

const lerMovimento = () => window.matchMedia(CONSULTA_DE_MOVIMENTO).matches;

/*
 * `false` no servidor: lá não existe media query, e é o valor que faz o HTML do
 * servidor bater com a primeira pintura do cliente — divergir aqui é erro de
 * hidratação.
 */
const lerMovimentoNoServidor = () => false;

/**
 * Consultado uma vez no provider, não por toast: N ouvintes de media query
 * para a mesma pergunta seria desperdício, e o valor é o mesmo para todos.
 *
 * `useSyncExternalStore` e não `useState` + `useEffect`: a preferência de
 * movimento é estado de fora do React, e ler com effect significa pintar uma vez
 * com o valor errado antes de corrigir. Aqui o valor certo já chega na primeira
 * pintura do cliente, e o React tem como manter a leitura coerente quando
 * interrompe uma renderização no meio.
 */
function usePrefereMenosMovimento(): boolean {
  return useSyncExternalStore(assinarMovimento, lerMovimento, lerMovimentoNoServidor);
}
