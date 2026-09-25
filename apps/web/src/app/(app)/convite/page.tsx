import { Ban, Building2, CheckCircle2, MailCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { invitationsOf } from '@/lib/auth/invitations';
import { requireAccess } from '@/lib/auth/require';

import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Convite' };

/**
 * Onde o convite vira acesso.
 *
 * Quem chega aqui foi negado por `membership-inactive`, e esse motivo junta
 * dois casos: o convite ainda não aceito e o acesso suspenso. A tela separa os
 * dois, porque um se resolve com um clique e o outro, não — oferecer "aceitar"
 * a quem foi suspenso seria um botão que só serve para dar erro.
 *
 * Aceitar é `accept_invitation()`, no banco. O RLS nega a escrita a quem ainda
 * não é membro — que é quem está nesta página —, e a função existe para isso:
 * ela ativa **o vínculo de quem chama**, e nenhum outro.
 */
export default async function ConvitePage() {
  const { choice, options } = await requireAccess('/convite');
  const atual = choice.kind === 'resolved' ? choice.tenant.id : null;
  const { pendentes, suspensos } = invitationsOf(options, atual);

  if (pendentes.length === 0 && suspensos.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-success-soft">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            </div>
            <CardTitle className="text-xl">Nenhum convite pendente</CardTitle>
            <CardDescription>
              Seus acessos já estão ativos — ou o convite foi aceito em outra aba.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/painel" className={buttonVariants({ variant: 'outline' })}>
              Ir para a visão geral
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
      {pendentes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-accent-soft">
              <MailCheck className="size-5 text-content-accent" aria-hidden />
            </div>
            <h1 className="font-display text-xl font-bold text-content">
              {pendentes.length === 1 ? 'Um convite para você' : 'Convites para você'}
            </h1>
            <CardDescription>
              Ao aceitar, você entra na empresa com o papel que quem administra a conta escolheu.
              Até lá, nenhum dado dela fica disponível — isso é do banco, não da tela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
              {pendentes.map((empresa) => (
                <li
                  key={empresa.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                      <Building2 className="size-4 text-content-muted" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-content">{empresa.name}</p>
                      {empresa.status === 'provisioning' && (
                        <p className="text-xs text-content-muted">
                          Ainda em preparo — você entra e espera lá dentro.
                        </p>
                      )}
                    </div>
                  </div>
                  <AcceptForm tenantId={empresa.id} empresa={empresa.name} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-content-muted">
              Não reconhece uma empresa desta lista? Não aceite. Nada acontece enquanto o convite
              estiver pendente.
            </p>
          </CardContent>
        </Card>
      )}

      {suspensos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-warning-soft">
              <Ban className="size-5 text-warning" aria-hidden />
            </div>
            {pendentes.length === 0 ? (
              <h1 className="font-display text-xl font-bold text-content">Acesso suspenso</h1>
            ) : (
              <CardTitle>Acesso suspenso</CardTitle>
            )}
            <CardDescription>
              Quem administra a conta suspendeu seu acesso. Só essa pessoa pode reativar — não há o
              que aceitar aqui.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm text-content-default">
              {suspensos.map((empresa) => (
                <li key={empresa.id} className="flex items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-content-subtle" aria-hidden />
                  <span className="truncate">{empresa.name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
