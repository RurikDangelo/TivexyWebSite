import { GradeDeRegistro, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/**
 * O esqueleto do comprovante: fatos à esquerda, itens e pagamento no meio,
 * ações à direita — a mesma `GradeDeRegistro` da página.
 *
 * As tabelas nascem com o cabeçalho de verdade porque os rótulos das colunas
 * não dependem de leitura nenhuma. O que falta é só o conteúdo.
 */
export default function VendaLoading() {
  return (
    <Page variant="registro">
      <div className="mb-5 flex flex-col gap-2">
        <Skeleton largura="7rem" altura="0.875rem" />
        <Skeleton largura="13rem" altura="1.5rem" />
        <Skeleton largura="17rem" altura="1rem" />
      </div>

      <GradeDeRegistro>
        <Card className="h-fit">
          <CardContent className="flex flex-col gap-3 pt-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton largura="5rem" altura="0.8125rem" />
                <Skeleton largura="9rem" altura="0.875rem" />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <Skeleton largura="4rem" altura="1rem" />
            </CardHeader>
            <Table densidade="densa" moldura="nenhuma" rotulo="Carregando os itens">
              <THead>
                <TR>
                  <TH>Descrição</TH>
                  <TH alinhamento="fim">Quantidade</TH>
                  <TH alinhamento="fim">Total</TH>
                </TR>
              </THead>
              <TBody>
                {Array.from({ length: 4 }, (_, i) => (
                  <SkeletonRow key={i} colunas={3} densidade="densa" />
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton largura="6.5rem" altura="1rem" />
            </CardHeader>
            <Table densidade="densa" moldura="nenhuma" rotulo="Carregando os pagamentos">
              <THead>
                <TR>
                  <TH>Forma</TH>
                  <TH>No caixa</TH>
                  <TH alinhamento="fim">Valor</TH>
                </TR>
              </THead>
              <TBody>
                {Array.from({ length: 2 }, (_, i) => (
                  <SkeletonRow key={i} colunas={3} densidade="densa" />
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="h-fit">
            <CardHeader>
              <Skeleton largura="5rem" altura="1rem" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton altura="4rem" raio="card" />
              <Skeleton largura="11rem" altura="2.375rem" />
            </CardContent>
          </Card>
        </div>
      </GradeDeRegistro>
    </Page>
  );
}
