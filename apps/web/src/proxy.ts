/**
 * O proxy: renova a sessão e tira do caminho quem não tem nenhuma.
 *
 * Chamava-se `middleware.ts` até o Next 16 renomear a convenção. O nome novo é
 * mais honesto sobre o que a camada faz — ela fica na frente da requisição, não
 * no meio da aplicação — e é também o motivo pelo qual ela **não** é a
 * fronteira de autorização deste sistema. Ver `edgeOutcome()`.
 *
 * Duas responsabilidades, e vale ser preciso sobre a segunda.
 *
 * **1. Renovar o cookie.** O token do Supabase vence. Quem renova precisa
 * conseguir escrever cabeçalho, e Server Component não consegue — a resposta já
 * começou. Se ninguém renovasse aqui, toda sessão morreria ao vencer o token, e
 * o sintoma seria "o sistema me desloga sozinho depois de uma hora".
 *
 * **2. Redirecionar quem não tem sessão.** Economia de trabalho e de espera,
 * não fronteira. `edgeOutcome()` explica por que só este caso, e
 * `lib/auth/require.ts` explica por que a fronteira é lá dentro.
 *
 * ## O detalhe que faz sessões caírem sozinhas
 *
 * Os cookies que a biblioteca grava vivem na resposta que `NextResponse.next()`
 * criou. Trocar essa resposta por outra — um `redirect`, por exemplo — **joga
 * fora o cookie renovado**. A pessoa é redirecionada, chega na próxima página
 * com o token velho, e é redirecionada de novo: um laço que só acontece perto
 * do vencimento e é quase impossível de reproduzir. Por isso a resposta de
 * redirecionamento abaixo copia os cookies, uma a uma, antes de sair.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import { routeRules } from './config/routes.ts';
import { edgeOutcome } from './lib/auth/edge.ts';
import { readSupabaseConfig } from './lib/env.ts';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const estado = readSupabaseConfig();

  /*
   * Sem configuração, ninguém tem sessão — e é assim que deve ser tratado.
   * Deixar passar seria servir área autenticada a quem nunca autenticou; o
   * banco negaria, mas a tela apareceria. Fechar aqui manda todo mundo para
   * `/entrar`, que é pública e mostra o erro de configuração com o nome da
   * variável que falta.
   */
  if (!estado.configured) {
    return responder(request, edgeOutcome(pathname, false, routeRules), NextResponse.next());
  }

  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(estado.config.url, estado.config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar) {
        for (const { name, value } of paraGravar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  /*
   * `getUser()`, não `getSession()`: é esta chamada que valida o token e, de
   * quebra, dispara a renovação. `getSession()` leria o cookie e devolveria o
   * que estivesse lá — inclusive um token vencido, como se valesse.
   */
  const { data } = await supabase.auth.getUser();

  return responder(request, edgeOutcome(pathname, data.user !== null, routeRules), resposta);
}

/** Aplica a decisão preservando os cookies que a renovação acabou de gravar. */
function responder(
  request: NextRequest,
  decisao: ReturnType<typeof edgeOutcome>,
  resposta: NextResponse,
): NextResponse {
  if (decisao.kind !== 'redirect') return resposta;

  const destino = new URL(decisao.location, request.url);
  const redirecionamento = NextResponse.redirect(destino);
  for (const cookie of resposta.cookies.getAll()) redirecionamento.cookies.set(cookie);
  return redirecionamento;
}

export const config = {
  /*
   * Tudo, menos o que não é página.
   *
   * Arquivo estático e imagem não carregam sessão e não precisam de decisão de
   * acesso — rodar o middleware neles gastaria uma validação de token por
   * ícone. `_next/static` e `_next/image` são servidos pelo próprio Next;
   * `favicon.ico` e afins vêm de `public/`.
   *
   * A negativa é por extensão, e não por pasta, porque `public/` é servido a
   * partir da raiz: um `logo.svg` lá vira `/logo.svg`, sem prefixo que sirva de
   * pista.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
