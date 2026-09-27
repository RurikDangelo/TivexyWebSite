import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow } from '@/components/ui/skeleton';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

import { COLUNAS_DA_LISTA } from './company-rows';

/*
 * Doze linhas: menos que a página inteira (50) e mais que a dobra, de modo que
 * o esqueleto preencha a primeira tela sem montar uma tabela gigante que vai
 * ser jogada fora em milissegundos.
 */
const LINHAS = 12;

/**
 * O que a lista de contas mostra enquanto lê.
 *
 * Tabela de verdade, com o cabeçalho real e as mesmas colunas: é isto que
 * impede o salto de layout que o esqueleto genérico de `(app)/loading.tsx`
 * provocava a cada busca — ele desenhava três cartões antes de uma lista.
 *
 * `role="status"` em UM lugar só; os esqueletos são `aria-hidden` por dentro.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy className="flex flex-col gap-4">
        <span className="sr-only">Carregando a lista</span>

        {/* Cabeçalho da página: título em `--text-h1` (24px) e a linha de contexto. */}
        <div className="mb-1 flex flex-col gap-2">
          <Skeleton largura="16rem" altura="1.5rem" />
          <Skeleton largura="22rem" altura="1rem" />
        </div>

        {/* A busca: campo de 38px mais o botão, como o `SearchBox` monta. */}
        <div className="flex w-full gap-2 sm:max-w-md">
          <Skeleton altura="2.375rem" className="min-w-0 flex-1" />
          <Skeleton largura="5.5rem" altura="2.375rem" />
        </div>

        <Table densidade="larga" rotulo="Carregando a lista">
          <THead>
            <TR>
              {COLUNAS_DA_LISTA.map((col) => (
                <TH key={col.rotulo} className={col.classe}>
                  {col.rotulo}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={COLUNAS_DA_LISTA.length} densidade="larga" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
