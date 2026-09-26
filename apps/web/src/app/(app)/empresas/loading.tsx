import { Page } from '@/components/page/page';
import { Skeleton } from '@/components/ui/skeleton';

/** Três linhas: quem cai nesta tela participa de mais de uma empresa, e raramente de muitas. */
const LINHAS = 3;

/**
 * O carregamento de `/empresas`.
 *
 * Mesma variante `intersticial` da tela pronta — é o que impede o bloco de
 * pular do centro para o topo quando a lista chega. As linhas têm a altura do
 * cartão de empresa (avatar de 36px mais `p-3`), não de um retângulo qualquer.
 */
export default function Loading() {
  return (
    <Page variant="intersticial">
      <div aria-busy className="flex flex-col gap-6">
        <span role="status" className="sr-only">
          Carregando as suas empresas
        </span>

        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton largura="9rem" altura="0.6875rem" raio="pill" />
          <Skeleton largura="14rem" altura="2.25rem" />
          <Skeleton largura="100%" altura="1rem" />
        </div>

        <div className="flex flex-col gap-2" aria-hidden>
          {Array.from({ length: LINHAS }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-card border border-line-subtle bg-surface-panel p-3 shadow-card"
            >
              <Skeleton largura="2.25rem" altura="2.25rem" raio="card" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton largura="60%" altura="0.875rem" />
                <Skeleton largura="35%" altura="0.8125rem" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
