import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/auth/require';

import { trocarEmpresa } from '../actions';

export const metadata: Metadata = { title: 'Escolher empresa' };

/*
 * Para quem participa de mais de uma empresa — contador, franqueado, sócio de
 * dois negócios. Sem esta tela, `requireAccess()` mandaria essa pessoa para o
 * onboarding, que diz "sua conta não está ligada a nenhuma empresa": falso, e
 * desnorteante justamente para quem tem mais acesso, não menos.
 *
 * Convite pendente aparece na lista, e de propósito: é por aqui que a pessoa
 * chega à empresa que a convidou. O que ela encontra ao entrar é a tela de
 * convite, não os dados — quem garante isso é o vínculo `invited`, no banco.
 */
export default async function EmpresasPage() {
  const { options, choice } = await requireSession();
  const ativa = choice.kind === 'resolved' ? choice.tenant.id : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content">Escolha a empresa</h1>
        <p className="mt-1 text-content-muted">
          Você participa de {options.length} empresas. Pode trocar a qualquer momento pelo menu do
          topo.
        </p>
      </header>

      {options.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma empresa ainda</CardTitle>
            <CardDescription>
              Sua conta existe, mas ainda não está ligada a nenhuma empresa.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((empresa) => (
            <li key={empresa.id}>
              <form action={trocarEmpresa}>
                <input type="hidden" name="slug" value={empresa.slug} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                    <Building2 className="size-4 text-content-subtle" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-content">{empresa.name}</span>
                    <span className="block truncate font-mono text-xs text-content-subtle">
                      {empresa.slug}
                    </span>
                  </span>
                  {empresa.membership === 'invited' && <Badge tone="warning">Convite</Badge>}
                  {empresa.id === ativa && <Badge tone="brand">Atual</Badge>}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
