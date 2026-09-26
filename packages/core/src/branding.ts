/**
 * A marca do cliente: a cor, a escala que sai dela e onde o logo mora.
 *
 * Existe aqui, e não na tela, porque são três regras que o banco também tem e
 * que precisam dar a **mesma** resposta: o formato da cor (a restrição
 * `tenants_brand_primary_format` de 20260926010000), o caminho do logo dentro
 * do balde (`tenants_brand_logo_path_scoped`, que exige começar pelo id da
 * empresa) e os limites do balde `tenant-branding` (512 KB, PNG/JPEG/WebP).
 * A tela valida para errar **na hora**, com o campo ainda em foco; o banco
 * valida porque é ele quem garante. Duas camadas, uma regra só — e é por isso
 * que ela é escrita uma vez.
 *
 * A parte que só existe aqui é o contraste. Um cliente pode escolher amarelo,
 * e texto branco sobre amarelo dá 1,07:1 — ilegível. Nenhum banco impede isso,
 * e chutar "fundo escuro → texto branco" erra justamente nos casos difíceis.
 * Então é medido, pela fórmula da WCAG 2, e o número aparece para quem escolhe.
 */

/* ── A cor ────────────────────────────────────────────────────────────── */

/** A forma canônica, a mesma do banco: seis dígitos, minúsculos, com cerquilha. */
const HEX = /^#[0-9a-f]{6}$/;

export type BrandColorCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Confere e normaliza a cor digitada.
 *
 * Normaliza **antes** de validar porque quem digita `#1648A6` quis a mesma cor
 * que `#1648a6` — é a mesma ordem de `admin_set_tenant_brand`. A cerquilha é
 * opcional na entrada: colar `1648a6` de uma paleta é comum, e acrescentar o
 * `#` não é conversão de formato, é aparar. O de três dígitos **é** outro
 * formato, e a resposta a ele é ensinar, não expandir em silêncio: manter uma
 * forma só é o que evita três caminhos de conversão espalhados pelo app.
 */
export function checkBrandColor(entrada: string): BrandColorCheck {
  const limpo = entrada.trim().toLowerCase();
  if (limpo === '')
    return { ok: false, error: 'Informe a cor, ou deixe em branco para o azul da Tivexy.' };

  const comCerquilha = limpo.startsWith('#') ? limpo : `#${limpo}`;
  if (/^#[0-9a-f]{3}$/.test(comCerquilha)) {
    return { ok: false, error: 'Escreva os seis dígitos: #1122ff, não #12f.' };
  }
  if (!HEX.test(comCerquilha)) {
    return { ok: false, error: 'Use hexadecimal de seis dígitos, como #1648a6.' };
  }
  return { ok: true, value: comCerquilha };
}

