import { media } from '@/config/breakpoints';
import {
  bindScrollProgress,
  easeInOut,
  easeOut,
  lerp,
  range,
  smooth,
} from '@/scripts/scroll-progress';
import {
  ACTOR_STAGGER,
  actors,
  journeySteps,
  rectCenter,
  reducedSnapshot,
  sceneLayouts,
  timing,
  type ActorDef,
  type LayoutName,
  type Point,
} from './timeline';

/*
 * Um único progresso p (0 → 1) comanda a cena inteira.
 *
 * Desempenho: escrevemos propriedades NÃO herdáveis (translate, scale, opacity...) direto
 * em cada elemento. Variáveis CSS herdáveis invalidariam a subárvore toda a cada quadro.
 * O CSS continua descrevendo o quadro inicial (p = 0) para o HTML nascer montado.
 */

/* ── Helpers (declarados antes de qualquer bind) ───────────────────── */

type Styled = HTMLElement | SVGElement;

const written = new WeakMap<Styled, Map<string, string>>();

function setStyle(element: Styled, property: string, value: string) {
  let cache = written.get(element);
  if (!cache) {
    cache = new Map();
    written.set(element, cache);
  }
  if (cache.get(property) === value) return;
  cache.set(property, value);
  element.style.setProperty(property, value);
}

function clearStyle(element: Styled, property: string) {
  written.get(element)?.delete(property);
  element.style.removeProperty(property);
}

const fixed = (value: number, digits = 3) => value.toFixed(digits);
const px = (value: number) => `${value.toFixed(2)}px`;

function pointOnPolyline(points: Point[], t: number): Point {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segments.push(length);
    total += length;
  }
  let distance = t * total;
  for (let i = 0; i < segments.length; i++) {
    if (distance <= segments[i] || i === segments.length - 1) {
      const k = segments[i] > 0 ? Math.min(1, distance / segments[i]) : 0;
      return {
        x: lerp(points[i].x, points[i + 1].x, k),
        y: lerp(points[i].y, points[i + 1].y, k),
      };
    }
    distance -= segments[i];
  }
  return points[points.length - 1];
}

interface ActorRuntime {
  def: ActorDef;
  element: HTMLElement;
  chaos: HTMLElement;
  island: HTMLElement;
  module: HTMLElement;
  counters: { element: HTMLElement; target: number }[];
  flowFill: HTMLElement | null;
  flowSteps: HTMLElement[];
}

interface LinkRuntime {
  actor: ActorDef;
  route: SVGPathElement;
  line: SVGPathElement;
  pulse: SVGCircleElement;
}

/* ── Hero ──────────────────────────────────────────────────────────── */

