'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Input, Label } from '@/components/ui/input';

import { entrar } from '../actions';
import { ESTADO_INICIAL } from '../form-state';
import { Enviar, Erro } from '../form-parts';

/**
 * O formulário de entrada.
 *
 * `proxima` viaja num campo escondido, e não só na URL: o navegador reenvia o
 * formulário, não a query, quando a ação devolve erro. Sem o campo, errar a
 * senha uma vez perderia o destino e jogaria a pessoa no painel em vez de na
 * página que ela tentou abrir.
 *
 * `autoComplete` nos dois campos porque gerenciador de senha é a defesa real
 * contra senha fraca e reaproveitada — atrapalhá-lo piora a segurança, não
 * melhora.
 */
export function LoginForm({ proxima }: { proxima: string | null }) {
  const [estado, acao] = useActionState(entrar, ESTADO_INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {proxima !== null && <input type="hidden" name="proxima" value={proxima} />}

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
          aria-invalid={estado.erro !== null}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="senha">Senha</Label>
          <Link
            href="/recuperar"
            className="text-xs text-content-accent underline-offset-4 hover:underline"
          >
            Esqueci a senha
          </Link>
        </div>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={estado.erro !== null}
        />
      </div>

      <Enviar pendente="Entrando…">Entrar</Enviar>
    </form>
  );
}
