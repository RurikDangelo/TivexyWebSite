/**
 * De qual empresa é esta requisição.
 *
 * `current_viewer(p_tenant_id)` precisa de um tenant para responder. Descobrir
 * qual é vem antes de qualquer decisão de acesso — e é aqui, numa função pura,
 * porque a regra tem casos que só aparecem quando alguém participa de mais de
 * uma empresa, e esses casos precisam de teste, não de servidor.
 *
 * Três fontes, nesta ordem, e a ordem é a regra:
 *
 *   1. o endereço      `acme.tivexy.com.br` é a Acme, ponto
 *   2. o cookie        a última empresa escolhida, quando o endereço não diz
 *   3. o único vínculo quem participa de uma empresa só não escolhe nada
 *
 * **O endereço ganha do cookie, e isso não é detalhe de precedência.** Quem
 * abre `acme.tivexy.com.br` e enxerga os dados da Bravo — porque era a Bravo
 * que estava no cookie — não tem como perceber o engano: a tela é a mesma, os
 * números é que são de outra empresa. Deixar o endereço decidir é o que
 * garante que compartilhar um link mostre para o outro o que ele mostrou para
 * mim.
 *
 * E o caso que **não** pode virar silêncio: o endereço nomeia uma empresa que
 * esta pessoa não alcança. A tentação é cair para a empresa dela, que é o que
 * "funciona". Mas a página responderia com dados de uma empresa diferente da
 * que o endereço prometeu — exatamente o engano de cima, chegando pelo outro
 * lado. Vira `foreign`, e quem chama trata como negação.
 */

import { isReservedSubdomain, type MembershipStatus, type TenantStatus } from '@tivexy/core';

/** Uma empresa que esta pessoa alcança. É o que `my_tenants()` devolve. */
export interface TenantOption {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  membership: MembershipStatus;
}

export type TenantChoice =
  /** Uma empresa decidida. O caso normal. */
  | { kind: 'resolved'; tenant: TenantOption; source: 'host' | 'cookie' | 'only' }
  /** Nenhum vínculo. Quem cai aqui vai para o onboarding. */
  | { kind: 'none' }
  /** Mais de uma, e nada decidiu qual. Precisa da tela de escolha. */
  | { kind: 'choose'; options: readonly TenantOption[] }
  /** O endereço nomeia uma empresa fora do alcance desta pessoa. */
  | { kind: 'foreign'; slug: string };

/**
 * Nome do cookie da empresa escolhida.
 *
 * Só guarda o slug, que é público — ele está na barra de endereço. Nada de
 * identificador nem de permissão: o cookie é uma preferência de navegação, e
 * quem decide o que ela alcança continua sendo `my_tenants()`, a cada
 * requisição. Um cookie adulterado consegue, no máximo, apontar para uma
 * empresa que a pessoa já podia abrir.
 */
export const TENANT_COOKIE = 'tivexy_empresa';

function acharPorSlug(
  options: readonly TenantOption[],
  slug: string | null,
): TenantOption | undefined {
  if (slug === null) return undefined;
  const alvo = slug.trim().toLowerCase();
  if (alvo.length === 0) return undefined;
  return options.find((o) => o.slug.toLowerCase() === alvo);
}

export function chooseTenant(
  options: readonly TenantOption[],
  fromHost: string | null,
  fromCookie: string | null,
): TenantChoice {
  if (fromHost !== null && !isReservedSubdomain(fromHost)) {
    const doEndereco = acharPorSlug(options, fromHost);
    /*
     * Sem fallback, de propósito. Ver o cabeçalho: cair para a empresa da
     * pessoa aqui responderia a `acme.tivexy.com.br` com dados da Bravo.
     */
    return doEndereco === undefined
      ? { kind: 'foreign', slug: fromHost.trim().toLowerCase() }
      : { kind: 'resolved', tenant: doEndereco, source: 'host' };
  }

  if (options.length === 0) return { kind: 'none' };

  const doCookie = acharPorSlug(options, fromCookie);
  if (doCookie !== undefined) return { kind: 'resolved', tenant: doCookie, source: 'cookie' };

  /*
   * Uma só: não há escolha a fazer, e mostrar uma tela de escolha com um item
   * é pedir um clique que não decide nada.
   */
  if (options.length === 1) return { kind: 'resolved', tenant: options[0]!, source: 'only' };

  return { kind: 'choose', options };
}