function initHero(hero: HTMLElement) {
  const $ = <T extends Element>(selector: string, root: ParentNode = hero) =>
    root.querySelector<T>(selector);

  const scene = $<HTMLElement>('[data-scene]');
  const hub = $<HTMLElement>('[data-hub]');
  const copy = $<HTMLElement>('[data-hero-copy]');
  const stage = $<HTMLElement>('[data-hero-stage]');
  if (!scene || !hub || !copy || !stage) return;

  const hubTile = $<HTMLElement>('.hs-hub__tile', hub)!;
  const hubLabel = $<HTMLElement>('.hs-hub__label', hub)!;
  const grid = $<HTMLElement>('.hs-grid', scene)!;
  const glow = $<HTMLElement>('.hs-glow', scene)!;
  const frame = $<HTMLElement>('[data-frame]', scene)!;
  const toast = $<HTMLElement>('[data-toast]', scene)!;
  const end = $<HTMLElement>('[data-hero-end]');
  const hint = $<HTMLElement>('.hero__hint');
  const railFill = $<HTMLElement>('.rail__fill');
  const railSteps = Array.from(hero.querySelectorAll<HTMLElement>('[data-rail-step]'));

  const wideQuery = window.matchMedia(media.md);
  const splitQuery = window.matchMedia(media.lg);
  const reducedQuery = window.matchMedia(media.reducedMotion);

  const actorRuntimes: ActorRuntime[] = actors.map((def) => {
    const element = $<HTMLElement>(`[data-actor="${def.id}"]`, scene)!;
    return {
      def,
      element,
      chaos: $<HTMLElement>('.hs-skin--chaos', element)!,
      island: $<HTMLElement>('.hs-skin--island', element)!,
      module: $<HTMLElement>('.hs-skin--module', element)!,
      counters: Array.from(element.querySelectorAll<HTMLElement>('[data-count]')).map((counter) => ({
        element: counter,
        target: Number(counter.dataset.count),
      })),
      flowFill: $<HTMLElement>('.hs-flow__fill', element),
      flowSteps: Array.from(element.querySelectorAll<HTMLElement>('[data-flow-step]')),
    };
  });

  const linkSvgs = {
    wide: $<SVGSVGElement>('[data-links="wide"]', scene)!,
    compact: $<SVGSVGElement>('[data-links="compact"]', scene)!,
  };

  const collectLinks = (name: LayoutName): LinkRuntime[] =>
    Array.from(linkSvgs[name].querySelectorAll<SVGGElement>('[data-link]')).map((group) => ({
      actor: actors.find((actor) => actor.id === group.dataset.link)!,
      route: group.querySelector<SVGPathElement>('.hs-link__route')!,
      line: group.querySelector<SVGPathElement>('.hs-link__line')!,
      pulse: group.querySelector<SVGCircleElement>('.hs-link__pulse')!,
    }));

  const links: Record<LayoutName, LinkRuntime[]> = {
    wide: collectLinks('wide'),
    compact: collectLinks('compact'),
  };

  let layout: LayoutName = wideQuery.matches ? 'wide' : 'compact';
  let reduced = reducedQuery.matches;
  let progress = 0;
  let unit = 0;
  let peek = 0;
  let shownSnapshot = -1;
  let switchTimer = 0;

  /** px de tela por px de desenho da cena. */
  function measureUnit() {
    unit = scene!.offsetWidth / sceneLayouts[layout].width || 1;
  }

  function renderScene(p: number) {
    if (!unit) measureUnit();
    const sceneLayout = sceneLayouts[layout];

    const phase = p < timing.toIsland[0] ? 'chaos' : p < timing.toModule[1] ? 'islands' : 'panel';
    if (scene!.dataset.phase !== phase) scene!.dataset.phase = phase;

    const frameIn = smooth(p, ...timing.frame);
    setStyle(grid, 'opacity', fixed(1 - 0.9 * smooth(p, ...timing.grid)));
    setStyle(glow, 'opacity', fixed(frameIn));
    setStyle(frame, 'opacity', fixed(frameIn));
    setStyle(frame, 'scale', fixed(0.965 + 0.035 * frameIn));
    setStyle(
      linkSvgs[layout],
      'opacity',
      fixed(1 - smooth(p, timing.toModule[0], timing.toModule[0] + 0.07)),
    );

    const toastIn = smooth(p, ...timing.toast);
    setStyle(toast, 'opacity', fixed(toastIn));
    setStyle(toast, 'translate', `0 ${px((1 - toastIn) * (layout === 'wide' ? 12 : -10) * unit)}`);

    // Hub: surge no centro das ilhas e termina como logo do produto.
    const hubIn = smooth(p, ...timing.hub);
    const hubMove = smooth(p, timing.toModule[0], timing.toModule[1]);
    const labelOut = 1 - smooth(p, timing.toModule[0], timing.toModule[0] + 0.07);
    const { island, islandScale, slot, slotScale } = sceneLayout.hub;
    setStyle(
      hub!,
      'translate',
      `${px(lerp(island.x, slot.x, hubMove) * unit)} ${px(lerp(island.y, slot.y, hubMove) * unit)}`,
    );
    setStyle(hub!, 'scale', fixed(lerp(islandScale * lerp(0.6, 1, hubIn), slotScale, hubMove)));
    setStyle(hub!, 'opacity', fixed(hubIn));
    setStyle(hubLabel, 'opacity', fixed(labelOut));
    hubTile.toggleAttribute('data-docked', labelOut < 0.5);

    for (const link of links[layout]) {
      const stagger = link.actor.order * ACTOR_STAGGER;
      const draw = smooth(p, timing.links[0] + stagger, timing.links[1] + stagger);
      setStyle(link.route, 'opacity', fixed(smooth(p, timing.hub[0] + stagger, timing.links[0] + stagger)));
      setStyle(link.line, 'stroke-dashoffset', fixed(1 - draw));
      setStyle(link.line, 'opacity', fixed(Math.min(1, draw * 24)));

      const travel = range(p, timing.pulses[0] + stagger, timing.pulses[0] + stagger + 0.08);
      const position = pointOnPolyline(link.actor.layouts[layout]!.link, easeInOut(travel));
      link.pulse.setAttribute('cx', position.x.toFixed(1));
      link.pulse.setAttribute('cy', position.y.toFixed(1));
      setStyle(link.pulse, 'opacity', fixed(Math.min(1, travel * 10, (1 - travel) * 10)));
    }

    const count = easeOut(range(p, ...timing.counters));

    for (const runtime of actorRuntimes) {
      const geometry = runtime.def.layouts[layout];
      if (!geometry) continue;

      const { element, def } = runtime;
      const islandStart = timing.toIsland[0] + def.order * ACTOR_STAGGER * 0.5;
      const islandEnd = timing.toIsland[1] + def.order * ACTOR_STAGGER * 0.5;
      const islandSpan = islandEnd - islandStart;
      const moduleStart = timing.toModule[0] + def.order * ACTOR_STAGGER * 0.4;
      const moduleEnd = timing.toModule[1] + def.order * ACTOR_STAGGER * 0.4;
      const moduleDepart = moduleStart + 0.035;

      // Trocas em sequência: um skin some antes do próximo aparecer (sem dupla exposição).
      const toIsland = smooth(p, islandStart, islandEnd);
      const toModule = smooth(p, moduleDepart, moduleEnd);
      const slotCenter = rectCenter(geometry.module);

      const x = lerp(lerp(geometry.chaos.x, geometry.island.x, toIsland), slotCenter.x, toModule);
      const y = lerp(lerp(geometry.chaos.y, geometry.island.y, toIsland), slotCenter.y, toModule);
      setStyle(element, 'translate', `${px(x * unit)} ${px(y * unit)}`);
      setStyle(element, 'rotate', `${lerp(geometry.chaos.r, 0, toIsland).toFixed(2)}deg`);
      setStyle(
        element,
        'scale',
        fixed(lerp(lerp(geometry.chaos.s, geometry.islandScale, toIsland), 1, toModule)),
      );

      setStyle(runtime.chaos, 'opacity', fixed(1 - range(p, islandStart, islandStart + islandSpan * 0.5)));
      setStyle(runtime.chaos, 'scale', fixed(1 - 0.42 * toIsland));

      const islandIn = range(p, islandStart + islandSpan * 0.34, islandStart + islandSpan * 0.84);
      const chipOut = range(p, moduleStart, moduleStart + 0.045);
      setStyle(runtime.island, 'opacity', fixed(islandIn * (1 - chipOut)));
      setStyle(runtime.island, 'scale', fixed(1.12 - 0.12 * easeOut(islandIn)));

      setStyle(runtime.module, 'opacity', fixed(range(p, moduleDepart, moduleDepart + 0.05)));
      setStyle(runtime.module, 'scale', fixed(0.7 + 0.3 * toModule));

      const arrival = timing.pulses[0] + def.order * ACTOR_STAGGER + 0.08;
      element.toggleAttribute('data-connected', p >= arrival);

      for (const counter of runtime.counters) {
        const text = String(Math.round(counter.target * count));
        if (counter.element.textContent !== text) counter.element.textContent = text;
      }

      if (runtime.flowFill) {
        const [flowStart, flowEnd] = timing.flow;
        setStyle(runtime.flowFill, 'scale', `${fixed(range(p, flowStart, flowEnd))} 1`);
        const last = runtime.flowSteps.length - 1;
        runtime.flowSteps.forEach((step, index) => {
          step.toggleAttribute('data-on', p >= flowStart + (flowEnd - flowStart) * (index / last));
        });
      }
    }
  }

  function renderChrome(p: number) {
    const stepIndex = journeySteps.reduce((current, step, index) => (p >= step.at ? index : current), 0);

    if (hero.dataset.step !== String(stepIndex)) {
      hero.dataset.step = String(stepIndex);
      railSteps.forEach((step, index) => {
        step.toggleAttribute('data-reached', index <= stepIndex);
        if (index === stepIndex) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
    }

    const railValue = reduced ? journeySteps[stepIndex].at : p;
    if (railFill) setStyle(railFill, 'clip-path', `inset(0 ${((1 - railValue) * 100).toFixed(2)}% 0 0)`);
    if (hint) setStyle(hint, 'opacity', fixed(1 - range(p, ...timing.hint)));

    if (splitQuery.matches) return;

    const copyOut = smooth(p, ...timing.copyOut);
    const stageIn = smooth(p, ...timing.stageIn);
    setStyle(copy!, 'opacity', fixed(1 - copyOut));
    if (!reduced) setStyle(copy!, 'translate', `0 ${(copyOut * -1.5).toFixed(3)}rem`);
    copy!.toggleAttribute('data-hidden', copyOut > 0.98);

    setStyle(scene!, 'translate', `-50% calc(-50% + ${px(peek * (1 - stageIn))})`);
    const mask = `linear-gradient(to bottom, black calc(100% - ${(3.5 * (1 - stageIn)).toFixed(3)}rem), transparent)`;
    setStyle(stage!, 'mask-image', mask);
    setStyle(stage!, '-webkit-mask-image', mask);

    if (end) {
      const endIn = smooth(p, ...timing.endCta);
      setStyle(end, 'opacity', fixed(endIn));
      if (!reduced) setStyle(end, 'translate', `0 ${((1 - endIn) * 0.75).toFixed(3)}rem`);
      end.toggleAttribute('data-visible', endIn > 0.02);
    }
  }

  function showSnapshot(snapshot: number) {
    if (shownSnapshot === snapshot) return;
    const first = shownSnapshot === -1;
    shownSnapshot = snapshot;
    window.clearTimeout(switchTimer);

    if (first) {
      renderScene(snapshot);
      return;
    }

    // Troca por opacidade, sem nada se deslocando na tela.
    scene!.setAttribute('data-switching', '');
    switchTimer = window.setTimeout(() => {
      renderScene(shownSnapshot);
      scene!.removeAttribute('data-switching');
    }, 170);
  }

  function render(p: number) {
    progress = p;
    hero.toggleAttribute('data-active', p > 0 && p < 1 && !reduced);
    renderChrome(p);
    if (reduced) showSnapshot(reducedSnapshot(p));
    else renderScene(p);
  }

  /** Layout empilhado: a cena começa "espiando" logo abaixo do texto. */
  function measurePeek() {
    if (splitQuery.matches) {
      peek = 0;
    } else {
      const centeredTop = stage!.offsetTop + (stage!.offsetHeight - scene!.offsetHeight) / 2;
      peek = Math.max(0, copy!.offsetTop + copy!.offsetHeight + 24 - centeredTop);
    }
    stage!.toggleAttribute('data-measured', true);
  }

  function clearStackedStyles() {
    for (const property of ['opacity', 'translate']) {
      clearStyle(copy!, property);
      if (end) clearStyle(end, property);
    }
    clearStyle(scene!, 'translate');
    clearStyle(stage!, 'mask-image');
    clearStyle(stage!, '-webkit-mask-image');
    copy!.removeAttribute('data-hidden');
  }

  function refresh() {
    layout = wideQuery.matches ? 'wide' : 'compact';
    if (splitQuery.matches) clearStackedStyles();
    measureUnit();
    measurePeek();
    shownSnapshot = -1;
    render(progress);
  }

  // Quem navega por teclado até o texto escondido volta para o começo da cena.
  copy.addEventListener('focusin', () => {
    if (splitQuery.matches || progress < 0.06) return;
    const top = hero.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  });

  wideQuery.addEventListener('change', refresh);
  splitQuery.addEventListener('change', refresh);
  reducedQuery.addEventListener('change', (event) => {
    reduced = event.matches;
    scene.removeAttribute('data-switching');
    if (reduced) {
      clearStyle(copy, 'translate');
      if (end) clearStyle(end, 'translate');
    }
    refresh();
  });

  // Os observers disparam logo após o primeiro layout (e de novo quando fontes ou a janela
  // mudam de tamanho): medimos sem forçar reflow durante o carregamento.
  new ResizeObserver(() => {
    const previousUnit = unit;
    const previousPeek = peek;
    measureUnit();
    measurePeek();
    if (unit !== previousUnit || peek !== previousPeek) render(progress);
  }).observe(stage);
  new ResizeObserver(() => {
    const previousPeek = peek;
    measurePeek();
    if (peek !== previousPeek) render(progress);
  }).observe(copy);

  bindScrollProgress(hero, render, { mode: 'pinned' });
}

const heroElement = document.querySelector<HTMLElement>('[data-hero]');
if (heroElement && !heroElement.dataset.bound) {
  heroElement.dataset.bound = 'true';
  initHero(heroElement);
}
