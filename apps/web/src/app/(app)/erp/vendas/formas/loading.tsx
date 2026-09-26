import { Page } from '@/components/page/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton, SkeletonForm } from '@/components/ui/skeleton';

/** Quantas linhas caber antes de virar rolagem — uma empresa raramente passa disso. */
const LINHAS = 4;

/**
 * O esqueleto das formas de pagamento.
 *
 * A tela tem duas caras — tabela para quem consulta, formulário por linha para
 * quem administra — e o esqueleto não sabe qual das duas vai chegar, porque a
 * permissão só é resolvida no servidor. Ele desenha a mais alta das duas, a de
 * edição: prometer menos e entregar mais empurra a tela; o contrário só deixa
 * um vão que fecha.
 */
export default function FormasLoading() {
  return (
    <Page variant="operacao">
      <div className="mb-5 flex flex-col gap-2">
        <Skeleton largura="7rem" altura="0.875rem" />
        <Skeleton largura="15rem" altura="1.5rem" />
        <Skeleton largura="26rem" altura="1rem" />
      </div>

      <div className="flex flex-col gap-5">
        <div className="overflow-clip rounded-card border border-line-subtle bg-surface-panel shadow-card">
          {Array.from({ length: LINHAS }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 border-b border-line-subtle p-4 last:border-b-0"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem]">
                {['14rem', '8rem', '5rem'].map((largura) => (
                  <div key={largura} className="flex flex-col gap-1.5">
                    <Skeleton largura={largura} altura="0.875rem" />
                    <Skeleton altura="2.375rem" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <Skeleton largura="7rem" altura="1.25rem" raio="pill" />
                <Skeleton largura="11rem" altura="0.8125rem" />
              </div>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton largura="7rem" altura="1rem" />
          </CardHeader>
          <CardContent>
            <SkeletonForm campos={3} />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
