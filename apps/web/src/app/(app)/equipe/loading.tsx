import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table } from '@/components/ui/table';

import { colunasDaTabela } from './member-row';

/** Doze linhas: o bastante para o esqueleto ocupar a mesma altura da primeira página. */
const LINHAS = 12;

/* O esqueleto assume quem administra — é quem abre esta tela. Para quem só lê,
 * a tabela chega com uma coluna a menos: é o preço de não saber a permissão
 * antes de a página renderizar. */
const COLUNAS = colunasDaTabela(true);

/**
 * O carregamento de `/equipe`, com a forma do que vem.
 *
 * Mesma `<Page variant>`, mesma faixa de três indicadores, mesma tabela e
 * mesmos cabeçalhos da tela real — é isso que impede o salto de layout quando
 * os dados chegam. Um esqueleto de cartões antes de uma tabela é pior que
 * nenhum: promete um layout e entrega outro.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      {/* Um `role="status"` só na página inteira: vinte esqueletos anunciando "carregando" é ruído. */}
      <div aria-busy className="flex flex-col gap-6">
        <span role="status" className="sr-only">
          Carregando a equipe
        </span>

        <header className="mb-5 flex flex-col gap-2" aria-hidden>
          <Skeleton largura="14rem" altura="1.5rem" />
          <Skeleton largura="min(38rem, 100%)" altura="1rem" />
        </header>

        <StatGrid colunas={3}>
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </StatGrid>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center" aria-hidden>
            <Skeleton altura="2.375rem" className="md:min-w-56 md:flex-1" />
            <Skeleton largura="13rem" altura="2.375rem" />
            <Skeleton largura="5.5rem" altura="2.375rem" />
          </div>

          <Table densidade="larga" rotulo="Carregando as pessoas desta empresa">
            <THead>
              <TR>
                <TH>Pessoa</TH>
                <TH>E-mail</TH>
                <TH>Papel</TH>
                <TH>Situação</TH>
                <TH>No acesso desde</TH>
                <TH alinhamento="fim">
                  <span className="sr-only">Ações</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {Array.from({ length: LINHAS }, (_, i) => (
                <SkeletonRow key={i} colunas={COLUNAS} densidade="larga" />
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </Page>
  );
}
