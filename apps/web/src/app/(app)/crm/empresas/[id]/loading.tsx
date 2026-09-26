import { GradeDeRegistro, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';

/** Quantos fatos a coluna da esquerda mostra: razão social, documento, site, e-mail, telefone, responsável, cadastro. */
const FATOS = 7;

/**
 * O que a tela de uma conta mostra enquanto lê.
 *
 * Mesma variante (`registro`), mesma grade de três colunas e a mesma faixa de
 * três indicadores: quando o dado chega, nada muda de lugar.
 *
 * A faixa aparece no esqueleto mesmo que a conta acabe não tendo negócio
 * nenhum — é o único jeito de não mover a página no caso comum, e a diferença
 * é de milissegundos. Nenhum número é desenhado: barra cinza não é dado.
 */
export default function Loading() {
  return (
    <Page variant="registro">
      <div role="status" aria-busy>
        <span className="sr-only">Carregando o cadastro</span>

        {/* Trilha, título e a linha de contexto do `PageHeader`. */}
        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="9rem" altura="1.125rem" />
          <Skeleton largura="20rem" altura="1.5rem" />
          <Skeleton largura="13rem" altura="1rem" />
        </div>

        <StatGrid colunas={3} className="mb-6">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </StatGrid>

        <GradeDeRegistro>
          <Card className="h-fit">
            <CardHeader>
              <Skeleton largura="10rem" altura="1rem" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {Array.from({ length: FATOS }, (_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton largura="6rem" altura="0.8125rem" />
                  <Skeleton largura="11rem" altura="0.875rem" />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-6">
            <CartaoDeLista linhas={4} />
            <CartaoDeLista linhas={5} />
          </div>

          <Card className="h-fit">
            <CardHeader>
              <Skeleton largura="5rem" altura="1rem" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton />
              <Skeleton />
              <Skeleton largura="70%" />
            </CardContent>
          </Card>
        </GradeDeRegistro>
      </div>
    </Page>
  );
}

/**
 * Um cartão com tabela embutida — pessoas e negócios têm a mesma forma.
 *
 * As linhas não usam `SkeletonRow` porque aqui não há `<table>`: montar uma só
 * para o esqueleto exigiria repetir os cabeçalhos, que ainda não são conhecidos
 * (o vocabulário da empresa é lido junto com o dado). A altura é a mesma da
 * densidade `densa` (36px).
 */
function CartaoDeLista({ linhas }: { linhas: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton largura="8rem" altura="1rem" />
      </CardHeader>
      <div className="border-t border-line-subtle">
        {Array.from({ length: linhas }, (_, i) => (
          <div
            key={i}
            className="flex h-9 items-center gap-3 border-b border-line-subtle px-3 last:border-b-0"
          >
            <Skeleton largura="1.5rem" altura="1.5rem" raio="pill" />
            <Skeleton className="min-w-0 flex-1" />
            <Skeleton largura="5rem" />
          </div>
        ))}
      </div>
    </Card>
  );
}
