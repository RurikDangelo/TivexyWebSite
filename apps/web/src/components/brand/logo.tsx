import { cn } from '@/lib/utils';

/*
 * Os SVGs oficiais são pesados (o símbolo tem 12 KB de path) e precisam trocar
 * de cor com o tema. Usar `mask-image` resolve os dois: o arquivo fica fora do
 * HTML, é cacheado pelo navegador, e a cor vem de `currentColor`.
 */

type MarkProps = {
  className?: string;
  /** Rótulo acessível. Omita quando a logo for decorativa ao lado de um texto. */
  label?: string;
};

const maskStyle = (src: string) => ({
  WebkitMaskImage: `url(${src})`,
  maskImage: `url(${src})`,
  WebkitMaskRepeat: 'no-repeat' as const,
  maskRepeat: 'no-repeat' as const,
  WebkitMaskPosition: 'center' as const,
  maskPosition: 'center' as const,
  WebkitMaskSize: 'contain' as const,
  maskSize: 'contain' as const,
});

/** Símbolo das setas com S. viewBox 171,41 × 146,16. */
export function BrandSymbol({ className, label }: MarkProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block bg-current', className)}
      style={{ ...maskStyle('/brand/simbolo.svg'), aspectRatio: '171.41 / 146.16' }}
    />
  );
}

/** Wordmark "TIVEXY". viewBox 510,24 × 52,46. */
export function BrandWordmark({ className, label }: MarkProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block bg-current', className)}
      style={{ ...maskStyle('/brand/wordmark.svg'), aspectRatio: '510.24 / 52.46' }}
    />
  );
}

/**
 * Duas formas, porque a casca tem duas larguras.
 *
 * `completa` é símbolo + wordmark, para a coluna de 256px e para as telas de
 * entrada. `simbolo` é a marca reduzida ao sinal, que é o que cabe nos 64px da
 * sidebar colapsada — recortar o lockup inteiro ali daria um borrão de 9px de
 * altura.
 */
export type FormaDaMarca = 'completa' | 'simbolo';

export type TamanhoDaMarca = 'sm' | 'md' | 'lg';

/**
 * A marca do cliente, quando ele tem uma.
 *
 * `url` é o endereço já resolvido do arquivo que o Super Admin enviou —
 * `tenants.brand_logo_path` é um caminho dentro do bucket `tenant-branding`
 * (migração 20260926010000), e converter caminho em endereço é trabalho de
 * quem lê o banco, não deste componente, que roda igual no servidor e no
 * cliente.
 *
 * Enquanto nenhuma tela passar esta prop, todo cliente continua vendo a marca
 * Tivexy — e é isso que a UI deve mostrar, porque é o que existe.
 */
export interface MarcaDoCliente {
  readonly url: string;
  /** Nome da empresa. Vira o texto alternativo da imagem. */
  readonly nome: string;
}

export interface LogoProps {
  readonly forma?: FormaDaMarca;
  readonly tamanho?: TamanhoDaMarca;
  /** A marca do cliente. Ausente ou `null`, desenha a da Tivexy. */
  readonly marca?: MarcaDoCliente | null;
  /**
   * Nome acessível. O padrão é o nome da empresa, ou "Tivexy" sem marca de
   * cliente. String vazia torna a imagem decorativa — é o que se usa quando o
   * nome já está escrito ao lado, como no seletor de empresa.
   */
  readonly label?: string;
  readonly className?: string;
}

/** Altura do símbolo e do wordmark por tamanho. A proporção 2:1 é a do lockup. */
const MARCA_TIVEXY: Record<TamanhoDaMarca, { simbolo: string; wordmark: string; gap: string }> = {
  sm: { simbolo: 'h-5', wordmark: 'h-2.5', gap: 'gap-2' },
  md: { simbolo: 'h-6', wordmark: 'h-3', gap: 'gap-2.5' },
  lg: { simbolo: 'h-8', wordmark: 'h-4', gap: 'gap-3' },
};

/*
 * O logo do cliente é bitmap de proporção desconhecida, então o que se fixa é
 * a caixa: altura no lockup horizontal, quadrado no modo símbolo. `contain`
 * garante que um logo largo encolha em vez de ser cortado — cortar a marca de
 * outra empresa é pior do que mostrá-la pequena.
 */
const MARCA_CLIENTE: Record<TamanhoDaMarca, { completa: string; simbolo: string }> = {
  sm: { completa: 'h-5 max-w-32', simbolo: 'size-5' },
  md: { completa: 'h-7 max-w-40', simbolo: 'size-8' },
  lg: { completa: 'h-9 max-w-48', simbolo: 'size-10' },
};

export function Logo({
  forma = 'completa',
  tamanho = 'md',
  marca = null,
  label,
  className,
}: LogoProps) {
  const nome = label ?? marca?.nome ?? 'Tivexy';
  const decorativa = nome === '';

  if (marca !== null) {
    const caixa = MARCA_CLIENTE[tamanho];
    return (
      <span className={cn('inline-flex items-center', className)}>
        {/*
         * `<img>` e não `next/image`: o arquivo é remoto, de dimensões
         * desconhecidas, e o `next/image` exigiria `images.remotePatterns` com
         * o host do projeto Supabase — configuração que não pertence a este
         * arquivo. O logo é um PNG/WebP de poucos KB servido de bucket público.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={marca.url}
          alt={nome}
          className={cn(
            'object-contain object-left',
            forma === 'completa' ? caixa.completa : caixa.simbolo,
          )}
        />
      </span>
    );
  }

  if (forma === 'simbolo') {
    return (
      <BrandSymbol
        className={cn(MARCA_TIVEXY[tamanho].simbolo, className)}
        label={decorativa ? undefined : nome}
      />
    );
  }

  const medidas = MARCA_TIVEXY[tamanho];
  return (
    <span
      role={decorativa ? undefined : 'img'}
      aria-label={decorativa ? undefined : nome}
      className={cn('inline-flex items-center', medidas.gap, className)}
    >
      {/* Sem rótulo próprio: quem nomeia o conjunto é o `role="img"` de fora. */}
      <BrandSymbol className={medidas.simbolo} />
      <BrandWordmark className={medidas.wordmark} />
    </span>
  );
}
