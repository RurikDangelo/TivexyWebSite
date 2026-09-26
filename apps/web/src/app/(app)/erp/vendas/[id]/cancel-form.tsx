'use client';

import { Ban } from 'lucide-react';
import { useActionState } from 'react';

import { Field } from '@/components/form/field';
import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Input } from '@/components/ui/input';

import { cancelarVenda } from '../actions';
import { ACAO_INICIAL } from '../state';

/**
 * Cancelar, com motivo e confirmação.
 *
 * O texto diz o que acontece antes de acontecer: o estoque volta, o que não
 * entrou deixa de ser esperado, o que entrou vira devolução a pagar. Quem
 * cancela precisa saber que o dinheiro recebido não some sozinho.
 */
export function CancelSaleForm({ id, rotulo }: { id: string; rotulo: string }) {
  const [estado, acao] = useActionState(cancelarVenda, ACAO_INICIAL);

  return (
    <form
      action={acao}
      onSubmit={(ev) => {
        if (!window.confirm(`Cancelar ${rotulo}? Não dá para desfazer.`)) ev.preventDefault();
      }}
      className="flex flex-col gap-3 text-sm"
    >
      <input type="hidden" name="id" value={id} />
      <ul className="list-disc space-y-1 pl-5 text-content-muted">
        <li>o que saiu do estoque volta;</li>
        <li>o que ainda não entrou no caixa deixa de ser esperado;</li>
        <li>o que já entrou vira uma devolução a pagar, para registrar quando devolver.</li>
      </ul>
      <Field nome="motivo" rotulo="Motivo" obrigatorio>
        <Input id="motivo" name="motivo" required maxLength={300} placeholder="Cliente desistiu" />
      </Field>
      <Submit variant="outline" pendente="Cancelando…" className="text-danger">
        <Ban aria-hidden />
        Cancelar {rotulo}
      </Submit>
      {estado.erro !== null && <FormError>{estado.erro}</FormError>}
      {estado.ok !== null && <FormSuccess>{estado.ok}</FormSuccess>}
    </form>
  );
}
