'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';

import { aceitarConvite } from './actions';
import { ACEITE_INICIAL } from './state';

/**
 * Um botão por convite, e o erro dele logo abaixo.
 *
 * Cada convite tem o seu formulário — e o seu estado — para que o erro de um
 * não apareça embaixo do outro quando a pessoa tem dois convites na tela.
 *
 * O botão e o erro saíram daqui: `Submit` já é o `useFormStatus` com spinner e
 * `aria-busy`, e `FormError` já é a faixa vermelha do sistema. A versão à mão
 * pintava o erro com um `bg-danger-soft` próprio e reimplementava o pendente —
 * duas cópias do que os primitivos fazem.
 */
export function AcceptForm({ tenantId, empresa }: { tenantId: string; empresa: string }) {
  const [estado, acao] = useActionState(aceitarConvite, ACEITE_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="tenant" value={tenantId} />
      <Submit pendente="Aceitando…" className="w-full sm:w-auto">
        Aceitar e entrar
        {/* Com dois convites na tela, "Aceitar e entrar" sozinho não diz em qual. */}
        <span className="sr-only"> em {empresa}</span>
      </Submit>
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
    </form>
  );
}
