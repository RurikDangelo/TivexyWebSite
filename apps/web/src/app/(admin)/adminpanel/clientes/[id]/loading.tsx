import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonForm } from '@/components/ui/skeleton';

/*
 * A forma da tela de um cliente: trilha, título, faixa de fatos e cinco
 * cartões empilhados. Os dois últimos — provisionamentos e decisões — são
 * listas, não formulários, e por isso o esqueleto deles é de linhas.
 */

/* Três campos no cartão de Dados; um controle em Situação e um em Plano. */
const CAMPOS_POR_CARTAO = [1, 1, 3] as const;

export default function Loading() {
  return (
    <Page variant="ajuste">
      <div aria-busy className="flex flex-col gap-4">
        <span className="sr-only" role="status">
          Carregando o cliente
        </span>

        <div className="mb-1 flex flex-col gap-2">
          <Skeleton largura="6rem" altura="0.875rem" />
          <Skeleton largura="16rem" altura="1.5rem" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton largura="5rem" altura="1.25rem" raio="pill" />
            <Skeleton largura="7rem" altura="1.25rem" raio="pill" />
            <Skeleton largura="11rem" altura="1rem" />
          </div>
        </div>

        {CAMPOS_POR_CARTAO.map((campos, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton largura="9rem" altura="1rem" />
            </CardHeader>
            <CardContent>
              <SkeletonForm campos={campos} />
            </CardContent>
          </Card>
        ))}

        {[0, 1].map((i) => (
          <Card key={`lista-${i}`}>
            <CardHeader>
              <Skeleton largura="12rem" altura="1rem" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, linha) => (
                <Skeleton key={linha} altura="1.75rem" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  );
}
