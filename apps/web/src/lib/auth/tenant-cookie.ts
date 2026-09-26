import 'server-only';

import { cookies } from 'next/headers';

import { TENANT_COOKIE } from './active-tenant.ts';

/**
 * Lembra a empresa escolhida, para a próxima requisição resolver por ela.
 *
 * O cookie guarda só o slug, que é público. Quem decide o que ele alcança é
 * `my_tenants()`, consultada a cada requisição: um cookie adulterado aponta,
 * no máximo, para uma empresa que a pessoa já podia abrir.
 *
 * Um lugar só, porque são dois os caminhos que escolhem empresa — trocar e
 * aceitar convite — e o cookie precisa sair igual dos dois.
 */
export async function lembrarEmpresa(slug: string): Promise<void> {
  const biscoitos = await cookies();
  biscoitos.set(TENANT_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    /* Um ano. É preferência de navegação, não credencial — não precisa vencer junto com a sessão. */
    maxAge: 60 * 60 * 24 * 365,
  });
}
