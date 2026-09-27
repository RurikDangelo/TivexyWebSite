import { GradeDePainel, Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonChart, SkeletonRow, SkeletonStat } from '@/components/ui/skeleton';
import { StatGrid } from '@/components/ui/stat';
import { TBody, Table } from '@/components/ui/table';

/**
 * O que a tela mostra enquanto o financeiro carrega.
 *
 * Tem a forma da aba **Visão**, e não uma silhueta genérica, por um motivo
 * concreto: trocar `?aba=` não remonta o segmento de rota, então este esqueleto
 * só aparece na chegada à tela — e a chegada é sempre em `/erp/financeiro`, que
 * é a Visão. As abas de lista trocam de conteúdo sem passar por aqui.
 *
 * Mesma `<Page variant>` da rota, mesma faixa de quatro indicadores, mesma
 * grade de dois cartões: é isso que impede o salto de largura e de altura
 * quando os números chegam.
 */
export default function Loading() {
  return (
    <Page variant="operacao">
      <div role="status" aria-busy="true">
        <span className="sr-only">Carregando o financeiro</span>

        {/* Cabeçalho: `text-h1` (24px) e a linha de contexto em `text-body-lg`. */}
        <div className="mb-5 flex flex-col gap-2">
          <Skeleton largura="14rem" altura="1.5rem" />
          <Skeleton largura="28rem" altura="1rem" className="max-w-full" />
        </div>

        {/* As três abas, com a linha de base que elas dividem. */}
        <div className="mb-6 flex gap-2 border-b border-line-subtle pb-2.5">
          <Skeleton largura="4rem" />
          <Skeleton largura="5.5rem" />
          <Skeleton largura="4.5rem" />
        </div>

        <div className="flex flex-col gap-6">
          <StatGrid colunas={4}>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </StatGrid>

          <GradeDePainel>
            <Card>
              <CardHeader>
                <Skeleton largura="9rem" altura="1rem" />
                <Skeleton largura="13rem" altura="0.8125rem" />
              </CardHeader>
              <CardContent>
                {/* 260px é a altura que o `ChartFrame` do fluxo recebe. */}
                <SkeletonChart altura={260} barras={9} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton largura="12rem" altura="1rem" />
                <Skeleton largura="15rem" altura="0.8125rem" />
              </CardHeader>
              <CardContent>
                <Table densidade="densa" moldura="nenhuma">
                  <TBody>
                    {Array.from({ length: 5 }, (_, i) => (
                      <SkeletonRow key={i} colunas={3} densidade="densa" />
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </GradeDePainel>
        </div>
      </div>
    </Page>
  );
}
