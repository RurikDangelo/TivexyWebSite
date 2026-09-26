/**
 * Número digitado por uma pessoa no Brasil, normalizado para `1234.56`.
 *
 * A regra de sempre: vírgula é o decimal, ponto é o milhar — `1.234,56`. Mas
 * o teclado numérico do celular manda ponto como decimal, e quem digita
 * `5.50` quer cinco reais e cinquenta. Até 25/09/2026 `parseCents('5.50')`
 * devolvia R$ 550,00 — o erro de cem vezes, silencioso, num campo de valor.
 *
 * O ponto só é milhar quando **forma grupos de milhar**: `1.000`, `12.345`,
 * `1.234.567`. Um ponto sozinho que não forma grupo — `5.50`, `0.335`, `1.5`
 * — só pode ser decimal. Com vírgula presente, a vírgula decide, e os pontos
 * antes dela precisam ser grupos válidos.
 *
 * O caso que continua ambíguo é `1.250`: grupo de milhar válido, então mil
 * duzentos e cinquenta. É a leitura brasileira, e a tela mostra o valor
 * interpretado antes de gravar.
 *
 * Devolve `null` para o que não é número — nunca zero: zero seria um valor
 * que ninguém digitou.
 */
export function normalizeDecimal(raw: string, casasDecimais: number): string | null {
  const limpo = raw.trim().replace(/\s/g, '');
  if (limpo === '') return null;

  const GRUPOS = /^[1-9]\d{0,2}(\.\d{3})+$/;
  let inteiro: string;
  let fracao = '';

  if (limpo.includes(',')) {
    const partes = limpo.split(',');
    if (partes.length !== 2) return null;
    const [antes = '', depois = ''] = partes;
    if (!/^\d+$/.test(antes) && !GRUPOS.test(antes)) return null;
    if (!/^\d+$/.test(depois)) return null;
    inteiro = antes.replace(/\./g, '');
    fracao = depois;
  } else if (limpo.includes('.')) {
    if (GRUPOS.test(limpo)) {
      inteiro = limpo.replace(/\./g, '');
    } else {
      const partes = limpo.split('.');
      if (partes.length !== 2) return null;
      const [antes = '', depois = ''] = partes;
      if (!/^\d+$/.test(antes) || !/^\d+$/.test(depois)) return null;
      inteiro = antes;
      fracao = depois;
    }
  } else {
    if (!/^\d+$/.test(limpo)) return null;
    inteiro = limpo;
  }

  if (fracao.length > casasDecimais) return null;
  return fracao === '' ? inteiro : `${inteiro}.${fracao}`;
}
