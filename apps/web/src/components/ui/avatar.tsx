import { cn } from '@/lib/utils';

/** Primeira e última inicial: "Maria de Souza" → "MS". Nome de uma palavra, uma letra. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.charAt(0) ?? '') : '';
  return (primeira + ultima).toLocaleUpperCase('pt-BR');
}

export type AvatarTamanho = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarTom = 'accent' | 'brand' | 'neutral';

/*
 * A letra escala com o disco, não com a escala tipográfica do texto: ela é um
 * desenho dentro de um círculo, não um parágrafo. Daí a mistura de tokens —
 * o critério é o tamanho do disco, e todos terminam em peso 600.
 *
 * `sm` é 32px de propósito: é a medida do bloco de empresa no topo da sidebar.
 */
const TAMANHO: Record<AvatarTamanho, string> = {
  xs: 'size-6 text-micro',
  sm: 'size-8 text-caption font-semibold',
  md: 'size-9 text-label font-semibold',
  lg: 'size-12 text-h3',
};

const TOM: Record<AvatarTom, string> = {
  accent: 'bg-surface-accent-soft text-content-accent',
  brand: 'bg-surface-brand text-content-on-brand',
  neutral: 'bg-surface-muted text-content-muted',
};

export interface AvatarProps {
  /** Obrigatório mesmo com `src`: é dele que sai o recuo quando a imagem falha. */
  nome: string;
  /** Texto para leitor de tela, quando o nome não está escrito ao lado. */
  rotulo?: string;
  tamanho?: AvatarTamanho;
  tom?: AvatarTom;
  /** Logo do cliente ou foto. `null` e string vazia valem por ausência. */
  src?: string | null;
  className?: string;
}

/**
 * As iniciais num círculo, com a imagem por cima quando existe.
 *
 * Decorativo: o nome sempre aparece em texto ao lado, ou em `rotulo` para
 * leitor de tela — iniciais sozinhas não identificam ninguém.
 *
 * Para logo quadrado (o seletor de empresa), passe `className="rounded-card"`:
 * o `cn` resolve o conflito de raio.
 */
export function Avatar({
  nome,
  rotulo,
  tamanho = 'md',
  tom = 'accent',
  src,
  className,
}: AvatarProps) {
  const imagem = src !== undefined && src !== null && src !== '' ? src : null;

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-pill',
        TAMANHO[tamanho],
        TOM[tom],
        className,
      )}
    >
      <span aria-hidden>{iniciais(nome)}</span>
      {imagem !== null && (
        /*
         * O recuo para a inicial é o próprio navegador: com `alt=""`, uma imagem
         * que não carrega não pinta nada e as iniciais embaixo continuam à
         * vista. Sem JavaScript, o que mantém isto num Server Component.
         *
         * Por isso a imagem não leva fundo próprio: um fundo opaco também
         * pintaria no caso de falha e apagaria o recuo. O preço é que um logo
         * com fundo transparente deixa a inicial aparecer atrás.
         */
        // eslint-disable-next-line @next/next/no-img-element -- URL de logo do cliente é arbitrária; `next/image` exigiria um remotePattern por domínio.
        <img
          src={imagem}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {rotulo !== undefined && <span className="sr-only">{rotulo}</span>}
    </span>
  );
}
