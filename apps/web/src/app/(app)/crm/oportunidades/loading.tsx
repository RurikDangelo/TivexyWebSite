import { SANGRIA_DO_GUTTER, Page } from '@/components/page/page';
import { Skeleton, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { cn } from '@/lib/utils';

/** Quantas colunas o esqueleto desenha antes de saber quantas etapas existem. */
const COLUNAS = 4;
/** Cartões por coluna, decrescendo: um funil real afunila. */
const CARTOES = [3, 3, 2, 1] as const;

/**
 * O esqueleto do quadro.
 *
 * Tem a forma do que vem: faixa de três indicadores e colunas na horizontal.
 * O `loading.tsx` único da raiz desenhava três cartões em `max-w-5xl` para as
 * 33 telas do app — aqui a página prometia um layout e entregava outro, e é
 * esse salto que este arquivo existe para apagar. Mesmo `<Page variant>` da
 * rota, mesma sangria, mesma largura de coluna.
 */
export default function CarregandoOQuadro() {
  return (
    <Page variant="quadro">
      {/* Um anúncio só para a tela inteira: cada esqueleto é decorativo e sai da árvore. */}
      <div role="status" aria-busy className="flex flex-col gap-5">
        <span className="sr-only">Carregando o funil…</span>

        <div className="flex flex-col gap-2">
          {/* `--text-h1` tem 24px de corpo e 1.2 de altura: 1.8rem. */}
          <Skeleton largura="14rem" altura="1.8rem" />
          <Skeleton largura="22rem" altura="1rem" />
        </div>

        <StatGrid colunas={3}>
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonStat key={i} />
          ))}
        </StatGrid>

        <div className={cn('overflow-hidden pb-2', SANGRIA_DO_GUTTER)}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start">
            {Array.from({ length: COLUNAS }, (_, coluna) => (
              <div
                key={coluna}
                className="flex min-w-0 flex-col rounded-card border border-line-subtle bg-surface-sunken md:w-[19.5rem] md:shrink-0"
              >
                <div className="flex flex-col gap-1.5 rounded-t-card border-b border-line-subtle bg-surface-panel px-3 py-2.5">
                  <Skeleton largura="8rem" altura="1.125rem" />
                  {/* O total da coluna é `--text-metric-sm`: 22px. */}
                  <Skeleton largura="6rem" altura="1.375rem" />
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {Array.from({ length: CARTOES[coluna] }, (_, cartao) => (
                    <div
                      key={cartao}
                      className="flex flex-col gap-2 rounded-card border border-line-subtle bg-surface-panel p-2.5"
                    >
                      <Skeleton largura="80%" />
                      <Skeleton largura="55%" />
                      <Skeleton largura="40%" altura="1rem" raio="pill" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}
