import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/** Um blueprint semeia de seis a dez categorias; oito linhas é a altura típica da tela. */
const LINHAS = 8;

/**
 * A forma da tela: a tabela de categorias e, ao lado dela em `xl`, o cadastro.
 *
 * Mesma grade da página, para a coluna do cadastro não aparecer do nada quando
 * os dados chegarem.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando as categorias</span>

        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="8rem" altura="0.875rem" />
          <Skeleton largura="11rem" altura="1.75rem" />
          <Skeleton largura="22rem" altura="1rem" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <Table densidade="larga" rotulo="Carregando as categorias">
            <THead>
              <TR>
                <TH>Categoria</TH>
                <TH alinhamento="fim">Cadastros</TH>
              </TR>
            </THead>
            <TBody>
              {Array.from({ length: LINHAS }, (_, i) => (
                <SkeletonRow key={i} colunas={2} densidade="larga" />
              ))}
            </TBody>
          </Table>

          <Card>
            <CardHeader>
              <Skeleton largura="8rem" altura="1rem" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <Skeleton largura="3rem" altura="0.875rem" />
                <Skeleton altura="2.375rem" />
                <Skeleton altura="2.375rem" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}
