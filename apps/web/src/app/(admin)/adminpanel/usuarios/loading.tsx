import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, Table } from '@/components/ui/table';

/*
 * O esqueleto da lista de vínculos, na forma que a tela tem de verdade: faixa
 * de três indicadores, barra de filtro e tabela densa de seis colunas.
 *
 * Os rótulos das colunas não são esqueleto porque não dependem do banco — eles
 * já estão certos antes de o dado chegar.
 */

/* Doze linhas: menos do que a tela cabe, o bastante para não encolher quando o dado chega. */
const LINHAS = 12;

export default function Loading() {
  return (
    <Page variant="painel">
      <div aria-busy className="flex flex-col gap-6">
        {/* Um `role="status"` só na página inteira: cada esqueleto é `aria-hidden`. */}
        <span className="sr-only" role="status">
          Carregando os vínculos de pessoas com empresas
        </span>

        <div className="flex flex-col gap-2">
          <Skeleton largura="8rem" altura="1.5rem" />
          <Skeleton largura="24rem" altura="1rem" />
        </div>

        <StatGrid colunas={3}>
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonStat key={i} />
          ))}
        </StatGrid>

        {/* 38px: a altura do `Select` no tamanho padrão, ao lado do botão de filtrar. */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Skeleton largura="16rem" altura="2.375rem" />
          <Skeleton largura="6rem" altura="2.375rem" />
        </div>

        <Table densidade="densa" rotulo="Vínculos, carregando">
          <THead>
            <tr>
              <TH>Pessoa</TH>
              <TH className="hidden max-md:block lg:table-cell">Empresa</TH>
              <TH>Papel</TH>
              <TH>Situação</TH>
              <TH className="hidden max-md:block xl:table-cell" alinhamento="fim">
                Convidado em
              </TH>
              <TH alinhamento="fim">Acesso</TH>
            </tr>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={6} densidade="densa" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
