declare global {
  interface Window {
    __tivexyReady?: boolean;
  }
}

/* ── Revelação ao entrar na viewport ───────────────────────────────── */

// [data-reveal] anima o próprio elemento; [data-reveal-group] só recebe a classe
// e deixa cada componente orquestrar os filhos (ex.: linha do tempo do processo).
const elements = document.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal-group]');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
  );

  elements.forEach((element) => observer.observe(element));
} else {
  elements.forEach((element) => element.classList.add('is-revealed'));
}

/* ── Alturas reais para as seções com content-visibility ───────────── */

// Seções fora da tela começam com altura estimada (mais rápido no carregamento). Uma vez
// renderizadas, o navegador memoriza a altura real (contain-intrinsic-size: auto), e é isso
// que faz links como /#contato pararem exatamente na seção. Renderizamos tudo uma vez quando
// a página fica ociosa, ou imediatamente se alguém usar um link interno antes disso.
const root = document.documentElement;
let measured = false;

function measureSections() {
  if (measured) return;
  measured = true;
  root.classList.add('sections-measured');
  void document.body.offsetHeight;
}

const idle =
  window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200));
window.addEventListener('load', () => idle(measureSections, { timeout: 2500 }), { once: true });

document.addEventListener(
  'click',
  (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href*="#"]');
    if (link && new URL(link.href).pathname === window.location.pathname) measureSections();
  },
  { capture: true },
);

document.addEventListener('focusin', measureSections, { once: true });

// Chegada com âncora vinda de outra página (ex.: /#contato pelo menu de uma página de solução):
// medimos já, enquanto o navegador ainda corrige a rolagem até a âncora durante o carregamento.
if (window.location.hash) measureSections();

window.__tivexyReady = true;

export {};
