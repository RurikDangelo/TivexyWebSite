/**
 * Trocar o plano de uma empresa: o que acontece com os módulos.
 *
 * Espelha `public.admin_change_plan()` (20260925140000), para o Admin mostrar
 * antes de confirmar exatamente o que o banco vai fazer. O teste do Admin roda
 * os dois lados no mesmo cenário.
 *
 * O plano é o padrão de origem; `tenant_modules` é a verdade sobre acesso.
 * Por isso trocar **liga** o que o plano novo inclui e a empresa não tem, e
 * **desliga** o que ficou fora só quando pedido — pode haver módulo vendido à
 * parte. Desligar não apaga dado. O Core nunca desliga.
 */

import { MODULE_CODES, type ModuleCode } from './catalog.ts';

export interface PlanChangePreview {
  enable: ModuleCode[];
  disable: ModuleCode[];
}

const ORDEM = new Map<ModuleCode, number>(MODULE_CODES.map((m, i) => [m, i]));

function ordenar(lista: Iterable<ModuleCode>): ModuleCode[] {
  return [...lista].sort((a, b) => (ORDEM.get(a) ?? 99) - (ORDEM.get(b) ?? 99));
}

export function previewPlanChange(input: {
  /** Os módulos que o plano novo inclui. */
  planModules: readonly ModuleCode[];
  /** Os módulos ligados hoje na empresa. */
  enabled: readonly ModuleCode[];
  disableOutside: boolean;
}): PlanChangePreview {
  const noPlano = new Set(input.planModules);
  const ligados = new Set(input.enabled);
  return {
    enable: ordenar(input.planModules.filter((m) => !ligados.has(m))),
    disable: input.disableOutside
      ? ordenar(input.enabled.filter((m) => m !== 'core' && !noPlano.has(m)))
      : [],
  };
}
