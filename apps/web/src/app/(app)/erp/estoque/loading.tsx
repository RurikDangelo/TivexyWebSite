import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/** Larguras dos seis cabeçalhos, na proporção das colunas reais do saldo. */
const CABECALHOS = ['6rem', '5.5rem', '3.5rem', '4rem', '4.5rem', '2rem'] as const;

/**
 * O estoque carregando, com a forma do que vai chegar.
 *
 * Mesma variante de largura da rota (`operacao`) e mesma sequência de blocos:
 * cabeçalho, abas, quatro tiles de KPI, barra de filtro e a tabela do saldo com
 * cabeçalho de coluna. Esqueleto de três cartões antes de uma tabela é pior que
 * nenhum — promete um layout e entrega outro, e a página salta quando o dado
 * chega.
 *
 * Doze linhas, e não as cinquenta da página: o esqueleto precisa preencher a
 * primeira tela, não a rolagem inteira.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando o estoque</span>

        {/* Um `aria-hidden` só: quem anuncia o carregamento é o contêiner acima. */}
        <div aria-hidden>
          <div className="mb-5 flex flex-col gap-2">
            {/* `--text-h1` são 24px em 1.2; a descrição é `--text-body-lg`. */}
            <Skeleton largura="11rem" altura="1.75rem" />
            <Skeleton largura="20rem" altura="1rem" />
          </div>

          <div className="mb-4 flex gap-2 border-b border-line-subtle pb-2.5">
            <Skeleton largura="3rem" altura="1rem" />
            <Skeleton largura="7rem" altura="1rem" />
          </div>

          <div className="flex flex-col gap-4">
            <StatGrid colunas={4}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonStat key={i} />
              ))}
            </StatGrid>

            {/* A barra de filtro: busca flexível, um select e o botão. */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Skeleton altura="2.375rem" className="md:min-w-56 md:flex-1" />
              <Skeleton largura="12rem" altura="2.375rem" />
              <Skeleton largura="5.5rem" altura="2.375rem" />
            </div>

            <Table densidade="larga">
              <THead>
                <TR>
                  {CABECALHOS.map((largura) => (
                    <TH key={largura}>
                      {/* `--text-eyebrow` são 11px: o cabeçalho real não é mais alto que isto. */}
                      <Skeleton largura={largura} altura="0.6875rem" />
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {Array.from({ length: 12 }, (_, i) => (
                  <SkeletonRow key={i} colunas={6} densidade="larga" />
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </div>
    </Page>
  );
}
