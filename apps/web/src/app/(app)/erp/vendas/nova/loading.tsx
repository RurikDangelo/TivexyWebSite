import { Page } from '@/components/page/page';
import { Skeleton, SkeletonForm } from '@/components/ui/skeleton';

/**
 * O esqueleto do balcão: duas colunas, busca em cima, fechamento à direita.
 *
 * A carga desta rota é pesada de propósito — traz o cadastro inteiro de
 * produtos para o navegador, que é o que permite buscar sem ir à rede depois.
 * Enquanto isso não chega, o que se vê é a forma do balcão, na mesma grade e
 * no mesmo ponto de quebra da página real.
 */
export default function NovaVendaLoading() {
  return (
    <Page variant="operacao">
      <div className="mb-5 flex flex-col gap-2">
        <Skeleton largura="7rem" altura="0.875rem" />
        <Skeleton largura="14rem" altura="1.5rem" />
        <Skeleton largura="22rem" altura="1rem" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton largura="4rem" altura="1.125rem" />
          {/* O campo do leitor de código de barras é `size="lg"`: 44px. */}
          <div className="flex flex-col gap-1.5">
            <Skeleton largura="9rem" altura="0.875rem" />
            <Skeleton altura="2.75rem" />
            <Skeleton largura="16rem" altura="0.8125rem" />
          </div>
          {/* O carrinho nasce vazio: o que espera aqui é a moldura do estado vazio, não linhas. */}
          <Skeleton altura="9rem" raio="card" />
        </div>

        <div className="flex flex-col gap-4 rounded-card border border-line-subtle bg-surface-panel p-4 shadow-card">
          <Skeleton largura="8rem" altura="1.125rem" />
          <SkeletonForm campos={2} />
          <div className="flex items-baseline justify-between gap-3 border-t border-line-subtle pt-3">
            <Skeleton largura="3rem" altura="0.875rem" />
            <Skeleton largura="7rem" altura="2rem" />
          </div>
          <Skeleton altura="4.5rem" raio="card" />
          <Skeleton altura="2.75rem" />
        </div>
      </div>
    </Page>
  );
}
