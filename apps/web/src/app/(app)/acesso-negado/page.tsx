import type { DenialReason } from '@tivexy/core';
import { Building2, CircleSlash, Lock, PackageX, ShieldX, TimerOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Page } from '@/components/page/page';
import { buttonVariants } from '@/components/ui/button';
import { REASON_PARAM, denialCopy, parseDenialReason } from '@/lib/auth/denial';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Acesso negado' };

/*
 * Um símbolo por motivo, e não um cadeado para tudo.
 *
 * `Record` completo: motivo novo em `DENIAL_REASONS` não compila sem símbolo,
 * pela mesma razão que `denialCopy` é um `Record` completo — a lista de motivos
 * é o contrato, e esquecer um deles é como o texto genérico nasce de volta.
 *
 * Isto também é a regra "cor nunca sozinha": o círculo não muda de cor entre os
 * motivos, quem distingue é o símbolo somado ao título.
 */
const SIMBOLO: Record<DenialReason, LucideIcon> = {
  unauthenticated: TimerOff,
  'no-tenant': Building2,
  'membership-inactive': Lock,
  'tenant-not-operational': CircleSlash,
  'module-disabled': PackageX,
  'missing-permission': ShieldX,
};

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
  const motivo = parseDenialReason(Array.isArray(bruto) ? bruto[0] : bruto);
  const { title, description, nextStep } = denialCopy(motivo);
  const Icone = SIMBOLO[motivo];

  return (
    /*
     * `intersticial` (seção 3): a largura e a centragem vertical saem do
     * `<Page>`. O teto e o respiro que moravam aqui eram literais sem dono, e o
     * gutter agora é do `<main>`.
     */
    <Page variant="intersticial">
      {/* Um evento de entrada por tela (seção 8, regra 1): anima o bloco, não os filhos. */}
      <div className="flex animate-enter flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-pill bg-surface-sunken text-content-subtle">
          <Icone className="size-7" aria-hidden />
        </span>

        <div className="flex flex-col gap-2">
          {/* `text-display`: o tamanho de título de interstício (seção 4), no lugar do literal à mão. */}
          <h1 className="text-display text-balance text-content">{title}</h1>
          <p className="text-body-lg text-pretty text-content-muted">{description}</p>
        </div>

        {/*
         * O próximo passo em superfície afundada: é instrução, não alerta. Um
         * `FormMessage` daria a ele cor de estado, e ser negado por falta de
         * permissão não é um erro que a pessoa cometeu.
         */}
        <p className="rounded-card border border-line-subtle bg-surface-sunken px-4 py-3 text-body text-pretty text-content-default">
          {nextStep}
        </p>

        {/* Sem `aria-label`: ele repetia o próprio texto do link, e o leitor de tela lia duas vezes. */}
        <Link href="/painel" className={cn(buttonVariants({ variant: 'outline' }))}>
          Voltar para a visão geral
        </Link>
      </div>
    </Page>
  );
}
