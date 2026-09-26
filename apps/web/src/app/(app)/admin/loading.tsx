import { Page } from '@/components/page/page';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, Table } from '@/components/ui/table';

/*
 * O esqueleto da lista de clientes.
 *
 * Existe porque o admin caía no `loading.tsx` de `(app)`, que desenha três
 * cartões em `md:grid-cols-3` — uma forma que nenhuma tela do admin tem. Um
 * esqueleto que promete um layout e entrega outro é pior que nenhum.
 *
 * Aqui a forma é a de verdade: faixa de cinco indicadores e tabela densa com o
 * cabeçalho real. Os rótulos das colunas não são esqueleto porque não dependem
 * do banco — eles já estão certos antes de o dado chegar.
 */

/* Doze linhas: menos do que a tela cabe, o bastante para a página não encolher quando o dado chega. */
const LINHAS = 12;

export default function Loading() {
  return (
    <Page variant="painel">
      <div aria-busy className="flex flex-col gap-6">
        {/* Um `role="status"` só na página inteira: cada esqueleto é `aria-hidden`. */}
        <span className="sr-only" role="status">
          Carregando os clientes da plataforma
        </span>

        <div className="flex flex-col gap-2">
          <Skeleton largura="10rem" altura="1.5rem" />
          <Skeleton largura="22rem" altura="1rem" />
        </div>

        <StatGrid colunas={5}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonStat key={i} />
          ))}
        </StatGrid>

        <Table densidade="densa" rotulo="Clientes da plataforma, carregando">
          <THead>
            <tr>
              <TH>Cliente</TH>
              <TH>Endereço</TH>
              <TH className="hidden max-md:block lg:table-cell">Nicho</TH>
              <TH>Plano</TH>
              <TH className="hidden max-md:block xl:table-cell">Módulos ligados</TH>
              <TH>Situação</TH>
              <TH alinhamento="fim">Criado em</TH>
            </tr>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, i) => (
              <SkeletonRow key={i} colunas={7} densidade="densa" />
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
