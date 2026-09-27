import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';

/**
 * O esqueleto com a forma do que vai chegar: a mesma variante de largura, a
 * mesma faixa de três indicadores e a mesma grade de cartões da página real.
 *
 * Seis cartões, e não sete: a última fila da grade de três colunas costuma
 * ficar incompleta de qualquer jeito, e prometer a sétima caixa alongaria o
 * esqueleto além do conteúdo em 1920px.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy className="flex flex-col gap-6">
        <span className="sr-only">Carregando as integrações</span>

        {/* Mesmas medidas do `PageHeader`: título de 24px, descrição de 16px, `mb-5`. */}
        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="14rem" altura="1.5rem" />
          <Skeleton largura="min(44rem, 100%)" altura="1rem" />
        </div>

        <StatGrid colunas={3}>
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </StatGrid>

        <div className="flex flex-col gap-3">
          {/* Altura do `--text-h2`, que é o título da seção que vai chegar aqui. */}
          <Skeleton largura="16rem" altura="1.125rem" />
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <CartaoEmEspera key={i} />
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

/** A forma do `IntegrationCard`: cabeçalho com selo, faixa de contexto e duas colunas. */
function CartaoEmEspera() {
  return (
    <Card>
      <CardHeader>
        <Skeleton largura="9rem" altura="1rem" />
        <Skeleton largura="min(18rem, 100%)" altura="0.8125rem" />
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Skeleton largura="10rem" altura="1.25rem" raio="pill" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton largura="11rem" altura="0.8125rem" />
        <Skeleton altura="3rem" raio="control" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((coluna) => (
            <div key={coluna} className="flex flex-col gap-1.5">
              <Skeleton largura="8rem" altura="0.6875rem" />
              <Skeleton largura="90%" />
              <Skeleton largura="70%" />
              <Skeleton largura="80%" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
