import { ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { REASON_PARAM, denialCopy, parseDenialReason } from '@/lib/auth/denial';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Acesso negado' };

/*
 * Para onde a guarda manda quem foi negado sem ter para onde ir — falta de
 * permissão e módulo não contratado. Os outros motivos têm destino próprio
 * (login, convite, onboarding, preparando) e não passam por aqui.
 *
 * O motivo chega pela URL e é digitável: qualquer pessoa pode trocar
 * `?motivo=` por outro valor. Isso não muda acesso nenhum — a guarda já negou,
 * e o RLS negaria de novo. Muda só qual texto aparece, e `parseDenialReason`
 * garante que valor desconhecido vire um padrão em vez de quebrar a página.
 */
export default async function AcessoNegadoPage({ searchParams }: PageProps<'/acesso-negado'>) {
  const params = await searchParams;
  const bruto = params[REASON_PARAM];
  const { title, description, nextStep } = denialCopy(
    parseDenialReason(Array.isArray(bruto) ? bruto[0] : bruto),
  );

  return (
    // `<main>` não tem padding: cada página dá o seu. Sem `px-6` o texto
    // encosta nas bordas a 375px.
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
        <ShieldX className="size-6 text-content-subtle" aria-hidden />
      </div>

      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-content">{title}</h1>
        <p className="text-content-muted">{description}</p>
      </div>

      <p className="rounded-md bg-surface-subtle px-4 py-3 text-sm text-content-muted">
        {nextStep}
      </p>

      <Link
        href="/painel"
        className={cn(buttonVariants({ variant: 'outline' }))}
        aria-label="Voltar para a visão geral"
      >
        Voltar para a visão geral
      </Link>
    </div>
  );
}
