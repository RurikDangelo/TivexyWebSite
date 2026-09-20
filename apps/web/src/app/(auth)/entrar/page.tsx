import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { parseReturnTo } from '@/lib/auth/guard';
import { readSupabaseConfig } from '@/lib/env';

import { Erro } from '../form-parts';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

/*
 * A porta de entrada. Pública em `routes.ts` — e precisa ser, senão a guarda
 * mandaria para cá quem não tem sessão e negaria de novo ao chegar.
 *
 * Quando falta configuração, a tela diz isso em vez de mostrar um formulário
 * que não tem como funcionar. É o caso de um deploy com variável faltando: o
 * formulário responderia "e-mail ou senha incorretos" a uma senha correta.
 */
export default async function EntrarPage({ searchParams }: PageProps<'/entrar'>) {
  const params = await searchParams;
  const bruto = params.proxima;
  const proxima = parseReturnTo(Array.isArray(bruto) ? bruto[0] : bruto);
  const estado = readSupabaseConfig();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Entrar na Tivexy</CardTitle>
        <CardDescription>
          Use o e-mail da sua empresa. O acesso é criado por quem administra a conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {estado.configured ? (
          <LoginForm proxima={proxima} />
        ) : (
          <Erro>
            {`Esta instalação ainda não está ligada ao banco: falta ${estado.missing.join(', ')}. ` +
              'Enquanto isso, não há como entrar.'}
          </Erro>
        )}
      </CardContent>
    </Card>
  );
}
