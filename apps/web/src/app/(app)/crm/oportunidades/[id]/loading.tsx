import { GradeDeRegistro, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonStat } from '@/components/ui/skeleton';

/** Os seis fatos da coluna da esquerda — o número é fixo, então o esqueleto acerta a altura. */
const FATOS = 6;

/**
 * O esqueleto da página de uma oportunidade.
 *
 * Mesma variante e mesma grade de três colunas da rota: o que chega não
 * reposiciona nada. Na pilha do celular a ordem também é a mesma — valor,
 * conteúdo, fatos.
 */
export default function CarregandoAOportunidade() {
  return (
    <Page variant="registro">
      <div role="status" aria-busy className="flex flex-col gap-5">
        <span className="sr-only">Carregando o registro…</span>

        <div className="flex flex-col gap-2">
          <Skeleton largura="10rem" altura="1rem" />
          <Skeleton largura="20rem" altura="1.8rem" />
          <Skeleton largura="14rem" altura="1.25rem" raio="pill" />
        </div>

        <GradeDeRegistro>
          <Card className="order-3 h-fit xl:order-1">
            <CardHeader>
              <Skeleton largura="5rem" altura="1.25rem" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: FATOS }, (_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton largura="6rem" altura="0.8125rem" />
                  <Skeleton largura="9rem" />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-2">
            <Card>
              <CardHeader>
                <Skeleton largura="8rem" altura="1.25rem" />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} altura="3rem" raio="card" />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton largura="7rem" altura="1.25rem" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton largura="100%" />
                <Skeleton largura="88%" />
                <Skeleton largura="64%" />
              </CardContent>
            </Card>
          </div>

          <div className="order-1 flex flex-col gap-4 xl:order-3">
            <SkeletonStat />
            <Card>
              <CardHeader>
                <Skeleton largura="8rem" altura="1.25rem" />
              </CardHeader>
              <CardContent>
                <Skeleton largura="9rem" altura="2rem" raio="control" />
              </CardContent>
            </Card>
          </div>
        </GradeDeRegistro>
      </div>
    </Page>
  );
}
