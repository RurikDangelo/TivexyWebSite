/**
 * O que o middleware pode decidir — e, sobretudo, o que ele não deve.
 *
 * O middleware roda antes de tudo e sabe pouco: tem o cookie, não tem o
 * `Viewer`. Montar o `Viewer` ali custaria duas consultas ao banco em **toda**
 * requisição, inclusive nas que nem chegam a renderizar página.
 *
 * Então ele decide uma coisa só: **quem não tem sessão não entra numa rota que
 * exige sessão.** É a negação mais comum, a mais barata de detectar e a única
 * que não precisa saber de empresa, vínculo, módulo ou permissão.
 *
 * Todo o resto é adiado para `requireAccess()`, que roda dentro da renderização
 * com o `Viewer` completo. E isso não é só economia: middleware do Next já foi
 * contornável por cabeçalho forjado (CVE-2025-29927). Uma camada que pode ser
 * pulada não deve ser a que decide — ela pode, no máximo, poupar trabalho de
 * quem já ia ser negado de qualquer jeito.
 *
 * A função reaproveita `guard()` de propósito. Assim o `/entrar?proxima=…`
 * daqui é construído pelo mesmo código testado contra redirecionamento aberto —
 * em vez de uma segunda montagem de URL, parecida e não conferida.
 */

import { ANONYMOUS, type RouteMatcher } from '@tivexy/core';

import { type GuardOutcome, guard } from './guard.ts';

/**
 * "Há sessão, e nada além disso."
 *
 * O identificador é um marcador, não um usuário: serve para `isAuthenticated()`
 * responder verdadeiro e nada mais. Nenhuma decisão abaixo de `authenticated`
 * é tomada com ele — ver o retorno de `edgeOutcome`.
 */
const COM_SESSAO = { ...ANONYMOUS, userId: 'sessão-presente' };

export function edgeOutcome(
  pathname: string,
  hasSession: boolean,
  rules: readonly RouteMatcher[],
): GuardOutcome {
  const resultado = guard(pathname, hasSession ? COM_SESSAO : ANONYMOUS, rules);

  /*
   * Só este motivo. Os outros vieram de um `Viewer` que não é real — ele não
   * tem empresa nem permissão porque o middleware não as consultou, e não
   * porque a pessoa não as tenha. Agir sobre eles mandaria um administrador
   * legítimo para o onboarding.
   */
  if (resultado.kind === 'redirect' && resultado.reason === 'unauthenticated') return resultado;

  return { kind: 'allow' };
}
