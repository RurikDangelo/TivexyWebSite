/**
 * Jornada do hero: "começa com a operação espalhada em ilhas que não se falam
 * e termina com tudo conectado num único painel Tivexy."
 *
 * Tudo aqui está em unidades de desenho da cena (px de desenho). O CSS converte
 * para a tela com a variável --u, então a composição escala sem perder nitidez.
 *
 * Fases (p = progresso do scroll, 0 → 1):
 *   caos      artefatos soltos: e-mail, planilha, bilhete, chat, sistema antigo, PDF
 *   ilhas     cada artefato vira uma área da empresa, ainda desconectada (cinza)
 *   conexão   o hub Tivexy liga as ilhas; um pulso de dados acende cada uma (azul)
 *   painel    as ilhas ocupam seus lugares no painel; o hub vira o logo do produto
 */
import type { IconName } from '@/components/ui/icons';

export type LayoutName = 'wide' | 'compact';
export type ChaosKind = 'email' | 'sheet' | 'note' | 'chat' | 'legacy' | 'report';
export type ModuleKind = 'kpi' | 'flow' | 'activity' | 'table';
export type Port = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

export interface Pose extends Point {
  r: number;
  s: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActorLayout {
  chaos: Pose;
  island: Point;
  islandScale: number;
  port: Port;
  module: Rect;
  /** Polilinha ortogonal do hub até a porta da ilha. */
  link: Point[];
}

export interface ActorDef {
  id: 'orders' | 'stock' | 'approvals' | 'flow' | 'activity' | 'table';
  department: string;
  icon: IconName;
  chaos: { kind: ChaosKind; w: number; h: number; z: number };
  module: ModuleKind;
  order: number;
  layouts: Partial<Record<LayoutName, ActorLayout>>;
}

export interface SceneLayout {
  width: number;
  height: number;
  hub: { island: Point; islandScale: number; slot: Point; slotScale: number };
  chip: { w: number; h: number };
}

const pt = (x: number, y: number): Point => ({ x, y });

export const HUB_SIZE = 64;

export const sceneLayouts: Record<LayoutName, SceneLayout> = {
  wide: {
    width: 880,
    height: 620,
    hub: { island: pt(440, 310), islandScale: 1, slot: pt(32, 26), slotScale: 24 / HUB_SIZE },
    chip: { w: 150, h: 56 },
  },
  compact: {
    width: 360,
    height: 480,
    hub: { island: pt(180, 244), islandScale: 0.875, slot: pt(24, 22), slotScale: 20 / HUB_SIZE },
    chip: { w: 150, h: 56 },
  },
};

export const actors: ActorDef[] = [
  {
    id: 'orders',
    department: 'Vendas',
    icon: 'cart',
    chaos: { kind: 'email', w: 252, h: 120, z: 3 },
    module: 'kpi',
    order: 0,
    layouts: {
      wide: {
        chaos: { x: 206, y: 122, r: -6, s: 1 },
        island: pt(170, 150),
        islandScale: 1,
        port: 'right',
        module: { x: 208, y: 116, w: 206, h: 92 },
        link: [pt(408, 300), pt(300, 300), pt(300, 150), pt(245, 150)],
      },
      compact: {
        chaos: { x: 132, y: 96, r: -6, s: 0.78 },
        island: pt(84, 108),
        islandScale: 0.88,
        port: 'bottom',
        module: { x: 12, y: 56, w: 162, h: 84 },
        link: [pt(152, 236), pt(84, 236), pt(84, 133)],
      },
    },
  },
  {
    id: 'stock',
    department: 'Estoque',
    icon: 'box',
    chaos: { kind: 'sheet', w: 292, h: 172, z: 4 },
    module: 'kpi',
    order: 1,
    layouts: {
      wide: {
        chaos: { x: 606, y: 128, r: 4, s: 1 },
        island: pt(440, 96),
        islandScale: 1,
        port: 'bottom',
        module: { x: 429, y: 116, w: 206, h: 92 },
        link: [pt(440, 278), pt(440, 124)],
      },
    },
  },
  {
    id: 'approvals',
    department: 'Financeiro',
    icon: 'wallet',
    chaos: { kind: 'note', w: 148, h: 148, z: 6 },
    module: 'kpi',
    order: 2,
    layouts: {
      wide: {
        chaos: { x: 782, y: 346, r: 8, s: 1 },
        island: pt(710, 150),
        islandScale: 1,
        port: 'left',
        module: { x: 650, y: 116, w: 206, h: 92 },
        link: [pt(472, 300), pt(580, 300), pt(580, 150), pt(635, 150)],
      },
      compact: {
        chaos: { x: 274, y: 200, r: 8, s: 0.8 },
        island: pt(276, 108),
        islandScale: 0.88,
        port: 'bottom',
        module: { x: 186, y: 56, w: 162, h: 84 },
        link: [pt(208, 236), pt(276, 236), pt(276, 133)],
      },
    },
  },
  {
    id: 'flow',
    department: 'Operação',
    icon: 'flow',
    chaos: { kind: 'legacy', w: 268, h: 150, z: 2 },
    module: 'flow',
    order: 3,
    layouts: {
      wide: {
        chaos: { x: 216, y: 442, r: 3, s: 1 },
        island: pt(440, 524),
        islandScale: 1,
        port: 'top',
        module: { x: 208, y: 224, w: 416, h: 180 },
        link: [pt(440, 342), pt(440, 496)],
      },
      compact: {
        chaos: { x: 126, y: 326, r: 3, s: 0.76 },
        island: pt(84, 380),
        islandScale: 0.88,
        port: 'top',
        module: { x: 12, y: 152, w: 336, h: 168 },
        link: [pt(152, 252), pt(84, 252), pt(84, 355)],
      },
    },
  },
  {
    id: 'activity',
    department: 'Atendimento',
    icon: 'chat',
    chaos: { kind: 'chat', w: 236, h: 116, z: 5 },
    module: 'activity',
    order: 4,
    layouts: {
      wide: {
        chaos: { x: 598, y: 530, r: -4, s: 1 },
        island: pt(710, 470),
        islandScale: 1,
        port: 'left',
        module: { x: 640, y: 224, w: 216, h: 180 },
        link: [pt(472, 320), pt(580, 320), pt(580, 470), pt(635, 470)],
      },
      compact: {
        chaos: { x: 240, y: 410, r: -4, s: 0.8 },
        island: pt(276, 380),
        islandScale: 0.88,
        port: 'top',
        module: { x: 12, y: 332, w: 336, h: 136 },
        link: [pt(208, 252), pt(276, 252), pt(276, 355)],
      },
    },
  },
  {
    id: 'table',
    department: 'Relatórios',
    icon: 'chart',
    chaos: { kind: 'report', w: 188, h: 232, z: 1 },
    module: 'table',
    order: 5,
    layouts: {
      wide: {
        chaos: { x: 432, y: 320, r: -8, s: 1 },
        island: pt(170, 470),
        islandScale: 1,
        port: 'right',
        module: { x: 208, y: 420, w: 648, h: 176 },
        link: [pt(408, 320), pt(300, 320), pt(300, 470), pt(245, 470)],
      },
    },
  },
];

/** Janelas de cada fase, em p. */
export const timing = {
  toIsland: [0.1, 0.3],
  hub: [0.2, 0.33],
  links: [0.3, 0.44],
  pulses: [0.4, 0.54],
  frame: [0.56, 0.76],
  toModule: [0.58, 0.78],
  grid: [0.5, 0.78],
  counters: [0.7, 0.86],
  flow: [0.72, 0.88],
  toast: [0.87, 0.94],
  hint: [0.005, 0.04],
  copyOut: [0.01, 0.12],
  stageIn: [0.02, 0.16],
  endCta: [0.9, 0.97],
} as const satisfies Record<string, readonly [number, number]>;

/** Atraso entre atores dentro de uma mesma fase. */
export const ACTOR_STAGGER = 0.014;

export const journeySteps = [
  {
    at: 0,
    label: 'Hoje',
    caption: 'Planilhas, e-mails e sistemas que não conversam entre si.',
  },
  {
    at: 0.25,
    label: 'Tecnologia',
    caption: 'Cada área conectada. A informação passa a circular sozinha.',
  },
  {
    at: 0.5,
    label: 'Eficiência',
    caption: 'Tarefas repetitivas viram automações. A equipe foca no que importa.',
  },
  {
    at: 0.75,
    label: 'Crescimento',
    caption: 'Uma operação clara, sob controle e pronta para escalar.',
  },
] as const;

/** Com prefers-reduced-motion: sem movimento, só três quadros com troca por opacidade. */
export function reducedSnapshot(progress: number): number {
  if (progress < 0.3) return 0;
  if (progress < 0.72) return 0.56;
  return 1;
}

/** Polilinha ortogonal com cantos arredondados, no formato do atributo `d`. */
export function roundedPath(points: Point[], radius = 12): string {
  const [first, ...rest] = points;
  let d = `M${first.x} ${first.y}`;

  for (let i = 0; i < rest.length - 1; i++) {
    const prev = points[i];
    const corner = rest[i];
    const next = rest[i + 1];
    const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const ax = corner.x - ((corner.x - prev.x) / inLength) * r;
    const ay = corner.y - ((corner.y - prev.y) / inLength) * r;
    const bx = corner.x + ((next.x - corner.x) / outLength) * r;
    const by = corner.y + ((next.y - corner.y) / outLength) * r;
    d += ` L${ax} ${ay} Q${corner.x} ${corner.y} ${bx} ${by}`;
  }

  const last = points[points.length - 1];
  return `${d} L${last.x} ${last.y}`;
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
