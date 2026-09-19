/**
 * Gera favicon, ícones do app, logo para buscadores e o manifest a partir da logo oficial
 * (src/assets/brand). Uso: npm run icons
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const publicDir = fileURLToPath(new URL('public/', root));
const brandDir = new URL('src/assets/brand/', root);

// Espelha src/config/brand.ts
const BLUE = '#1648a6';
const BLUE_LIGHT = '#8eb0ec';
const WHITE = '#ffffff';

async function loadShape(file) {
  const raw = await readFile(new URL(file, brandDir), 'utf8');
  const viewBox = raw.match(/viewBox="([^"]+)"/)[1];
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { viewBox, width, height, inner };
}

const symbol = await loadShape('tivexy-simbolo.svg');
const lockup = await loadShape('tivexy-logo-vertical.svg');

/** Símbolo centralizado num quadro `box` × `box`, ocupando `scale` da largura. */
function placeSymbol(box, scale, fill) {
  const width = box * scale;
  const height = (width * symbol.height) / symbol.width;
  return `<svg x="${(box - width) / 2}" y="${(box - height) / 2}" width="${width}" height="${height}" viewBox="${symbol.viewBox}" fill="${fill}">${symbol.inner}</svg>`;
}

const svg = (box, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}">${body}</svg>`;

// Símbolo solto: azul da marca, azul claro quando a interface do navegador está escura.
const faviconSvg = svg(
  64,
  `<style>.s{fill:${BLUE}}@media (prefers-color-scheme:dark){.s{fill:${BLUE_LIGHT}}}</style>${placeSymbol(64, 0.94, BLUE).replace(`fill="${BLUE}"`, 'class="s"')}`,
);
const tileSvg = (scale) =>
  svg(64, `<rect width="64" height="64" rx="15" fill="${BLUE}"/>${placeSymbol(64, scale, WHITE)}`);
const fullBleedSvg = (scale) =>
  svg(64, `<rect width="64" height="64" fill="${BLUE}"/>${placeSymbol(64, scale, WHITE)}`);

async function png(source, width, height = width, viewWidth = 64) {
  const density = Math.min(2400, Math.ceil((72 * width * 2) / viewWidth));
  return sharp(Buffer.from(source), { density })
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, buffer }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)]);
}

// Logo vertical completa (símbolo, wordmark e tagline) em azul sobre branco, para buscadores.
const LOGO_WIDTH = 1200;
const LOGO_PADDING = 60;
const logoHeight = Math.round((LOGO_WIDTH * lockup.height) / lockup.width);
const logoCanvas = { width: LOGO_WIDTH + LOGO_PADDING * 2, height: logoHeight + LOGO_PADDING * 2 };
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoCanvas.width} ${logoCanvas.height}"><rect width="100%" height="100%" fill="${WHITE}"/><svg x="${LOGO_PADDING}" y="${LOGO_PADDING}" width="${LOGO_WIDTH}" height="${logoHeight}" viewBox="${lockup.viewBox}" fill="${BLUE}">${lockup.inner}</svg></svg>`;

const icoImages = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, buffer: await png(tileSvg(0.74), size) })),
);

const manifest = {
  name: 'Tivexy',
  short_name: 'Tivexy',
  description: 'Sistemas, SaaS, automação e inteligência artificial para empresas.',
  lang: 'pt-BR',
  start_url: '/',
  display: 'browser',
  background_color: WHITE,
  theme_color: WHITE,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

await Promise.all([
  writeFile(`${publicDir}favicon.svg`, faviconSvg),
  writeFile(`${publicDir}favicon.ico`, ico(icoImages)),
  png(fullBleedSvg(0.6), 180).then((buffer) =>
    writeFile(`${publicDir}apple-touch-icon.png`, buffer),
  ),
  png(tileSvg(0.72), 192).then((buffer) => writeFile(`${publicDir}icon-192.png`, buffer)),
  png(tileSvg(0.72), 512).then((buffer) => writeFile(`${publicDir}icon-512.png`, buffer)),
  png(fullBleedSvg(0.5), 512).then((buffer) =>
    writeFile(`${publicDir}icon-maskable-512.png`, buffer),
  ),
  png(logoSvg, logoCanvas.width, logoCanvas.height, logoCanvas.width).then((buffer) =>
    writeFile(`${publicDir}logo.png`, buffer),
  ),
  writeFile(`${publicDir}site.webmanifest`, `${JSON.stringify(manifest, null, 2)}\n`),
]);

console.log('Favicon, ícones, logo.png e manifest gerados em public/ a partir da logo oficial.');
