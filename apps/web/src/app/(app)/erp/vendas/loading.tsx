import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/** O que já cabe na primeira tela em 1080p — mais linhas só rolariam para fora. */
const LINHAS = 14;

/**
 * O esqueleto da lista de vendas, com a forma do que vai chegar.
 *
 * Mesmo `<Page variant>`, mesma `<Table>`, mesmas colunas e mesma densidade da
 * rota: é isso que impede o salto de largura e de altura quando os dados
 * chegam. Um esqueleto de três cartões antes de uma tabela promete um layout e
 * entrega outro — pior do que nenhum.
 */
export default function VendasLoading() {
  return (
    <Page variant="operacao">
      {/* Espelha o `PageHeader`: `mb-5`, título de 24px, descrição de 16px. */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton largura="11rem" altura="1.5rem" />
          <Skeleton largura="18rem" altura="1rem" />
        </div>
        <div className="flex gap-2">
          <Skeleton largura="12rem" altura="2.375rem" />
          <Skeleton largura="9rem" altura="2.375rem" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <StatGrid colunas={4}>
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonStat key={i} />
          ))}
        </StatGrid>

        {/* A faixa de filtros: trilho de período à esquerda, busca e situação à direita. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Skeleton largura="17rem" altura="2.25rem" raio="pill" className="shrink-0" />
          <div className="flex min-w-0 flex-1 gap-2">
            <Skeleton altura="2.375rem" className="min-w-0 flex-1" />
            <Skeleton largura="11rem" altura="2.375rem" />
            <Skeleton largura="5.5rem" altura="2.375rem" />
          </div>
        </div>

        {/*
         * Cabeçalho de verdade, esqueleto só no corpo: os rótulos das colunas
         * não dependem de leitura nenhuma, e mostrá-los já orienta a varredura
         * antes de o primeiro registro existir.
         */}
        <Table densidade="larga" rotulo="Carregando os registros">
          <THead>
            <TR>
              <TH>Nº</TH>
              <TH>Quando</TH>
              <TH>Cliente</TH>
              <TH className="hidden xl:table-cell">Pagamento</TH>
              <TH alinhamento="fim">Total</TH>
            </TR>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={5} densidade="larga" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
