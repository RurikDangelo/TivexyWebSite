'use server';

/**
 * Trocar a empresa ativa.
 *
 * Server Action, e não um link: um `<a href="/empresas/acme">` que grava cookie
 * é uma mudança de estado por GET. O navegador pré-carrega link, o antivírus
 * abre link, o leitor de tela percorre link — qualquer um deles trocaria a
 * empresa da pessoa sem que ela clicasse.
 *
 * O cookie guarda só o slug, que é público. Quem decide o que ele alcança é
 * `my_tenants()`, consultada a cada requisição: um cookie adulterado aponta,
 * no máximo, para uma empresa que a pessoa já podia abrir. A conferência
 * abaixo existe para dar erro claro, não para conter acesso.
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { TENANT_COOKIE } from '@/lib/auth/active-tenant';
import { currentSession } from '@/lib/auth/session';

export async function trocarEmpresa(form: FormData): Promise<void> {
  const bruto = form.get('slug');
  const slug = typeof bruto === 'string' ? bruto.trim().toLowerCase() : '';

  const { options } = await currentSession();
  const escolhida = options.find((o) => o.slug.toLowerCase() === slug);
  if (escolhida === undefined) redirect('/empresas');

  const biscoitos = await cookies();
  biscoitos.set(TENANT_COOKIE, escolhida.slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    /* Um ano. É preferência de navegação, não credencial — não precisa vencer junto com a sessão. */
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect('/painel');
}
