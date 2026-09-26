import { GradeDeRegistro, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonForm } from '@/components/ui/skeleton';

/** Quantos pares rótulo/valor a ficha desenha. Dez é a ficha cheia: preço, custo, margem, unidade, categoria, dois códigos, estoque, mínimo e cadastro. */
const FATOS = 10;

/**
 * A forma do registro: ficha à esquerda, corpo no meio, ações à direita.
 *
 * A mesma `GradeDeRegistro` da página, para as três colunas nascerem onde vão
 * ficar. A coluna de ações entra porque quem abre um produto quase sempre pode
 * editá-lo — sem ela o corpo nasceria largo e encolheria no primeiro dado.
 */
export default function Loading() {
  return (
    <Page variant="registro">
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando o cadastro</span>

        <div className="mb-5 flex flex-col gap-2">
          {/* Trilha, título de 24px e a linha de contexto. */}
          <Skeleton largura="8rem" altura="0.875rem" />
          <Skeleton largura="18rem" altura="1.75rem" />
          <Skeleton largura="7rem" altura="1rem" />
        </div>

        <GradeDeRegistro>
          <Card>
            <CardHeader>
              <Skeleton largura="4rem" altura="1rem" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {Array.from({ length: FATOS }, (_, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <Skeleton largura="6rem" altura="0.8125rem" />
                    <Skeleton largura="9rem" altura="0.875rem" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton largura="11rem" altura="1rem" />
            </CardHeader>
            <CardContent>
              <SkeletonForm campos={6} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton largura="5rem" altura="1rem" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Skeleton altura="2.5rem" />
                <Skeleton altura="2.375rem" raio="control" />
              </div>
            </CardContent>
          </Card>
        </GradeDeRegistro>
      </div>
    </Page>
  );
}
