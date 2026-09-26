import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * A forma do formulário de criação, na ordem em que ela existe: cinco campos, o
 * cartão de prévia e só então o botão grande.
 *
 * `SkeletonForm` não serve aqui — ele desenha o botão logo depois do último
 * campo, e esta tela põe a prévia no meio. Um esqueleto que promete uma ordem e
 * entrega outra é o defeito que o esqueleto existe para evitar.
 */

/* Rótulos de comprimentos diferentes: uma régua de cinco traços iguais não parece formulário. */
const ROTULOS = ['4rem', '10rem', '6rem', '14rem', '15rem'] as const;

export default function Loading() {
  return (
    <Page variant="ajuste">
      <div aria-busy className="flex flex-col gap-4">
        <span className="sr-only" role="status">
          Carregando o formulário de novo cliente
        </span>

        <div className="mb-1 flex flex-col gap-2">
          <Skeleton largura="6rem" altura="0.875rem" />
          <Skeleton largura="12rem" altura="1.5rem" />
          <Skeleton altura="1rem" />
        </div>

        <div className="flex flex-col gap-3">
          {ROTULOS.map((largura) => (
            <div key={largura} className="flex flex-col gap-1.5">
              <Skeleton largura={largura} />
              {/* 38px: a altura do `Input`/`Select` no tamanho padrão. */}
              <Skeleton altura="2.375rem" />
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton largura="10rem" altura="1rem" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton largura="8rem" altura="0.6875rem" />
            <Skeleton largura="70%" altura="1.25rem" raio="pill" />
            <Skeleton largura="5rem" altura="0.6875rem" />
            <Skeleton largura="50%" altura="1.25rem" raio="pill" />
          </CardContent>
        </Card>

        {/* 44px: o botão `size="lg"` que confirma a criação. */}
        <Skeleton altura="2.75rem" />
      </div>
    </Page>
  );
}
