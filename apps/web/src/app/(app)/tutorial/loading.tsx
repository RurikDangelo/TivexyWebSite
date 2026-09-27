import { Page } from '@/components/page/page';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Quantos passos cada cartão mostra no esqueleto, na ordem das seções reais. */
const PASSOS_POR_SECAO = [2, 2, 3, 4] as const;

/** Uma linha de passo: marcador, título, duas linhas de texto. */
function LinhaDePasso() {
  return (
    <div className="flex gap-3 p-3">
      <Skeleton largura="2rem" altura="2rem" raio="pill" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton largura="16rem" altura="1rem" className="max-w-full" />
        <Skeleton largura="100%" />
        <Skeleton largura="55%" altura="0.8125rem" />
      </div>
    </div>
  );
}

/**
 * A forma do que vem: cabeçalho de página, trilho de progresso à esquerda e as
 * quatro seções de passos à direita.
 *
 * A mesma grade de duas colunas da página, e a mesma variante de largura: um
 * esqueleto de coluna única antes de uma tela de duas colunas promete um
 * layout e entrega outro.
 */
export default function Loading() {
  return (
    <Page variant="registro">
      <div role="status" aria-busy>
        <span className="sr-only">Carregando</span>

        <div className="mb-5 flex flex-col gap-2">
          {/* O `--text-h1` do `PageHeader`: 24px. */}
          <Skeleton largura="10rem" altura="1.5rem" />
          <Skeleton largura="38rem" altura="1rem" className="max-w-full" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <Card className="xl:self-start">
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-2">
                <Skeleton largura="6rem" altura="0.6875rem" />
                {/* O número em `--text-metric`: 32px. */}
                <Skeleton largura="8rem" altura="2rem" />
                <Skeleton largura="100%" altura="0.625rem" raio="pill" />
              </div>
              <div className="flex flex-col gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex min-h-8 items-center justify-between gap-2 px-2">
                    <Skeleton largura="8rem" altura="0.875rem" />
                    <Skeleton largura="2rem" altura="0.8125rem" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            {PASSOS_POR_SECAO.map((passos, secao) => (
              <div key={secao}>
                {/* O `<h2>` da seção: 18px. */}
                <Skeleton largura="12rem" altura="1.125rem" className="mb-2" />
                <Card>
                  <CardContent className="flex flex-col gap-1 pt-2">
                    {Array.from({ length: passos }, (_, i) => (
                      <LinhaDePasso key={i} />
                    ))}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}
