'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Input, Label } from '@/components/ui/input';

import { recuperar } from '../actions';
import { ESTADO_INICIAL } from '../form-state';
import { Aviso, Enviar, Erro } from '../form-parts';

/**
 * Pedido de recuperação de senha.
 *
 * O endereço de retorno do e-mail **não** vem daqui. Ele é montado no servidor,
 * a partir do host da requisição: o mesmo código roda em localhost, em preview
 * da Vercel e em produção, e um link apontando para o ambiente errado leva a
 * pessoa a uma sessão que não é a dela.
 *
 * Mandar a origem num campo escondido funcionaria, e seria pior — um valor a
 * mais vindo do navegador, para responder uma pergunta que o servidor já sabe.
 */
export function RecoverForm() {
  const [estado, acao] = useActionState(recuperar, ESTADO_INICIAL);
  if (estado.aviso !== undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso>{estado.aviso}</Aviso>
        <Link
          href="/entrar"
          className="text-sm text-content-accent underline-offset-4 hover:underline"
        >
          Voltar para a entrada
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erro !== null && <Erro>{estado.erro}</Erro>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="voce@empresa.com.br"
        />
      </div>

      <Enviar pendente="Enviando…">Enviar link de recuperação</Enviar>

      <Link
        href="/entrar"
        className="text-center text-sm text-content-muted underline-offset-4 hover:underline"
      >
        Lembrei a senha
      </Link>
    </form>
  );
}
