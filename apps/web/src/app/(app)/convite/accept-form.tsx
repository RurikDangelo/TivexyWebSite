'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

import { aceitarConvite } from './actions';
import { ACEITE_INICIAL } from './state';

function Aceitar({ empresa }: { empresa: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Aceitando…
        </>
      ) : (
        <>
          Aceitar e entrar
          <span className="sr-only"> em {empresa}</span>
        </>
      )}
    </Button>
  );
}

/**
 * Um botão por convite, e o erro dele logo abaixo.
 *
 * Cada convite tem o seu formulário — e o seu estado — para que o erro de um
 * não apareça embaixo do outro quando a pessoa tem dois convites na tela.
 */
export function AcceptForm({ tenantId, empresa }: { tenantId: string; empresa: string }) {
  const [estado, acao] = useActionState(aceitarConvite, ACEITE_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="tenant" value={tenantId} />
      <Aceitar empresa={empresa} />
      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}
    </form>
  );
}
