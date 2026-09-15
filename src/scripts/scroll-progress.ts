/**
 * Motor de progresso amarrado ao scroll (método "Scroll Cinema").
 *
 * Um único número p (0 → 1) por cena comanda tudo o que se move nela.
 *
 * - "pinned":  seção alta com um filho sticky de 100vh.
 *              p = quanto da faixa rolável já foi percorrida.
 * - "passage": seção comum. p vai de 0 (topo entrando em `start` da viewport)
 *              a 1 (centro da seção chegando em `end` da viewport).
 *
 * Armadilhas tratadas:
 * - O estado inicial é aplicado no primeiro callback do IntersectionObserver, que sempre
 *   dispara após o observe() e já com o layout calculado (sem reflow forçado no carregamento).
 * - Com a aba/painel oculto não há requestAnimationFrame nem callbacks de observer: aplica direto.
 * - A altura da seção nunca é alterada aqui (nem com reduced motion).
 */

export type ProgressCallback = (progress: number) => void;

export interface ProgressOptions {
  mode?: 'pinned' | 'passage';
  /** passage: fração da viewport onde o topo da seção marca p = 0 */
  start?: number;
  /** passage: fração da viewport onde o centro da seção marca p = 1 */
  end?: number;
}

interface Binding {
  element: HTMLElement;
  callback: ProgressCallback;
  mode: 'pinned' | 'passage';
  start: number;
  end: number;
  near: boolean;
  last: number;
}

const bindings: Binding[] = [];
let frameRequested = false;
let listening = false;
let observer: IntersectionObserver | undefined;

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

function measure(binding: Binding): number {
  const rect = binding.element.getBoundingClientRect();
  const viewport = window.innerHeight;

  if (binding.mode === 'pinned') {
    const scrollable = binding.element.offsetHeight - viewport;
    return scrollable > 0 ? clamp01(-rect.top / scrollable) : 0;
  }

  const from = viewport * binding.start;
  const to = viewport * binding.end - rect.height / 2;
  const distance = from - to;
  return distance > 0 ? clamp01((from - rect.top) / distance) : 1;
}

function apply(binding: Binding, force = false) {
  const progress = measure(binding);
  if (force || Math.abs(progress - binding.last) > 0.00005) {
    binding.last = progress;
    binding.callback(progress);
  }
}

function flush() {
  frameRequested = false;
  for (const binding of bindings) {
    if (binding.near) apply(binding);
  }
}

export function requestProgressUpdate() {
  if (document.hidden) {
    flush();
    return;
  }
  if (!frameRequested) {
    frameRequested = true;
    requestAnimationFrame(flush);
  }
}

function listen() {
  if (listening) return;
  listening = true;

  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate);
  window.addEventListener('load', requestProgressUpdate);
  document.addEventListener('visibilitychange', requestProgressUpdate);

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const binding = bindings.find((item) => item.element === entry.target);
          if (!binding) continue;
          binding.near = entry.isIntersecting;
          // Ao entrar ou sair da área de interesse, fecha o estado exato (0 ou 1 incluídos).
          apply(binding, true);
        }
      },
      { rootMargin: '50% 0px 50% 0px' },
    );
  }
}

export function bindScrollProgress(
  element: HTMLElement,
  callback: ProgressCallback,
  options: ProgressOptions = {},
): () => void {
  const binding: Binding = {
    element,
    callback,
    mode: options.mode ?? 'pinned',
    start: options.start ?? 1,
    end: options.end ?? 0.5,
    near: true,
    last: -1,
  };

  bindings.push(binding);
  listen();

  if (observer && !document.hidden) {
    observer.observe(element);
  } else {
    observer?.observe(element);
    apply(binding, true);
  }

  return () => {
    observer?.unobserve(element);
    const index = bindings.indexOf(binding);
    if (index >= 0) bindings.splice(index, 1);
  };
}

/** Recalcula uma cena imediatamente (ex.: depois de trocar de layout). */
export function refreshProgress(element: HTMLElement) {
  const binding = bindings.find((item) => item.element === element);
  if (binding) apply(binding, true);
}

/* ── Curvas e interpolação ─────────────────────────────────────────── */

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** 0 antes de `from`, 1 depois de `to`, curva suave no meio. */
export function range(progress: number, from: number, to: number): number {
  if (to <= from) return progress >= to ? 1 : 0;
  return clamp01((progress - from) / (to - from));
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function smooth(progress: number, from: number, to: number): number {
  return easeInOut(range(progress, from, to));
}
