import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonForm, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/**
 * A forma de `/conta`: quatro cartões na largura de ajuste, na mesma ordem.
 *
 * O cartão de empresas traz o cabeçalho de verdade e três linhas em barra —
 * a quantidade de vínculos é o que não se sabe, não os nomes das colunas.
 */
export default function Loading() {
  return (
    <Page variant="ajuste">
      <div role="status" aria-busy className="flex flex-col gap-4">
        <span className="sr-only">Carregando sua conta</span>

        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="10rem" altura="1.5rem" />
          <Skeleton largura="min(18rem, 100%)" altura="1rem" />
        </div>

        <Card>
          <CardHeader>
            <Skeleton largura="4rem" altura="1rem" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SkeletonForm campos={1} />
            <Skeleton altura="3rem" raio="control" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton largura="4.5rem" altura="1rem" />
            <Skeleton largura="min(22rem, 100%)" altura="0.8125rem" />
          </CardHeader>
          <CardContent>
            <SkeletonForm campos={3} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton largura="6rem" altura="1rem" />
            <Skeleton largura="min(14rem, 100%)" altura="0.8125rem" />
          </CardHeader>
          <CardContent>
            <Table rotulo="Carregando suas empresas" densidade="densa" moldura="nenhuma">
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>Vínculo</TH>
                  <TH alinhamento="fim">
                    <span className="sr-only">Abrir</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {Array.from({ length: 3 }, (_, i) => (
                  <SkeletonRow key={i} colunas={3} densidade="densa" />
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton largura="3rem" altura="1rem" />
            <Skeleton largura="min(24rem, 100%)" altura="0.8125rem" />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Skeleton largura="12rem" altura="2.375rem" raio="control" />
            <Skeleton largura="14rem" altura="2.375rem" raio="control" />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
