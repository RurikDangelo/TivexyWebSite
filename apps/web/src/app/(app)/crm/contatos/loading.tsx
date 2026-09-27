import { Page } from '@/components/page/page';
import { Skeleton } from '@/components/ui/skeleton';
import { TBody, TD, TH, THead, Table } from '@/components/ui/table';

import { VISIBILIDADE_DAS_COLUNAS } from './contact-rows';

/**
 * O esqueleto da lista de pessoas — com a forma da lista de pessoas.
 *
 * Antes toda navegação nesta rota (e a busca É navegação, o `SearchBox` é um
 * GET) piscava o esqueleto genérico de `(app)/loading.tsx`: três cartões em
 * `max-w-5xl` antes de uma tabela em largura cheia. A página encolhia 128px e
 * voltava. Aqui a variante de largura, a moldura, a densidade e as colunas são
 * as mesmas da tela real, importadas dela — a linha da tabela não se move
 * quando o dado chega.
 */

/* Uma tela cheia em 1080p na densidade `larga`: 44px por linha. */
const LINHAS = 15;

const COLUNAS = Object.values(VISIBILIDADE_DAS_COLUNAS);

/* Larguras fixas, em ciclo: o mesmo HTML no servidor e no cliente. Nada de sorteio. */
const LARGURAS = ['72%', '46%', '60%', '38%', '54%', '44%', '58%'] as const;

export default function CarregandoContatos() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy className="flex flex-col">
        <span className="sr-only">Carregando</span>

        {/* Cabeçalho: `text-h1` (24px) e a linha de descrição em `text-body-lg`. */}
        <div aria-hidden className="mb-5 flex flex-col gap-2">
          <Skeleton largura="14rem" altura="1.75rem" />
          <Skeleton largura="20rem" altura="1rem" />
        </div>

        {/* A faixa de busca e a ação, na mesma altura de controle (38px). */}
        <div aria-hidden className="mb-4 flex flex-wrap items-center gap-3">
          <Skeleton altura="2.375rem" className="min-w-64 flex-1" />
          <Skeleton largura="10rem" altura="2.375rem" />
        </div>

        <Table aria-hidden>
          <THead>
            <tr>
              {COLUNAS.map((classe, i) => (
                <TH key={i} className={classe}>
                  <Skeleton largura="4rem" altura="0.6875rem" />
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {Array.from({ length: LINHAS }, (_, linha) => (
              <tr key={linha}>
                {COLUNAS.map((classe, coluna) => (
                  <TD key={coluna} className={classe}>
                    {coluna === 0 ? (
                      <span className="flex items-center gap-2.5">
                        <Skeleton largura="1.5rem" altura="1.5rem" raio="pill" />
                        <Skeleton largura="9rem" />
                      </span>
                    ) : (
                      <Skeleton largura={LARGURAS[(linha + coluna) % LARGURAS.length]} />
                    )}
                  </TD>
                ))}
              </tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
