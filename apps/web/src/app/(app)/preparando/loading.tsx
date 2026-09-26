import { PROVISIONING_STEPS } from '@tivexy/core';

import { Page } from '@/components/page/page';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A forma do que vem: símbolo, título, o selo da situação e o cartão de etapas.
 *
 * O número de linhas de etapa vem de `PROVISIONING_STEPS`, que é quantas a
 * execução grava — assim o esqueleto tem a altura real e a tela não pula quando
 * a lista chega. Se o dado não vier, o cartão encolhe para uma frase: o
 * esqueleto promete a forma do caso normal, não uma garantia.
 */
export default function Loading() {
  return (
    <Page variant="intersticial">
      <div role="status" aria-busy className="flex flex-col gap-5">
        <span className="sr-only">Carregando</span>

        <div className="flex flex-col gap-3">
          <Skeleton largura="3.5rem" altura="3.5rem" raio="pill" />
          <Skeleton largura="18rem" altura="2.25rem" className="max-w-full" />
          <Skeleton largura="100%" altura="1rem" />
        </div>

        <div className="flex items-center gap-2">
          <Skeleton largura="9rem" altura="0.875rem" />
          <Skeleton largura="7rem" altura="1.25rem" raio="pill" />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton largura="8rem" altura="0.6875rem" />
              <Skeleton largura="5rem" altura="1.125rem" raio="pill" />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton largura="7rem" altura="0.8125rem" />
                {/* `--text-metric-sm`: 22px. */}
                <Skeleton largura="4rem" altura="1.375rem" />
              </div>
              {/* O trilho do `<Progress densidade="larga">`: 10px. */}
              <Skeleton largura="100%" altura="0.625rem" raio="pill" />
            </div>

            <div className="flex flex-col gap-1.5">
              {PROVISIONING_STEPS.map((etapa) => (
                <div key={etapa} className="flex items-center gap-2.5 py-1">
                  <Skeleton largura="1.5rem" altura="1.5rem" raio="pill" />
                  <Skeleton className="min-w-0 flex-1" />
                  <Skeleton largura="4rem" altura="0.8125rem" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Skeleton largura="100%" altura="3rem" raio="card" />
      </div>
    </Page>
  );
}
