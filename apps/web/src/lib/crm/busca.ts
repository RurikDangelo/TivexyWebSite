/**
 * Busca nas listagens do CRM.
 *
 * ## O problema que este arquivo existe para resolver
 *
 * O filtro do PostgREST é **texto com sintaxe**, não parâmetro ligado:
 *
 *     or=(name.ilike.*maria*,email.ilike.*maria*)
 *
 * A vírgula separa condições e o parêntese delimita o grupo. Interpolar o que
 * a pessoa digitou direto ali é o mesmo tipo de erro que concatenar SQL:
 * alguém busca por `Silva, Souza & Cia (ME)` e a vírgula vira separador de
 * condição — o filtro passa a ter cláusulas que ninguém escreveu. No melhor
 * caso a consulta falha; no pior, devolve linhas que não deveria.
 *
 * O PostgREST aceita **valor entre aspas duplas**, e dentro delas vírgula e
 * parêntese perdem o significado. É o que `filtroOu` monta. Continuam saindo
 * do termo os dois caracteres que nem as aspas neutralizam — a própria aspa e
 * a barra invertida —, porque eles é que fechariam a citação.
 *
 * ## Isto não substitui o RLS
 *
 * Nada aqui decide quem vê o quê. Se este arquivo tiver um defeito, o pior que
 * acontece é a consulta trazer linha errada **do próprio tenant** — a política
 * continua recusando o resto. É a diferença entre um bug de busca e um
 * vazamento.
 */

/**
 * O termo, limpo do que quebraria a citação do filtro.
 *
 * `*` e `%` saem porque são curinga: quem digita `100%` quer achar "100%", e
 * não "tudo que começa com 100". Vírgula, parêntese e acento permanecem — são
 * texto legítimo de nome de empresa, e dentro das aspas não significam nada.
 */
export function termoSeguro(termo: string): string {
  return termo.trim().replace(/["\\]/g, '').replace(/[*%]/g, '').slice(0, 100);
}

/**
 * O filtro `or` do PostgREST para procurar o termo em várias colunas.
 *
 * Devolve `null` quando não há o que filtrar — e `null` é diferente de string
 * vazia para quem chama: string vazia viraria um filtro que não casa com
 * nada, e a listagem apareceria vazia para quem só apagou a busca.
 */
export function filtroOu(termo: string, colunas: readonly string[]): string | null {
  const seguro = termoSeguro(termo);
  if (seguro === '' || colunas.length === 0) return null;

  return colunas.map((coluna) => `${coluna}.ilike."*${seguro}*"`).join(',');
}

/**
 * O valor de um parâmetro da URL, como texto.
 *
 * `searchParams` entrega `string | string[] | undefined` — repetir o
 * parâmetro na URL produz array. Pegar o primeiro é o comportamento certo, e
 * não travar é o que importa: a URL vem de fora.
 */
export function parametro(
  params: Record<string, string | string[] | undefined>,
  chave: string,
): string {
  const valor = params[chave];
  if (typeof valor === 'string') return valor;
  if (Array.isArray(valor) && typeof valor[0] === 'string') return valor[0];
  return '';
}

/**
 * Um valor de uma lista fechada, ou o padrão.
 *
 * Usado pelos filtros de estado. O padrão existe para que uma URL editada à
 * mão — ou um link velho — mostre a listagem inteira em vez de uma tela vazia
 * sem explicação.
 */
export function umDentre<T extends string>(bruto: string, aceitos: readonly T[], padrao: T): T {
  return (aceitos as readonly string[]).includes(bruto) ? (bruto as T) : padrao;
}
