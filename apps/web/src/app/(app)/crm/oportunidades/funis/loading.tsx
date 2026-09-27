import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { Table, TBody } from '@/components/ui/table';

/** Duas fichas e cinco etapas: o tamanho de um funil recém-criado, não um número bonito. */
const FUNIS = 2;
const ETAPAS = 5;
const COLUNAS = 4;

/**
 * O esqueleto da tela de funis.
 *
 * As linhas de etapa são `<SkeletonRow>` dentro do `<Table>` de verdade: elas
 * herdam o contêiner, a densidade e as larguras de coluna reais, em vez de
 * imitá-las e desalinhar quando o dado chega.
 */
export default function CarregandoOsFunis() {
  return (
    <Page variant="ajuste">
      <div role="status" aria-busy className="flex flex-col gap-6">
        <span className="sr-only">Carregando os funis…</span>

        <div className="flex flex-col gap-2">
          <Skeleton largura="10rem" altura="1rem" />
          <Skeleton largura="14rem" altura="1.8rem" />
          <Skeleton largura="100%" altura="1rem" />
        </div>

        {Array.from({ length: FUNIS }, (_, funil) => (
          <Card key={funil}>
            <CardHeader className="gap-3">
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                <Skeleton largura="11rem" altura="1.4rem" />
                <Skeleton largura="7rem" altura="1.5rem" raio="pill" />
              </div>
              <Skeleton largura="15rem" altura="0.8125rem" className="col-span-2" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Table
                densidade="densa"
                moldura="nenhuma"
                classNameMoldura="overflow-clip rounded-card border border-line-subtle"
              >
                <TBody>
                  {Array.from({ length: ETAPAS }, (_, etapa) => (
                    <SkeletonRow key={etapa} colunas={COLUNAS} densidade="densa" />
                  ))}
                </TBody>
              </Table>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Skeleton altura="2.375rem" className="flex-1" />
                <Skeleton largura="10rem" altura="2.375rem" />
                <Skeleton largura="8rem" altura="2.375rem" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  );
}
