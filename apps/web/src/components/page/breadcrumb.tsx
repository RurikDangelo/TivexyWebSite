import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { type NavHref, sectionTitle } from '@/config/navigation';
import type { Terms } from '@/lib/terms/vocabulary';
import { cn } from '@/lib/utils';

export interface DegrauDaTrilha {
  rotulo: string;
  /**
   * Ausente vira texto. O último degrau nunca vira link, tenha `href` ou não:
   * a página atual não é destino de si mesma, e um link para onde já se está é
   * ruído para quem navega por teclado.
   */
  href?: string;
}

export interface BreadcrumbProps {
  trilha: readonly DegrauDaTrilha[];
  className?: string;
}

/**
 * Onde a pessoa está, no header: seção do módulo → registro aberto.
 *
 * **Some abaixo de `md`.** Ali o espaço é do `<h1>` do `PageHeader`, que diz a
 * mesma coisa com mais força — e `display:none` tira a trilha também da árvore
 * de acessibilidade, então ninguém ouve o caminho duas vezes.
 *
 * O `<h1>` continua no `PageHeader`: esta trilha é navegação, não título.
 */
export function Breadcrumb({ trilha, className }: BreadcrumbProps) {
  if (trilha.length === 0) return null;

  return (
    <nav aria-label="Trilha de navegação" className={cn('hidden min-w-0 md:block', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-caption text-content-muted">
        {trilha.map((degrau, indice) => {
          const atual = indice === trilha.length - 1;
          return (
            <li
              key={`${indice}-${degrau.rotulo}`}
              /* Só o degrau atual encolhe: o nome do registro cede antes do nome da seção. */
              className={cn('flex items-center gap-1', atual ? 'min-w-0' : 'shrink-0')}
            >
              {indice > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-content-subtle" aria-hidden />
              )}
              {atual || degrau.href === undefined ? (
                <span className="truncate text-content" aria-current={atual ? 'page' : undefined}>
                  {degrau.rotulo}
                </span>
              ) : (
                /* `min-h-6` dá os 24px de alvo sem padding, que desalinharia o primeiro degrau. */
                <Link
                  href={degrau.href}
                  className="inline-flex min-h-6 items-center underline-offset-4 transition-base hover:text-content hover:underline"
                >
                  {degrau.rotulo}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A trilha de uma seção do menu, no vocabulário do tenant.
 *
 * Existe para que ninguém escreva "Leads" na trilha enquanto a clínica chama
 * aquilo de "Interessados" — é o defeito que o menu já teve, e a cura foi
 * `sectionTitle()` ser a única fonte do rótulo. `NavHref` impede caminho que
 * não está no menu já na compilação.
 *
 * `registro` é o nome do que está aberto. Ausente, a seção é o degrau atual,
 * porque então é nela que se está.
 */
export function trilhaDaSecao(
  terms: Terms,
  secao: NavHref,
  registro?: string,
): readonly DegrauDaTrilha[] {
  const secaoDegrau: DegrauDaTrilha = { rotulo: sectionTitle(terms, secao), href: secao };
  return registro === undefined ? [secaoDegrau] : [secaoDegrau, { rotulo: registro }];
}
