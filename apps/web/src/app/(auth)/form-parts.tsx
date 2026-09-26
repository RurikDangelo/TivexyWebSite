'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

/**
 * Peças comuns das três telas de entrada.
 *
 * `role="alert"` no erro para que o leitor de tela anuncie sem que a pessoa
 * precise procurar — quem erra a senha muitas vezes está com o foco ainda no
 * campo, e uma mensagem que aparece em silêncio não existe para quem não vê.
 */
export function Erro({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Aviso({ children }: { children: string }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-content-muted"
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * O botão que sabe que está enviando.
 *
 * Sem isto, um clique duplo manda o formulário duas vezes — e num login isso
 * conta como duas tentativas contra o limite de taxa do Supabase.
 */
export function Enviar({ children, pendente }: { children: string; pendente: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendente}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
