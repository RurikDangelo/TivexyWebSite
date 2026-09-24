import { MailCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/auth/require';

import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Convite pendente' };

/*
 * Vínculo existe e está `invited` — a pessoa foi convidada e o acesso ainda não
 * foi ativado.
 *
 * **Agora há botão.** Até 24/09/2026 não havia, e a ausência era deliberada:
 * ativar o vínculo é escrita em `tenant_users`, e o RLS nega essa escrita a
 * quem ainda não é membro ativo — que é exatamente quem está nesta tela. Um
 * botão que parecesse aceitar e falhasse seria pior do que dizer a verdade.
 *
 * O que mudou não foi a tela: foi `accept_invite()` passar a existir no banco.
 * Ela é `SECURITY DEFINER`, estreita, e confere quatro coisas antes de
 * escrever — entre elas que o convite é de quem está chamando. Ver a migration
 * `20260924010000_core_accept_invite.sql`.
 */
export default async function ConvitePage() {
  const { choice } = await requireSession();
  const empresa = choice.kind === 'resolved' ? choice.tenant : null;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-warning-soft">
            <MailCheck className="size-5 text-warning" aria-hidden />
          </div>
          <CardTitle className="text-xl">Convite pendente</CardTitle>
          <CardDescription>
            {empresa === null
              ? 'Seu acesso ainda não foi ativado. Aceite para entrar.'
              : `Você foi convidado para ${empresa.name}. Aceite para entrar.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AcceptForm empresa={empresa?.name ?? null} />

          <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-content-muted">
            Enquanto o convite estiver pendente, nenhum dado da empresa fica disponível. Isso é do
            banco, não da tela.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
