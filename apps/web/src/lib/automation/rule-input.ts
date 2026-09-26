/**
 * O formulário de automação, do jeito que chega do navegador, até a regra que
 * o banco vai receber.
 *
 * O editor monta a regra num campo só (`regra`, em JSON), porque condições
 * são uma lista que cresce e encolhe — campos soltos com índice no nome
 * quebram quando se remove a do meio. O que vem de lá é texto digitado: o
 * valor "1.000,50" vira centavos aqui, pela regra única de `parseCents`, e só
 * então a regra passa pela conferência do Core, a mesma que a tela conhece.
 */

import {
  AUTOMATION_TRIGGERS,
  type AutomationRuleCheck,
  type CampoDoGatilho,
  checkAutomationRule,
  isAutomationTrigger,
  normalizeDecimal,
  parseCents,
} from '@tivexy/core';

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : '';
}

/** O número digitado: "2,5" → 2.5. Torto, ou com casas demais, vira `NaN` — a conferência recusa. */
function numeroDigitado(valor: unknown, casasDecimais: number): number {
  if (typeof valor === 'number') return valor;
  const normalizado = normalizeDecimal(texto(valor), casasDecimais);
  return normalizado === null ? Number.NaN : Number(normalizado);
}

export function parseRuleForm(form: FormData): AutomationRuleCheck {
  const bruto = form.get('regra');
  let dados: Record<string, unknown> = {};
  try {
    dados = objeto(JSON.parse(typeof bruto === 'string' ? bruto : '{}'));
  } catch {
    return {
      ok: false,
      problemas: { regra: 'Não consegui ler a automação. Recarregue a página.' },
    };
  }

  const gatilho = texto(dados.gatilho);
  const campos: readonly CampoDoGatilho[] = isAutomationTrigger(gatilho)
    ? AUTOMATION_TRIGGERS[gatilho].campos
    : [];
  const problemasDeValor: Record<string, string> = {};

  const condicoes = (Array.isArray(dados.condicoes) ? dados.condicoes : []).map((item, i) => {
    const c = objeto(item);
    const campo = campos.find((d) => d.campo === c.campo);
    let valor: unknown = c.valor;
    if (campo?.tipo === 'dinheiro') {
      const centavos = typeof c.valor === 'number' ? c.valor : parseCents(texto(c.valor));
      if (centavos === null) problemasDeValor[`condicoes.${i}`] = 'Informe um valor em reais.';
      valor = centavos ?? Number.NaN;
    } else if (campo?.tipo === 'numero') {
      valor = numeroDigitado(c.valor, 3);
    }
    return { campo: texto(c.campo), operador: texto(c.operador), valor };
  });

  const params = { ...objeto(dados.params) };
  if ('dias' in params) {
    params.dias = numeroDigitado(params.dias, 0);
  }

  const conferido = checkAutomationRule({
    nome: texto(dados.nome),
    gatilho,
    condicoes,
    acao: texto(dados.acao),
    params,
  });
  if (Object.keys(problemasDeValor).length === 0) return conferido;
  return {
    ok: false,
    problemas: { ...(conferido.ok ? {} : conferido.problemas), ...problemasDeValor },
  };
}
