import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  pagina: number;
  porPagina: number;
  total: number;
  /** O que mais está no endereço e precisa sobreviver à troca de página. */
  params: Readonly<Record<string, string | null>>;
  className?: string;
}

/**
 * Anterior e próxima, preservando a busca.
 *
 * O total vem do banco (`count: 'exact'`), então "de 312" é o número de
 * verdade, não uma estimativa — e sem ele não há como dizer se existe próxima.
 */
export function Pagination({ pagina, porPagina, total, params, className }: PaginationProps) {
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
    <nav
      aria-label="Páginas"
      className={cn('mt-4 flex flex-wrap items-center justify-between gap-3', className)}
    >
      <div className="min-w-0">
        <p className="text-body text-content-muted">
          <span className="text-num text-content">
            {inicio.toLocaleString('pt-BR')}–{fim.toLocaleString('pt-BR')}
          </span>{' '}
          de <span className="text-num text-content">{total.toLocaleString('pt-BR')}</span>
        </p>
        <p className="text-caption text-content-subtle">
          Página {pagina.toLocaleString('pt-BR')} de {paginas.toLocaleString('pt-BR')}
        </p>
      </div>
      <div className="flex gap-2">
        <Passo href={link(pagina - 1)} fim={pagina <= 1} sentido="anterior" />
        <Passo href={link(pagina + 1)} fim={pagina >= paginas} sentido="proxima" />
      </div>
    </nav>
  );
}

/**
 * Um dos dois passos. Na borda da lista o destino não existe, e aí o controle
 * deixa de ser link: um `<span>` sai da ordem de tabulação e da leitura sozinho,
 * sem o `aria-disabled` num `<a>` que continuava clicável pelo teclado. Quem
 * ouve a página na primeira página simplesmente não encontra "Anterior" — que é
 * a verdade — e a contagem acima já diz onde está.
 */
function Passo({
  href,
  fim,
  sentido,
}: {
  href: string;
  fim: boolean;
  sentido: 'anterior' | 'proxima';
}) {
  const classe = cn(buttonVariants({ variant: 'outline', size: 'sm' }), fim && 'opacity-50');
  const conteudo: ReactNode =
    sentido === 'anterior' ? (
      <>
        <ChevronLeft aria-hidden />
        Anterior
      </>
    ) : (
      <>
        Próxima
        <ChevronRight aria-hidden />
      </>
    );

  if (fim) {
    return (
      <span className={classe} aria-hidden>
        {conteudo}
      </span>
    );
  }
  return (
    <Link href={href} className={classe}>
      {conteudo}
    </Link>
  );
}
