'use client';

import { useActionState } from 'react';

import { Input, Label } from '@/components/ui/input';

import { definirSenha } from '../actions';
import { ESTADO_INICIAL } from '../form-state';
import { Enviar, Erro } from '../form-parts';

/**
 * A senha nova, depois do link de recuperação ou do convite.
 *
 * `autoComplete="new-password"` nos dois campos: é o que faz o gerenciador
 * oferecer uma senha gerada em vez de repetir a antiga.
 *
 * O mínimo de 8 caracteres é conferido de novo no servidor. Checar só aqui
 * seria checar no lado que a pessoa controla.
 */
export function PasswordForm() {
  const [estado, acao] = useActionState(definirSenha, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erro !== null && <Erro>{estado.erro}</Erro>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha">Senha nova</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
        <p className="text-xs text-content-subtle">Ao menos 8 caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmacao">Repita a senha</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <Enviar pendente="Gravando…">Salvar e entrar</Enviar>
    </form>
  );
}
