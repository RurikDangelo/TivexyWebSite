import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

/**
 * Quantas linhas o esqueleto desenha.
 *
 * Doze é o que cabe abaixo do cabeçalho e da barra de filtro num monitor de
 * 1080p com a linha de 44px — a mesma altura que a tabela real vai ocupar.
 * Mais que isso empurraria a página para uma rolagem que os dados não trazem.
 */
const LINHAS = 12;

/**
 * A forma do que vem: cabeçalho, barra de filtro e a tabela de produtos.
 *
 * O esqueleto usa o mesmo `<Table>` da página, com os mesmos rótulos de coluna
 * e as mesmas regras de largura. Esqueleto de três cartões antes de uma tabela
 * é pior que nenhum: promete um layout e entrega outro, e a página salta no
 * primeiro dado que chega.
 *
 * A coluna de estoque fica de fora de propósito — ela só existe quando o tenant
 * tem o módulo, e o esqueleto não tem como saber disso sem consultar o banco.
 * Errar uma coluna a menos custa menos que prometer uma que não vem.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      {/* Um anúncio só para a tela inteira: cada esqueleto é decorativo e sai da árvore. */}
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando a lista</span>

        {/* PageHeader: h1 de 24px, descrição de 16px, `mb-5`. */}
        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="14rem" altura="1.75rem" />
          <Skeleton largura="20rem" altura="1rem" />
        </div>

        {/* FilterBar: busca flexível, dois selects e o botão, na altura `md` do campo. */}
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
          <Skeleton altura="2.375rem" className="md:min-w-56 md:flex-1" />
          <Skeleton largura="12rem" altura="2.375rem" />
          <Skeleton largura="10rem" altura="2.375rem" />
          <Skeleton largura="5.5rem" altura="2.375rem" />
        </div>

        <Table densidade="larga" rotulo="Carregando a lista">
          <THead>
            <TR>
              <TH className="w-2/5">Nome</TH>
              <TH className="hidden lg:table-cell">Categoria</TH>
              <TH className="hidden xl:table-cell">Código</TH>
              <TH alinhamento="fim">Preço</TH>
              <TH alinhamento="fim" className="hidden lg:table-cell">
                Margem
              </TH>
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
