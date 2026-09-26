import type { Metadata } from 'next';
import { LinkIcon } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { currentSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

import { AuthCard } from '../auth-card';
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

  if (email === null) {
    /*
     * Beco sem saída com saída. As três perguntas de um estado vazio: o que
     * está vazio (não há sessão para gravar senha), por que importa (o link é
     * de uso único e tem hora) e o que fazer agora (pedir outro). A frase é a
     * mesma que estava na faixa de erro — mudou de papel, não de texto: não é
     * erro de quem digitou, é um link que venceu.
     */
    return (
      <AuthCard
        titulo="Este link não vale mais"
        descricao="O link expirou ou já foi usado. Peça uma nova recuperação para continuar."
      >
        <div className="flex flex-col items-start gap-4">
          <span className="grid size-11 place-items-center rounded-pill bg-warning-soft">
            <LinkIcon className="size-5 text-warning" aria-hidden />
          </span>
          <Link
            href="/recuperar"
            className={cn(buttonVariants({ variant: 'brand', size: 'lg' }), 'w-full')}
          >
            Pedir um link novo
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard titulo="Escolha uma senha" descricao={`Você está definindo a senha de ${email}.`}>
      <PasswordForm />
    </AuthCard>
  );
}
