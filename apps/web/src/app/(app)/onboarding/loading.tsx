import { Page } from '@/components/page/page';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A forma do que vem: símbolo, título grande, um parágrafo e o cartão de dois
 * caminhos.
 *
 * Mesma variante de largura da página (`ajuste`) — é o que impede o salto de
 * medida entre o esqueleto e o conteúdo, que era o defeito do `loading.tsx`
 * antigo do grupo.
 *
 * Um `role="status"` só, no contêiner: os esqueletos são `aria-hidden`, e vinte
 * deles anunciando "carregando" é ruído.
 */
export default function Loading() {
  return (
    <Page variant="ajuste">
      <div role="status" aria-busy className="flex flex-col gap-6">
        <span className="sr-only">Carregando</span>

        <div className="flex flex-col gap-3">
          <Skeleton largura="3.5rem" altura="3.5rem" raio="pill" />
          {/* O `--text-display` do `<h1>`: 36px. */}
          <Skeleton largura="22rem" altura="2.25rem" className="max-w-full" />
          <Skeleton largura="100%" altura="1rem" />
          <Skeleton largura="70%" altura="1rem" />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            <Skeleton largura="8rem" altura="0.6875rem" />
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton largura="2rem" altura="2rem" raio="pill" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton largura="14rem" altura="1rem" className="max-w-full" />
                  <Skeleton largura="100%" />
                  <Skeleton largura="60%" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Skeleton largura="16rem" altura="2.375rem" className="max-w-full" />
      </div>
    </Page>
  );
}
