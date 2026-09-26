import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError, FormWarning } from '@/components/form/messages';
import { parseReturnTo } from '@/lib/auth/guard';
import { readSupabaseConfig } from '@/lib/env';

import { AuthCard } from '../auth-card';
import { PARAM_MOTIVO, explicarMotivo } from '../motivos';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

/*
 * A porta de entrada. Pública em `routes.ts` — e precisa ser, senão a guarda
 * mandaria para cá quem não tem sessão e negaria de novo ao chegar.
 *
 * Quando falta configuração, a tela diz isso em vez de mostrar um formulário
 * que não tem como funcionar. É o caso de um deploy com variável faltando: o
 * formulário responderia "e-mail ou senha incorretos" a uma senha correta.
 *
 * O `?motivo=` é a outra metade de `app/auth/callback/route.ts`. Quem clicava
 * num convite vencido caía aqui sem uma palavra de explicação e concluía que a
 * senha estava errada — a frase certa existia em `/definir-senha` e era
 * inalcançável por este caminho. Agora o callback nomeia a falha e ela chega.
 */
export default async function EntrarPage({ searchParams }: PageProps<'/entrar'>) {
  const params = await searchParams;
  const bruto = params.proxima;
  const proxima = parseReturnTo(Array.isArray(bruto) ? bruto[0] : bruto);
  const motivo = explicarMotivo(params[PARAM_MOTIVO]);
  const estado = readSupabaseConfig();

  return (
    <AuthCard
      titulo="Entrar na Tivexy"
      descricao="Use o e-mail da sua empresa. O acesso é criado por quem administra a conta."
    >
      {motivo !== null && (
        /*
         * Aviso, não erro: nada do que a pessoa digitou está errado — o link é
         * que não serve mais. Pintar de vermelho antes do primeiro campo faria
         * a tela abrir acusando quem acabou de chegar.
         */
        <div className="flex flex-col gap-2">
          <FormWarning>{motivo.texto}</FormWarning>
          {motivo.acao !== undefined && (
            <Link
              href={motivo.acao.href}
              className="text-label text-content-accent underline-offset-4 hover:underline"
            >
              {motivo.acao.rotulo}
            </Link>
          )}
        </div>
      )}

      {estado.configured ? (
        <LoginForm proxima={proxima} />
      ) : (
        <FormError>
          {`Esta instalação ainda não está ligada ao banco: falta ${estado.missing.join(', ')}. ` +
            'Enquanto isso, não há como entrar.'}
        </FormError>
      )}
    </AuthCard>
  );
}