/** `#rrggbb` → os três canais em 0–255. Só aceita a forma canônica. */
function canais(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new TypeError(`cor fora da forma canônica: ${hex}`);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function paraHex(canal: number): string {
  return Math.round(Math.min(255, Math.max(0, canal)))
    .toString(16)
    .padStart(2, '0');
}

/* ── Contraste ────────────────────────────────────────────────────────── */

/**
 * Luminância relativa, WCAG 2.
 *
 * O canal é linearizado antes de ser pesado — é essa curva que faz amarelo
 * (0,93) pesar quase como branco e azul-marinho pesar quase nada. Média dos
 * canais crus, que é o atalho comum, daria ao amarelo o mesmo peso do cinza
 * médio e aprovaria texto branco sobre ele.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = canais(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A razão de contraste entre duas cores, de 1 (iguais) a 21 (preto e branco). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/** O piso da WCAG AA para texto normal. */
export const CONTRAST_AA = 4.5;
/** O piso da AA para texto grande (≥ 18,66px negrito ou ≥ 24px). */
export const CONTRAST_AA_LARGE = 3;

/* ── A escala ─────────────────────────────────────────────────────────── */

/** A tinta clara — o mesmo `--content-on-brand` do tema claro. */
export const BRAND_INK_LIGHT = '#ffffff';
/** A tinta escura — o mesmo `--tvx-ink-900` que o sistema usa sobre estado claro. */
export const BRAND_INK_DARK = '#0b1424';

/** `--surface-panel` no claro e no escuro: onde a cor vira barra e ícone de menu. */
const SUPERFICIE_CLARA = '#ffffff';
const SUPERFICIE_ESCURA = '#0a1633';

export interface BrandScale {
  /** A cor escolhida, normalizada. */
  base: string;
  /** O botão sob o ponteiro. */
  hover: string;
  /** O botão apertado. */
  active: string;
  /** A cor do texto por cima dos três — medida, não escolhida por aparência. */
  ink: string;
  /** `true` quando a tinta é a clara. Útil para a tela dizer qual venceu. */
  inkIsLight: boolean;
  /** O **pior** contraste da tinta entre os três estados. */
  contrast: number;
  meetsAA: boolean;
  meetsAALarge: boolean;
  /** Contraste da cor contra o painel claro — a barra do menu ativo sai daqui. */
  onLightSurface: number;
  /** O mesmo contra o painel escuro. */
  onDarkSurface: number;
}

/**
 * Quanto o hover e o pressionado se afastam da base.
 *
 * Valores medidos contra o que o sistema já faz: 14% de preto sobre
 * `#1648a6` dá `#133e8f`, praticamente o `--tvx-blue-700` que o botão primário
 * usa hoje no hover. A escala derivada de um cliente cai, então, no mesmo
 * degrau que a da Tivexy — e não em um salto maior, que leria como outra cor.
 */
const PASSO_HOVER = 0.14;
const PASSO_ACTIVE = 0.26;

/**
 * Abaixo desta luminância, escurecer não se vê.
 *
 * Preto misturado com preto continua preto: um cliente que escolhe `#000000`
 * teria hover idêntico à base e o botão pareceria travado. Então o movimento
 * inverte — clareia. O corte fica logo abaixo do azul da Tivexy (0,0755) de
 * propósito: a marca da casa continua escurecendo no hover, como sempre fez.
 */
const MUITO_ESCURO = 0.06;

function misturar(hex: string, alvo: string, quanto: number): string {
  const [r1, g1, b1] = canais(hex);
  const [r2, g2, b2] = canais(alvo);
  return `#${paraHex(r1 + (r2 - r1) * quanto)}${paraHex(g1 + (g2 - g1) * quanto)}${paraHex(b1 + (b2 - b1) * quanto)}`;
}

/**
 * A escala utilizável de uma cor de cliente, com a tinta decidida por medição.
 *
 * **Uma tinta só para os três estados.** Escolher por estado daria um botão
 * cujo texto troca de cor quando o ponteiro chega — e o contraste que importa
 * é o do pior estado, não o da média. Por isso a tinta vencedora é a que tem o
 * maior **mínimo** entre base, hover e pressionado, e é esse mínimo que vai
 * para a tela.
 */
export function brandScale(hex: string): BrandScale {
  const base = hex.toLowerCase();
  const escura = relativeLuminance(base) < MUITO_ESCURO;
  const alvo = escura ? BRAND_INK_LIGHT : '#000000';
  const hover = misturar(base, alvo, PASSO_HOVER);
  const active = misturar(base, alvo, PASSO_ACTIVE);
  const estados = [base, hover, active];

  const pior = (tinta: string) =>
    Math.min(...estados.map((estado) => contrastRatio(estado, tinta)));
  const comClara = pior(BRAND_INK_LIGHT);
  const comEscura = pior(BRAND_INK_DARK);
  const inkIsLight = comClara >= comEscura;
  const contrast = inkIsLight ? comClara : comEscura;

  return {
    base,
    hover,
    active,
    ink: inkIsLight ? BRAND_INK_LIGHT : BRAND_INK_DARK,
    inkIsLight,
    contrast,
    meetsAA: contrast >= CONTRAST_AA,
    meetsAALarge: contrast >= CONTRAST_AA_LARGE,
    onLightSurface: contrastRatio(base, SUPERFICIE_CLARA),
    onDarkSurface: contrastRatio(base, SUPERFICIE_ESCURA),
  };
}

/* ── O logo ───────────────────────────────────────────────────────────── */

export const BRAND_LOGO_BUCKET = 'tenant-branding';

/** 512 KB — o mesmo `file_size_limit` do balde. É um logo, não um banner. */
export const BRAND_LOGO_MAX_BYTES = 524_288;

/**
 * Os tipos que o balde aceita, e a extensão de cada um.
 *
 * **SVG está fora de propósito**, não por esquecimento: o balde é de leitura
 * pública e SVG é documento executável — servido do domínio do projeto
 * Supabase, um script embutido roda naquela origem. Quem escolhe o logo é o
 * Super Admin, então o risco é pequeno; pequeno não é motivo para abrir.
 */
export const BRAND_LOGO_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** O `accept` do campo de arquivo — o diálogo do sistema já filtra. */
export const BRAND_LOGO_ACCEPT = Object.keys(BRAND_LOGO_TYPES).join(',');

export type BrandLogoCheck = { ok: true; extension: string } | { ok: false; error: string };

/**
 * Este arquivo serve de logo?
 *
 * A mesma conferência roda na tela e no servidor. Na tela ela existe para a
 * pessoa **não** esperar um envio de 512 KB para ouvir não; no servidor porque
 * a tela pode ser contornada — e, abaixo dos dois, o balde recusa por conta
 * própria.
 */
export function checkBrandLogo(arquivo: { type: string; size: number }): BrandLogoCheck {
  const tipo = arquivo.type.toLowerCase();

  if (tipo === 'image/svg+xml') {
    return {
      ok: false,
      error:
        'SVG não é aceito: o balde é público e um SVG pode executar script. Envie PNG ou WebP a 2x.',
    };
  }

  const extensao = BRAND_LOGO_TYPES[tipo];
  if (extensao === undefined)
    return { ok: false, error: 'Formato não aceito. Envie PNG, JPEG ou WebP.' };

  if (arquivo.size <= 0) return { ok: false, error: 'O arquivo está vazio.' };
  if (arquivo.size > BRAND_LOGO_MAX_BYTES) {
    const kb = Math.ceil(arquivo.size / 1024);
    return { ok: false, error: `O arquivo tem ${kb} KB e o limite é 512 KB.` };
  }

  return { ok: true, extension: extensao };
}

/**
 * O caminho canônico do logo dentro do balde.
 *
 * Começa pelo id da empresa porque é o que o banco exige
 * (`tenants_brand_logo_path_scoped`) e o que amarra o arquivo ao dono.
 *
 * O nome carrega um carimbo em vez de ser fixo (`logo.png`) porque o balde é
 * público e servido por CDN: sobrescrever o mesmo caminho deixaria o logo
 * antigo no cache de quem já viu, por tempo que não controlamos. Caminho novo
 * a cada envio aparece na hora — e quem grava é que apaga o anterior.
 */
export function brandLogoPath(tenantId: string, extension: string, stamp: string): string {
  const id = tenantId.trim().toLowerCase();
  if (id === '' || id.includes('/')) throw new TypeError(`id de empresa inválido: ${tenantId}`);

  const ext = extension.trim().toLowerCase();
  if (!Object.values(BRAND_LOGO_TYPES).includes(ext)) {
    throw new TypeError(`extensão fora do catálogo do balde: ${extension}`);
  }

  // O carimbo entra no nome de um objeto público: só o que é seguro em URL.
  const carimbo = stamp
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (carimbo === '') throw new TypeError('carimbo vazio');

  return `${id}/logo-${carimbo}.${ext}`;
}
