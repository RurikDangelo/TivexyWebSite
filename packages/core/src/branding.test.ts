import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BRAND_INK_DARK,
  BRAND_INK_LIGHT,
  BRAND_LOGO_MAX_BYTES,
  brandLogoPath,
  brandScale,
  checkBrandColor,
  checkBrandLogo,
  contrastRatio,
  relativeLuminance,
} from './branding.ts';

/** Contraste é conta de ponto flutuante: compara com tolerância, não com igualdade. */
function perto(valor: number, esperado: number, tolerancia = 0.01): void {
  assert.ok(
    Math.abs(valor - esperado) <= tolerancia,
    `esperava ${esperado} (±${tolerancia}), veio ${valor}`,
  );
}

describe('checkBrandColor', () => {
  it('normaliza caixa, espaço e cerquilha ausente', () => {
    assert.deepEqual(checkBrandColor('  #1648A6 '), { ok: true, value: '#1648a6' });
    assert.deepEqual(checkBrandColor('1648a6'), { ok: true, value: '#1648a6' });
  });

  it('recusa o de três dígitos ensinando a forma certa, em vez de expandir', () => {
    const r = checkBrandColor('#12f');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /seis dígitos/);
  });

  it('recusa o que não é hexadecimal de seis dígitos', () => {
    for (const entrada of ['rgb(22,72,166)', '#1648a', '#1648ag', 'azul', '#1648a6ff']) {
      assert.equal(checkBrandColor(entrada).ok, false, entrada);
    }
  });

  it('vazio não é erro de formato — é a volta ao azul da Tivexy, e o texto diz isso', () => {
    const r = checkBrandColor('   ');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /branco/);
  });
});

describe('contraste', () => {
  it('bate com os valores conhecidos da WCAG', () => {
    assert.equal(contrastRatio('#ffffff', '#000000'), 21);
    assert.equal(contrastRatio('#1648a6', '#1648a6'), 1);
    // #767676 sobre branco é o caso de borda citado na própria norma.
    perto(contrastRatio('#767676', '#ffffff'), 4.54);
  });

  it('pesa o canal verde como a norma manda — amarelo é quase branco', () => {
    perto(relativeLuminance('#ffff00'), 0.9278, 0.001);
    perto(relativeLuminance('#1648a6'), 0.0756, 0.001);
  });
});

describe('brandScale', () => {
  it('o azul da Tivexy escurece no hover e cai onde o botão já estava', () => {
    const escala = brandScale('#1648a6');
    // `--tvx-blue-700` é #103b8a: a escala derivada dá o mesmo degrau, não um salto.
    assert.equal(escala.hover, '#133e8f');
    assert.equal(escala.active, '#10357b');
    assert.equal(escala.ink, BRAND_INK_LIGHT);
    perto(escala.contrast, 8.36);
    assert.ok(escala.meetsAA);
  });

  it('amarelo recebe tinta escura — branco sobre amarelo seria 1,07:1', () => {
    const escala = brandScale('#ffff00');
    assert.equal(escala.ink, BRAND_INK_DARK);
    assert.equal(escala.inkIsLight, false);
    assert.ok(escala.meetsAA);
    perto(contrastRatio('#ffff00', BRAND_INK_LIGHT), 1.07);
    // E o alerta que só esta medida dá: como realce sobre o painel claro, some.
    perto(escala.onLightSurface, 1.07);
  });

  it('preto clareia, porque escurecer preto não se vê', () => {
    const escala = brandScale('#000000');
    assert.notEqual(escala.hover, '#000000');
    assert.ok(relativeLuminance(escala.active) > relativeLuminance(escala.hover));
    assert.equal(escala.ink, BRAND_INK_LIGHT);
  });

  it('branco escurece e recebe tinta escura', () => {
    const escala = brandScale('#ffffff');
    assert.equal(escala.hover, '#dbdbdb');
    assert.equal(escala.ink, BRAND_INK_DARK);
    assert.ok(escala.meetsAA);
    // Como cor de realce sobre o painel branco, um logo branco desaparece.
    assert.equal(escala.onLightSurface, 1);
  });

  it('cinza médio reprova AA e a escala não finge que passou', () => {
    const escala = brandScale('#808080');
    perto(escala.contrast, 3.95);
    assert.equal(escala.meetsAA, false);
    assert.equal(escala.meetsAALarge, true);
  });

  it('o contraste é o do pior estado, não o da base', () => {
    const escala = brandScale('#808080');
    const naBase = contrastRatio(escala.base, escala.ink);
    const noApertado = contrastRatio(escala.active, escala.ink);
    assert.ok(escala.contrast <= naBase);
    perto(escala.contrast, Math.min(naBase, noApertado));
  });

  it('aceita a cor em maiúsculas sem mudar de resposta', () => {
    assert.deepEqual(brandScale('#FFFF00'), brandScale('#ffff00'));
  });
});

describe('checkBrandLogo', () => {
  it('aceita os três tipos do balde com a extensão certa', () => {
    assert.deepEqual(checkBrandLogo({ type: 'image/png', size: 1000 }), {
      ok: true,
      extension: 'png',
    });
    assert.deepEqual(checkBrandLogo({ type: 'IMAGE/JPEG', size: 1000 }), {
      ok: true,
      extension: 'jpg',
    });
    assert.deepEqual(checkBrandLogo({ type: 'image/webp', size: 1000 }), {
      ok: true,
      extension: 'webp',
    });
  });

  it('recusa SVG dizendo o motivo, e não só "formato não aceito"', () => {
    const r = checkBrandLogo({ type: 'image/svg+xml', size: 1000 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /script/);
  });

  it('recusa acima de 512 KB dizendo o tamanho que veio', () => {
    const r = checkBrandLogo({ type: 'image/png', size: BRAND_LOGO_MAX_BYTES + 1 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /513 KB.*512 KB/);
    assert.equal(checkBrandLogo({ type: 'image/png', size: BRAND_LOGO_MAX_BYTES }).ok, true);
  });

  it('recusa arquivo vazio', () => {
    assert.equal(checkBrandLogo({ type: 'image/png', size: 0 }).ok, false);
  });
});

describe('brandLogoPath', () => {
  const id = '3f1a2b4c-5d6e-4f70-8a90-b1c2d3e4f506';

  it('começa pelo id da empresa, que é o que a restrição do banco exige', () => {
    assert.equal(brandLogoPath(id, 'png', 'm9x2'), `${id}/logo-m9x2.png`);
  });

  it('dois envios dão caminhos diferentes — o CDN serve o novo na hora', () => {
    assert.notEqual(brandLogoPath(id, 'png', 'aaa'), brandLogoPath(id, 'png', 'bbb'));
  });

  it('limpa o carimbo: o nome vai para uma URL pública', () => {
    assert.equal(brandLogoPath(id, 'webp', 'M9 X2/../etc'), `${id}/logo-m9x2etc.webp`);
  });

  it('recusa id vazio, id com barra e extensão fora do balde', () => {
    assert.throws(() => brandLogoPath('', 'png', 'aaa'));
    assert.throws(() => brandLogoPath('a/b', 'png', 'aaa'));
    assert.throws(() => brandLogoPath(id, 'svg', 'aaa'));
    assert.throws(() => brandLogoPath(id, 'png', '///'));
  });
});
