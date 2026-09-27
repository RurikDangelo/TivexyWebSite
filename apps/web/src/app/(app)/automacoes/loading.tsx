import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/**
 * A forma da tela de automações enquanto ela carrega.
 *
 * Os cabeçalhos das duas tabelas são texto de verdade: eles não dependem do
 * banco, e um esqueleto no lugar deles esconderia a única informação já
 * conhecida. O que vira barra é só a linha, que é o que ainda não chegou.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy className="flex flex-col gap-6">
        <span className="sr-only">Carregando as automações</span>

        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="12rem" altura="1.5rem" />
          <Skeleton largura="min(42rem, 100%)" altura="1rem" />
        </div>

        <StatGrid colunas={4}>
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </StatGrid>

        <div className="flex flex-col gap-3">
          <Skeleton largura="11rem" altura="1.125rem" />
          <Table rotulo="Carregando as automações desta empresa">
            <THead>
              <TR>
                <TH>Automação</TH>
                <TH>Quando</TH>
                <TH>Então</TH>
                <TH>Situação</TH>
                <TH alinhamento="fim">
                  <span className="sr-only">Ações</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonRow key={i} colunas={5} />
              ))}
            </TBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton largura="10rem" altura="1.125rem" />
          <Table rotulo="Carregando as últimas execuções" densidade="densa">
            <THead>
              <TR>
                <TH>Resultado</TH>
                <TH>Automação</TH>
                <TH>O que aconteceu</TH>
                <TH>Evento</TH>
                <TH alinhamento="fim">Quando</TH>
              </TR>
            </THead>
            <TBody>
              {Array.from({ length: 10 }, (_, i) => (
                <SkeletonRow key={i} colunas={5} densidade="densa" />
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </Page>
  );
}
