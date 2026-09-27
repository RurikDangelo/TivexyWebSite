import { GradeDePainel, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonChart, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';

/**
 * O esqueleto do painel, com a forma do painel.
 *
 * O `loading.tsx` do grupo `(app)` desenhava três cartões de texto em três
 * colunas — a promessa de um layout que esta rota nunca entregou. Aqui a
 * ordem, a grade e as alturas são as mesmas do `dashboard.tsx`: faixa de cinco
 * indicadores, gráfico de 280px na coluna principal, blocos curtos na coluna
 * de apoio. É isso que impede o salto quando os números chegam.
 *
 * Um único anúncio de carregamento, no contêiner: os esqueletos são
 * decorativos e saem da árvore de acessibilidade por conta própria.
 */
export default function Loading() {
  return (
    <Page variant="painel">
      <span role="status" className="sr-only">
        Carregando o painel
      </span>

      <div aria-busy="true">
        {/* Mesmas medidas do `PageHeader`: `text-h1` (24px), descrição de 16px, `mb-5`. */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton largura="12rem" altura="1.75rem" />
            <Skeleton largura="20rem" altura="1rem" className="max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            {/* O trilho do seletor 7/30/90 e o botão Atualizar, ambos de 32px. */}
            <Skeleton largura="13rem" altura="2.25rem" raio="pill" />
            <Skeleton largura="6.5rem" altura="2rem" />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <StatGrid colunas={5}>
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonStat key={i} />
            ))}
          </StatGrid>

          <GradeDePainel>
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardHeader>
                  <Skeleton largura="7rem" altura="1rem" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <SkeletonChart altura={280} barras={20} />
                  <div className="grid grid-cols-2 gap-3 border-t border-line-subtle pt-4 sm:grid-cols-3">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="flex flex-col gap-1.5">
                        <Skeleton largura="5rem" altura="0.8125rem" />
                        <Skeleton largura="7rem" altura="1.375rem" />
                        <Skeleton largura="8rem" altura="0.8125rem" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Skeleton largura="9rem" altura="1rem" />
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Skeleton largura="8rem" altura="0.875rem" />
                        <Skeleton largura="6rem" altura="0.875rem" />
                      </div>
                      {/* Trilho do `<Progress densidade="densa">`: 6px. */}
                      <Skeleton altura="0.375rem" raio="pill" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {[3, 3, 4].map((linhas, bloco) => (
                <Card key={bloco}>
                  <CardHeader>
                    <Skeleton largura="10rem" altura="1rem" />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {Array.from({ length: linhas }, (_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton largura="2rem" altura="2rem" raio="pill" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <Skeleton largura="80%" altura="0.875rem" />
                          <Skeleton largura="55%" altura="0.8125rem" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </GradeDePainel>
        </div>
      </div>
    </Page>
  );
}
