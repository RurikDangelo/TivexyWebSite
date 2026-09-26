/**
 * Prova social e cases. Tudo começa vazio de propósito: nada aqui pode ser inventado.
 *
 * - `cases` vazio      → a seção de projetos mostra só os sistemas base (src/data/systems.ts).
 *                        Com itens, os cases reais aparecem antes deles.
 * - `testimonials`, `clientLogos` e `stats` vazios → a seção de prova social não é renderizada.
 *
 * Para publicar conteúdo real, adicione itens nos arrays abaixo.
 * Imagens: coloque o arquivo em src/assets/ e importe aqui (ex.: import foto from '@/assets/cases/x.jpg').
 */
import type { ImageMetadata } from 'astro';

export interface CaseStudy {
  name: string;
  segment: string;
  problem: string;
  solution: string;
  result: string;
  image?: { src: ImageMetadata; alt: string };
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  photo?: ImageMetadata;
}

export interface ClientLogo {
  name: string;
  logo: ImageMetadata;
}

export interface Stat {
  value: string;
  label: string;
}

export const cases: CaseStudy[] = [];
export const testimonials: Testimonial[] = [];
export const clientLogos: ClientLogo[] = [];
export const stats: Stat[] = [];
