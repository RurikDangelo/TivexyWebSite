/**
 * Imagem de compartilhamento (Open Graph), gerada no build com a logo oficial, as fontes e as cores da marca.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type { APIRoute } from 'astro';
import satori from 'satori';
import simboloRaw from '@/assets/brand/tivexy-simbolo.svg?raw';
import wordmarkRaw from '@/assets/brand/tivexy-wordmark.svg?raw';
import { brand } from '@/config/brand';

type Style = Record<string, string | number>;
interface SatoriNode {
  type: string;
  props: { style?: Style; children?: SatoriChild | SatoriChild[]; [key: string]: unknown };
}
type SatoriChild = SatoriNode | string;

const h = (type: string, style: Style, children?: SatoriChild | SatoriChild[]): SatoriNode => ({
  type,
  props: { style, children },
});

/**
 * Lê um arquivo de fonte pelo resolvedor do Node, não por caminho montado à mão:
 * no monorepo as dependências são içadas para o `node_modules` da raiz.
 */
const font = (pkg: string, file: string) =>
  readFile(fileURLToPath(import.meta.resolve(`@fontsource/${pkg}/files/${file}`)));

/** SVG da marca (sem cor fixa) pintado com `fill`, como imagem com a proporção original. */
function brandImage(raw: string, fill: string, height: number): SatoriNode {
  const [, , viewWidth, viewHeight] = raw
    .match(/viewBox="([^"]+)"/)![1]
    .split(/\s+/)
    .map(Number);
  const width = Math.round((height * viewWidth) / viewHeight);
  const colored = raw.replace('<svg ', `<svg fill="${fill}" `);
  const src = `data:image/svg+xml;base64,${Buffer.from(colored).toString('base64')}`;
  return { type: 'img', props: { src, width, height, style: { width, height } } };
}

function chip(label: string, left: number, top: number): SatoriNode {
  return h(
    'div',
    {
      position: 'absolute',
      left,
      top,
      width: 200,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      borderRadius: 16,
      background: brand.white,
      color: brand.ink,
      fontSize: 20,
    },
    [h('div', { width: 26, height: 26, borderRadius: 8, background: brand.blueSoft }), label],
  );
}

const line = (style: Style): SatoriNode =>
  h('div', { position: 'absolute', background: brand.blueLight, ...style });

export const GET: APIRoute = async ({ site }) => {
  const [manrope, inter] = await Promise.all([
    font('manrope', 'manrope-latin-700-normal.woff'),
    font('inter', 'inter-latin-500-normal.woff'),
  ]);

  const host = (site ?? new URL('https://tivexy.com.br')).hostname.replace(/^www\./, '');

  const tree = h(
    'div',
    {
      width: 1200,
      height: 630,
      display: 'flex',
      position: 'relative',
      background: brand.iceLight,
      fontFamily: 'Inter',
    },
    [
      h(
        'div',
        {
          width: 740,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
        },
        [
          h('div', { display: 'flex', alignItems: 'center', gap: 18 }, [
            brandImage(simboloRaw, brand.blue, 50),
            brandImage(wordmarkRaw, brand.blue, 25),
          ]),
          h('div', { display: 'flex', flexDirection: 'column', gap: 22 }, [
            h(
              'div',
              {
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Manrope',
                fontSize: 60,
                lineHeight: 1.04,
                letterSpacing: -2.4,
                color: brand.ink,
              },
              [
                h('div', {}, 'Tecnologia que transforma'),
                h('div', {}, 'operações'),
                h('div', { color: brand.blue }, 'em crescimento.'),
              ],
            ),
            h(
              'div',
              { fontSize: 26, lineHeight: 1.4, color: brand.muted },
              'Sistemas, SaaS, automação e inteligência artificial para empresas.',
            ),
          ]),
          h('div', { fontSize: 22, color: brand.muted }, host),
        ],
      ),
      h(
        'div',
        {
          position: 'absolute',
          top: 0,
          right: 0,
          width: 460,
          height: 630,
          display: 'flex',
          background: brand.blue,
        },
        [
          line({ left: 229, top: 178, width: 2, height: 274 }),
          line({ left: 120, top: 177, width: 220, height: 2 }),
          line({ left: 120, top: 451, width: 220, height: 2 }),
          chip('Vendas', 20, 150),
          chip('Estoque', 240, 150),
          chip('Financeiro', 20, 424),
          chip('Atendimento', 240, 424),
          h(
            'div',
            {
              position: 'absolute',
              left: 182,
              top: 267,
              width: 96,
              height: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 24,
              background: brand.white,
              boxShadow: `0 0 0 14px ${brand.blueDeep}`,
            },
            [brandImage(simboloRaw, brand.blue, 54)],
          ),
        ],
      ),
    ],
  );

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Manrope', data: manrope, weight: 700, style: 'normal' },
      { name: 'Inter', data: inter, weight: 500, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' },
  });
};
