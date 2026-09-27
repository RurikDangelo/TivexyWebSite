import { Page } from '@/components/page/page';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A forma do que vem: símbolo, título, a frase de contexto e o cartão com a
 * linha de convite — logo, nome da empresa e o botão de aceitar.
 *
 * Uma linha só, porque uma é o caso comum e é o piso da altura: prometer três
 * faria a tela encolher quando chegasse o convite único.
 */
export default function Loading() {
  return (
    <Page variant="intersticial">
      <div role="status" aria-busy className="flex flex-col gap-5">
        <span className="sr-only">Carregando</span>

        <div className="flex flex-col gap-3">
          <Skeleton largura="3.5rem" altura="3.5rem" raio="pill" />
          <Skeleton largura="16rem" altura="2.25rem" className="max-w-full" />
          <Skeleton largura="100%" altura="1rem" />
          <Skeleton largura="80%" altura="1rem" />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <div className="rounded-card border border-line-subtle p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton largura="2.25rem" altura="2.25rem" raio="card" />
                  <Skeleton largura="10rem" altura="0.875rem" />
                </div>
                <Skeleton largura="10rem" altura="2.375rem" className="max-w-full" />
              </div>
            </div>
            <Skeleton largura="100%" />
            <Skeleton largura="45%" />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
