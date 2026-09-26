'use client';

import { useFormStatus } from 'react-dom';

import { Button, type ButtonProps } from '@/components/ui/button';

export interface SubmitProps extends Omit<ButtonProps, 'type' | 'carregando'> {
  /** O rótulo enquanto o envio está em voo. */
  pendente?: string;
}

/**
 * O botão que sabe que está enviando.
 *
 * Sem isto, um clique duplo manda o formulário duas vezes — e duas vendas
 * iguais no caixa são o tipo de erro que só aparece no fechamento.
 *
 * A aparência do estado (spinner, `aria-busy`) é do `Button`, mas o
 * `useFormStatus` fica aqui e não lá: o hook só enxerga o `<form>` quando é
 * chamado de dentro dele, e o `Button` é usado solto na maior parte do app.
 * Movê-lo para o `Button` devolveria `pending` sempre falso — a trava contra o
 * duplo envio some em silêncio, sem erro de tipo e sem erro em tempo de
 * execução.
 */
export function Submit({ children, pendente = 'Salvando…', disabled, ...props }: SubmitProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" carregando={pending} disabled={pending || disabled} {...props}>
      {pending ? pendente : children}
    </Button>
  );
}
