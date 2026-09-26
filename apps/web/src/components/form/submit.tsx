'use client';

import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * O botão que sabe que está enviando.
 *
 * Sem isto, um clique duplo manda o formulário duas vezes — e duas vendas
 * iguais no caixa são o tipo de erro que só aparece no fechamento.
 */
export function Submit({
  children,
  pendente = 'Salvando…',
  ...props
}: Omit<ButtonProps, 'type'> & { pendente?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendente}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
