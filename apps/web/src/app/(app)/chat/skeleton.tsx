import { Skeleton } from '@/components/ui/skeleton';

/**
 * O esqueleto da conversa, com a forma do que vem.
 *
 * Mora fora dos `loading.tsx` porque são dois — o de `/chat` e o de
 * `/chat/[canal]` —, e duas cópias do mesmo desenho divergem no primeiro
 * ajuste. Os dois renderizam **dentro** do `<section>` do layout, então este
 * componente não desenha moldura nem fundo: eles já existem em volta.
 *
 * As alturas espelham as reais — cabeçalho de `py-3`, blocos com avatar de
 * 32px, campo de `min-h-20` — para que nada salte de lugar quando o conteúdo
 * chegar. Um esqueleto com a forma errada é pior que nenhum: ele promete uma
 * tela e entrega outra.
 */

/* Larguras fixas, em ciclo: `Math.random()` daria hidratação divergente. */
const LARGURAS = ['62%', '41%', '78%', '35%', '55%', '70%'] as const;
/* Quantas linhas cada bloco de fala tem. A conversa real também é irregular. */
const LINHAS_POR_BLOCO = [2, 1, 3, 1, 2] as const;

export function EsqueletoDaConversa() {
  return (
    <div aria-busy className="flex min-h-0 flex-1 flex-col">
      <span role="status" className="sr-only">
        Carregando a conversa
      </span>

      <div className="flex shrink-0 items-center gap-3 border-b border-line-subtle px-4 py-3">
        <Skeleton largura="1rem" altura="1rem" raio="pill" />
        <div className="flex flex-col gap-1.5">
          <Skeleton largura="9rem" altura="1.125rem" />
          <Skeleton largura="14rem" altura="0.8125rem" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden px-3 py-3">
        {LINHAS_POR_BLOCO.map((linhas, bloco) => (
          <div key={bloco} className="flex gap-2.5">
            <Skeleton largura="2rem" altura="2rem" raio="pill" className="mt-1" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton largura="7rem" altura="0.875rem" />
              {Array.from({ length: linhas }, (_, i) => (
                <Skeleton key={i} largura={LARGURAS[(bloco + i) % LARGURAS.length]} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line-subtle p-3">
        <div className="flex items-end gap-2">
          <Skeleton altura="5rem" className="flex-1" />
          <Skeleton largura="2.375rem" altura="2.375rem" />
        </div>
        <Skeleton largura="18rem" altura="0.8125rem" className="mt-1.5" />
      </div>
    </div>
  );
}
