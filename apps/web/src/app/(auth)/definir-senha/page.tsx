import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { currentSession } from '@/lib/auth/session';

import { Erro } from '../form-parts';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Definir senha' };

/*
 * Chega-se aqui pelo link do e-mail, que passa antes por `/auth/callback` e sai
 * de lá com sessão. Sem sessão não há o que gravar — e mostrar o formulário
 * assim mesmo terminaria num erro depois de a pessoa digitar duas vezes.
 *
 * A rota é pública em `routes.ts`, junto de `/recuperar`: quem vem do link tem
 * sessão, mas quem chega com o link vencido não tem, e precisa ler o motivo em
 * vez de ser mandado para o login sem explicação.
 */
export default async function DefinirSenhaPage() {
  const { email } = await currentSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Escolha uma senha</CardTitle>
        <CardDescription>
          {email === null ? 'Este link não vale mais.' : `Você está definindo a senha de ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {email === null ? (
          <div className="flex flex-col gap-4">
            <Erro>O link expirou ou já foi usado. Peça uma nova recuperação para continuar.</Erro>
            <Link
              href="/recuperar"
              className="text-sm text-content-accent underline-offset-4 hover:underline"
            >
              Pedir novo link
            </Link>
          </div>
        ) : (
          <PasswordForm />
        )}
      </CardContent>
    </Card>
  );
}
