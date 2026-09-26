import { Bell } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * O sino: quantos avisos esperam, e o caminho até eles.
 *
 * O número vem do banco a cada página carregada — não há tempo real. O
 * rótulo diz o número por extenso para o leitor de tela; o selo é só visual.
 */
export function NotificationBell({ naoLidos }: { naoLidos: number | null }) {
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
      title={rotulo}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')}
    >
      <Bell aria-hidden />
      {naoLidos !== null && naoLidos > 0 && (
        <span
          aria-hidden
          className="absolute top-1 right-1 flex h-4 min-w-4 animate-enter items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] leading-none font-semibold text-white tabular-nums"
        >
          {naoLidos > 99 ? '99+' : naoLidos}
        </span>
      )}
    </Link>
  );
}
