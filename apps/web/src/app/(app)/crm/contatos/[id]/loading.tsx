import { GradeDeRegistro, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, Table } from '@/components/ui/table';

/**
 * O esqueleto da pessoa — com a grade da pessoa.
 *
 * Mesma variante de largura (`registro`, teto de 1400px) e mesmas duas colunas
 * da tela real, para que a coluna de fatos não nasça larga e encolha quando os
 * dados chegarem. As medidas dos blocos são as do `Card` e do `<Table densa>`.
 */

const FATOS = 6;
const NEGOCIOS = 4;

export default function CarregandoContato() {
  return (
    <Page variant="registro">
      <div role="status" aria-busy>
        <span className="sr-only">Carregando</span>

        <div aria-hidden className="mb-5 flex flex-col gap-2">
          {/* A trilha ("← Pessoas") vem antes do título e ocupa altura própria. */}
          <Skeleton largura="7rem" altura="1.25rem" />
          <Skeleton largura="18rem" altura="1.75rem" />
          <Skeleton largura="12rem" altura="1rem" />
        </div>

        <GradeDeRegistro className="xl:grid-cols-[18rem_minmax(0,1fr)]">
          <Card aria-hidden>
            <CardHeader>
              <Skeleton largura="4rem" altura="1rem" />
              <Skeleton
                largura="3rem"
                altura="3rem"
                raio="pill"
                className="col-start-2 row-span-2 row-start-1"
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: FATOS }, (_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton largura="5rem" altura="0.8125rem" />
                  <Skeleton largura="9rem" />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <section aria-hidden className="flex flex-col gap-3">
              {/* Título de seção em `text-h2` (18px), fora de cartão. */}
              <Skeleton largura="9rem" altura="1.25rem" />
              <Table densidade="densa" aria-hidden>
                <THead>
                  <tr>
                    {Array.from({ length: 4 }, (_, i) => (
                      <TH key={i}>
                        <Skeleton largura="3.5rem" altura="0.6875rem" />
                      </TH>
                    ))}
                  </tr>
                </THead>
                <TBody>
                  {Array.from({ length: NEGOCIOS }, (_, i) => (
                    <SkeletonRow key={i} colunas={4} densidade="densa" />
                  ))}
                </TBody>
              </Table>
            </section>

            {/* Agenda e cadastro: dois cartões, na ordem em que a tela os monta. */}
            {[0, 1].map((i) => (
              <Card key={i} aria-hidden>
                <CardHeader>
                  <Skeleton largura="7rem" altura="1rem" />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Skeleton largura="4rem" altura="0.6875rem" />
                  <Skeleton largura="100%" />
                  <Skeleton largura="80%" />
                </CardContent>
              </Card>
            ))}
          </div>
        </GradeDeRegistro>
      </div>
    </Page>
  );
}
