import 'server-only';

/**
 * O portão de verdade: decide dentro do componente que vai renderizar.
 *
 * O `proxy.ts` — o middleware, no nome que o Next 16 adotou — também chama a guarda, e isso é bom para a experiência —
 * ninguém carrega uma página inteira para descobrir que não podia. Mas
 * middleware **não é fronteira de segurança** neste desenho, por uma razão
 * concreta: já houve falha no Next em que um cabeçalho forjado pulava o
 * middleware por completo (CVE-2025-29927). Uma autorização que mora só lá
 * depende de um detalhe de implementação do framework continuar correto.
 *
 * Aqui é diferente. Isto roda **dentro** da renderização: não há como pedir a
 * página sem passar por ele. E abaixo dele ainda há o RLS, que negaria a
 * consulta mesmo que este arquivo tivesse um erro.
 *
 * Use em `layout.tsx` de cada grupo de rotas, não em cada página: o grupo é a
 * fronteira, e repetir por página é o que acaba esquecido na página nova.
 */

import { isAuthenticated } from '@tivexy/core';
import { notFound, redirect } from 'next/navigation';

import { routeRules } from '../../config/routes.ts';
import { REASON_PARAM } from './denial.ts';
import { guard } from './guard.ts';
import { type SessionContext, currentSession } from './session.ts';

/** Onde a pessoa escolhe entre as empresas de que participa. */
export const TENANT_PICKER = '/empresas';

/**
 * Exige acesso a este caminho. Devolve o contexto, ou não devolve.
 *
 * `redirect()` e `notFound()` do Next funcionam lançando — então tudo depois
 * de uma negação não roda, e o retorno tipado como `SessionContext` é honesto:
 * quem recebe, passou.
 */
export async function requireAccess(pathname: string): Promise<SessionContext> {
  const contexto = await currentSession();

  /*
   * O endereço nomeia uma empresa que esta pessoa não alcança.
   *
   * 404, e não uma mensagem melhor. Dizer "você não tem acesso à Acme"
   * confirma que a Acme é cliente da Tivexy — para qualquer um que digite
   * subdomínios até acertar. É o mesmo silêncio que `current_viewer()` já
   * pratica no banco, onde um estranho não descobre nem que o tenant existe.
   */
  if (contexto.choice.kind === 'foreign') notFound();

  const resultado = guard(pathname, contexto.viewer, routeRules);

  if (resultado.kind === 'allow') return contexto;

  if (resultado.kind === 'deny') {
    redirect(`/acesso-negado?${REASON_PARAM}=${resultado.reason}`);
  }

  /*
   * Quem participa de duas empresas e ainda não escolheu não está sem empresa
   * — está sem escolha feita. Mandá-lo para o onboarding mostraria "sua conta
   * não está ligada a nenhuma empresa", que é falso e desnorteia.
   */
  if (resultado.reason === 'no-tenant' && contexto.choice.kind === 'choose') {
    redirect(TENANT_PICKER);
  }

  redirect(resultado.location);
}

/**
 * Exige apenas sessão — o mínimo comum do grupo `(app)`.
 *
 * O layout de um grupo não sabe qual página está sendo renderizada, e não deve
 * inventar: guardar `/painel` no layout faria `/acesso-negado`, que vive no
 * mesmo grupo, ser avaliada pela regra de outra rota. O layout cobre o piso —
 * tem sessão —, e cada página exige o que é dela com `requireAccess('/o/seu/caminho')`.
 *
 * **Por que o caminho é literal em quem chama, e não lido de um cabeçalho.** Seria
 * cômodo o middleware anunciar o caminho num cabeçalho e o layout obedecer. Mas
 * cabeçalho vem da requisição: quem pedisse `/admin` anunciando `/painel` seria
 * avaliado pela regra mais fraca. Como o middleware pode ser pulado — já foi,
 * por cabeçalho forjado —, a defesa não pode depender de ele ter passado por ali.
 * Uma string literal no arquivo não tem esse problema.
 *
 * Aqui não há destino de retorno, e é de propósito: esta camada não sabe de que
 * página veio. Quem preserva o destino é o middleware, que tem a URL inteira. Na
 * prática este redirecionamento quase nunca dispara — ele é a rede embaixo.
 */
export async function requireSession(): Promise<SessionContext> {
  const contexto = await currentSession();
  if (contexto.choice.kind === 'foreign') notFound();
  if (!isAuthenticated(contexto.viewer)) redirect('/entrar');
  return contexto;
}
