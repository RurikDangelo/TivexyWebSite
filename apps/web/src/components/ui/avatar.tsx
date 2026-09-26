import { cn } from '@/lib/utils';

/** Primeira e última inicial: "Maria de Souza" → "MS". Nome de uma palavra, uma letra. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.charAt(0) ?? '') : '';
  return (primeira + ultima).toLocaleUpperCase('pt-BR');
}

/**
 * As iniciais num círculo. Decorativo: o nome sempre aparece em texto ao lado,
 * ou em `rotulo` para leitor de tela — iniciais sozinhas não identificam ninguém.
 */
export function Avatar({
  nome,
  rotulo,
  tamanho = 'md',
  className,
}: {
  nome: string;
  /** Texto para leitor de tela, quando o nome não está escrito ao lado. */
  rotulo?: string;
  tamanho?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      title={rotulo}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-surface-accent-soft font-semibold text-content-accent',
        tamanho === 'sm' ? 'size-6 text-[0.625rem]' : 'size-9 text-xs',
        className,
      )}
    >
      <span aria-hidden>{iniciais(nome)}</span>
      {rotulo !== undefined && <span className="sr-only">{rotulo}</span>}
    </span>
  );
}
