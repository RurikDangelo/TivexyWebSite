import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, Table, TH, THead, TR } from '@/components/ui/table';

/** Bastam para preencher a dobra em 1080p sem prometer uma lista que talvez não exista. */
const LINHAS = 10;

/**
 * O esqueleto desta rota, com a forma do que vai chegar.
 *
 * O `loading.tsx` de `(app)` desenhava título mais três cartões em `max-w-5xl`:
 * uma forma que não é a de nenhuma tela de lista, numa largura que não é a
 * desta — a página encolhia e se recentrava a cada busca. Aqui é o mesmo
 * `<Page variant="operacao">` e a mesma tabela de oito colunas, então o único
 * que muda quando os dados chegam é o texto.
 *
 * Os rótulos das colunas são reais porque são fixos: só o título da página fala
 * o vocabulário do nicho, e é por isso que ele é o único retângulo aqui.
 */
export default function CarregandoLeads() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando a lista.</span>

        {/* Cabeçalho: `mb-5` e as medidas de `--text-h1` e `--text-body-lg`. */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton largura="11rem" altura="1.75rem" />
            <Skeleton largura="22rem" altura="1rem" className="max-w-full" />
          </div>
          <Skeleton largura="10rem" altura="2.375rem" />
        </div>

        {/* Barra de filtros: busca flexível, um select de 11rem e o botão. */}
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
          <Skeleton altura="2.375rem" className="md:min-w-56 md:flex-1" />
          <Skeleton altura="2.375rem" className="md:w-44" />
          <Skeleton largura="6rem" altura="2.375rem" />
        </div>

        <Table densidade="larga">
          <THead>
            <TR>
              <TH>Nome</TH>
              <TH>Estado</TH>
              <TH className="hidden xl:table-cell">Empresa</TH>
              <TH className="hidden lg:table-cell">E-mail</TH>
              <TH className="hidden xl:table-cell">Telefone</TH>
              <TH className="hidden xl:table-cell">Origem</TH>
              <TH>Entrou</TH>
              <TH alinhamento="fim">
                <span className="sr-only">Ações</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={8} densidade="larga" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
