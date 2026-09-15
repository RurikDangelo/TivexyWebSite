/**
 * Logo oficial da Tivexy (vetores extraídos do arquivo da marca, sem redesenho).
 * Os SVGs ficam em src/assets/brand/ sem cor fixa: a cor vem do CSS (currentColor).
 *
 * No HTML, símbolo e wordmark são definidos uma única vez por página (BrandSprite.astro)
 * e reutilizados com <use>, para não repetir os bytes do vetor a cada aparição.
 */
import simboloRaw from '@/assets/brand/tivexy-simbolo.svg?raw';
import wordmarkRaw from '@/assets/brand/tivexy-wordmark.svg?raw';

export interface BrandShape {
  id: string;
  viewBox: string;
  width: number;
  height: number;
  /** Conteúdo interno do <svg> (paths). */
  inner: string;
}

function parse(id: string, raw: string): BrandShape {
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error(`SVG da marca sem viewBox: ${id}`);
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { id, viewBox, width, height, inner };
}

export const brandSymbol = parse('tivexy-simbolo', simboloRaw);
export const brandWordmark = parse('tivexy-wordmark', wordmarkRaw);
