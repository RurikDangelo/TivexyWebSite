import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Anterior e próxima, preservando a busca.
 *
 * O total vem do banco (`count: 'exact'`), então "de 312" é o número de
 * verdade, não uma estimativa — e sem ele não há como dizer se existe próxima.
 */
export function Pagination({
  pagina,
  porPagina,
  total,
  params,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  /** O que mais está no endereço e precisa sobreviver à troca de página. */
  params: Readonly<Record<string, string | null>>;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;

  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== '') q.set(k, v);
    if (p > 1) q.set('pagina', String(p));
    const texto = q.toString();
    return texto === '' ? '?' : `?${texto}`;
  };

  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(total, pagina * porPagina);

  return (
    <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="text-content-muted">
        {inicio.toLocaleString('pt-BR')}–{fim.toLocaleString('pt-BR')} de{' '}
        {total.toLocaleString('pt-BR')}
      </p>
      <div className="flex gap-2">
        <Link
          href={link(pagina - 1)}
          aria-disabled={pagina <= 1}
          tabIndex={pagina <= 1 ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            pagina <= 1 && 'pointer-events-none opacity-50',
          )}
        >
          <ChevronLeft aria-hidden />
          Anterior
        </Link>
        <Link
          href={link(pagina + 1)}
          aria-disabled={pagina >= paginas}
          tabIndex={pagina >= paginas ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            pagina >= paginas && 'pointer-events-none opacity-50',
          )}
        >
          Próxima
          <ChevronRight aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
