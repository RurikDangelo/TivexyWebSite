'use client';

import { Loader2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

import { aceitarConvite } from './actions';
import { CONVITE_INICIAL } from './state';

function Entrar({ empresa }: { empresa: string | null }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Entrando…
        </>
      ) : empresa === null ? (
        'Aceitar convite'
      ) : (
        `Entrar em ${empresa}`
      )}
    </Button>
  );
}

/**
 * O botão que ativa o vínculo.
 *
 * Existe desde 24/09/2026. Até então esta tela dizia a verdade e não oferecia
 * botão nenhum — o RLS nega a escrita a quem ainda não é membro ativo, e um
 * botão que parecesse aceitar e falhasse seria pior do que a explicação.
 *
 * O que mudou não foi a tela: foi `accept_invite()` passar a existir no banco.
 */
export function AcceptForm({ empresa }: { empresa: string | null }) {
  const [estado, acao] = useActionState(aceitarConvite, CONVITE_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-3">
      {estado.erro !== null && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}
      <Entrar empresa={empresa} />
    </form>
  );
}
