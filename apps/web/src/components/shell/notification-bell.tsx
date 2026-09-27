import { Bell } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * O sino: quantos avisos esperam, e o caminho até eles.
 *
 * O número vem do banco a cada página carregada — não há tempo real. O rótulo
 * diz o número por extenso para o leitor de tela; o selo é só visual.
 *
 * **Três estados, não dois.** `null` é "não deu para contar" e vira sino sem
 * número; `0` é "está tudo lido" e também vira sino sem número, mas o rótulo
 * diz isso com todas as letras. Desenhar um `0` no selo seria a terceira
 * coisa: um selo é uma reivindicação de atenção, e zero não reivindica nada.
 */
export function NotificationBell({
  naoLidos,
  className,
}: {
  naoLidos: number | null;
  /** Para quem posiciona o sino — hoje o rodapé da sidebar. */
  className?: string;
}) {
  const rotulo =
    naoLidos === null
      ? 'Avisos'
      : naoLidos === 0
        ? 'Avisos: nenhum não lido'
        : `Avisos: ${naoLidos.toLocaleString('pt-BR')} ${naoLidos === 1 ? 'não lido' : 'não lidos'}`;

  return (
    <Link
      href="/avisos"
      aria-label={rotulo}
      /*
       * Sem `title=`: ele repetia palavra por palavra o `aria-label`, e um
       * `<Tooltip>` aqui faria o mesmo por outro caminho — `aria-describedby`
       * com a frase que o nome do link já diz, anunciada duas vezes. O que
       * importa reforçar (a contagem) já está no nome.
       */
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative', className)}
    >
      <Bell aria-hidden />
      {naoLidos !== null && naoLidos > 0 && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center',
            /*
             * `text-white` dava 2,2:1 sobre o vermelho claro do tema escuro —
             * num selo que existe só para ser lido. `--content-on-danger`
             * escurece junto com o preenchimento.
             *
             * Sem `animate-enter`: o selo é renderizado no servidor a cada
             * navegação, e reanimá-lo em toda tela seria um terceiro evento de
             * entrada disputando com o da lista (seção 8, regra 1). O número
             * chega junto com a página, como o resto do chrome.
             */
            'rounded-pill bg-danger px-1 text-micro text-content-on-danger tabular-nums',
          )}
        >
          {naoLidos > 99 ? '99+' : naoLidos}
        </span>
      )}
    </Link>
  );
}
