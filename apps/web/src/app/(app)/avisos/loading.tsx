import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

import { COLUNAS_DE_AVISOS } from './notification-row';

/** Metade da página: o bastante para preencher a dobra sem prometer uma lista cheia. */
const LINHAS = 14;

/**
 * O carregamento de `/avisos`, com a forma do que vem.
 *
 * Mesma variante de página, mesma faixa de três indicadores e a mesma tabela —
 * a única diferença entre este esqueleto e a tela pronta é o conteúdo das
 * células, que é o ponto: nada salta de lugar quando os avisos chegam.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div aria-busy className="flex flex-col gap-6">
        <span role="status" className="sr-only">
          Carregando os avisos
        </span>

        <header className="mb-5 flex flex-col gap-2" aria-hidden>
          <Skeleton largura="8rem" altura="1.5rem" />
          <Skeleton largura="min(34rem, 100%)" altura="1rem" />
        </header>

        <StatGrid colunas={3}>
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </StatGrid>

        <Table densidade="larga" rotulo="Carregando os seus avisos">
          <THead>
            <TR>
              <TH className="w-px whitespace-nowrap">Situação</TH>
              <TH>Aviso</TH>
              <TH>Quando</TH>
              <TH alinhamento="fim">
                <span className="sr-only">Ações</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={COLUNAS_DE_AVISOS} densidade="larga" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
