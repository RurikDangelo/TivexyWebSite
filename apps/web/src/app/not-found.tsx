import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandSymbol } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Página não encontrada' };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandSymbol className="h-10 text-content-subtle" />

      <div className="space-y-2">
        <p className="font-mono text-sm tracking-wider text-content-subtle">404</p>
        <h1 className="font-display text-2xl font-bold text-content">Página não encontrada</h1>
        <p className="max-w-prose text-content-muted">
          O endereço não existe, ou foi movido. Se você chegou por um link de dentro da plataforma,
          vale avisar — link quebrado interno é defeito, não engano de quem clicou.
        </p>
      </div>

      <Link href="/painel" className={cn(buttonVariants({ variant: 'brand' }))}>
        Voltar para a visão geral
      </Link>
    </div>
  );
}
