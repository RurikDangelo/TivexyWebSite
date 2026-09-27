import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * Nomes dos tokens por papel definidos em `app/globals.css` (seções 4 e 5 do
 * DESIGN_SYSTEM). O tailwind-merge não os conhece: sem registrá-los, ele
 * classifica `text-h1` como cor e `shadow-card` como cor de sombra, e
 * `cn('text-metric', 'text-h1')` devolve as duas classes. O override por
 * `className` passaria a falhar em silêncio em todo primitivo — risco R3.
 */
const TAMANHOS_DE_TEXTO = [
  'display',
  'h1',
  'h2',
  'h3',
  'metric',
  'metric-sm',
  'body',
  'body-lg',
  'label',
  'caption',
  'eyebrow',
  'micro',
  'num',
] as const;

const RAIOS = ['control', 'card', 'panel', 'pill'] as const;

const ELEVACOES = ['flat', 'card', 'raised', 'overlay', 'modal'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TAMANHOS_DE_TEXTO] }],
      shadow: [{ shadow: [...ELEVACOES] }],
      /*
       * Os quinze grupos de raio precisam ser declarados um a um porque cada
       * lado e cada canto é um grupo próprio no tailwind-merge — só assim
       * `rounded-t-panel` continua anulando `rounded-t-card`.
       */
      rounded: [{ rounded: [...RAIOS] }],
      'rounded-s': [{ 'rounded-s': [...RAIOS] }],
      'rounded-e': [{ 'rounded-e': [...RAIOS] }],
      'rounded-t': [{ 'rounded-t': [...RAIOS] }],
      'rounded-r': [{ 'rounded-r': [...RAIOS] }],
      'rounded-b': [{ 'rounded-b': [...RAIOS] }],
      'rounded-l': [{ 'rounded-l': [...RAIOS] }],
      'rounded-ss': [{ 'rounded-ss': [...RAIOS] }],
      'rounded-se': [{ 'rounded-se': [...RAIOS] }],
      'rounded-ee': [{ 'rounded-ee': [...RAIOS] }],
      'rounded-es': [{ 'rounded-es': [...RAIOS] }],
      'rounded-tl': [{ 'rounded-tl': [...RAIOS] }],
      'rounded-tr': [{ 'rounded-tr': [...RAIOS] }],
      'rounded-br': [{ 'rounded-br': [...RAIOS] }],
      'rounded-bl': [{ 'rounded-bl': [...RAIOS] }],
    },
  },
});

/** Junta classes condicionais resolvendo conflitos do Tailwind (a última vence). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Depois do nono item o escalonamento vira espera; o olho já entendeu a lista. */
const TETO_DO_ESCALONAMENTO = 8;

/**
 * Atraso de entrada do item `indice` de uma lista, pronto para `animationDelay`.
 *
 * Existe para que haja uma cadência só: antes conviviam `*20`, `*25` e `*30` em
 * telas vizinhas, e três listas sem atraso nenhum.
 */
export function atrasoDaLinha(indice: number): string {
  return `${Math.min(Math.max(indice, 0), TETO_DO_ESCALONAMENTO) * 20}ms`;
}
