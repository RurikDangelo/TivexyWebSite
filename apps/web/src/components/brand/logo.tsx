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

/** Logo horizontal: símbolo + wordmark, na cor do texto que a envolve. */
export function Logo({ className, label = 'Tivexy' }: MarkProps) {
  return (
    <span role="img" aria-label={label} className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandSymbol className="h-6" />
      <BrandWordmark className="h-3" />
    </span>
  );
}
