/**
 * O que o PostgREST devolve num `select` aninhado.
 *
 * A biblioteca tipa a relação embutida ora como objeto, ora como array, e o
 * que decide é se ela conseguiu afirmar que a relação é de um para um. Com as
 * chaves estrangeiras compostas do CRM (`tenant_id, company_id`) essa
 * inferência é menos previsível do que com uma chave simples.
 *
 * Tratar as duas formas custa quatro linhas. Não tratar custa uma coluna vazia
 * em produção, sem erro nenhum — a tela mostra "Sem empresa" para toda
 * oportunidade e ninguém desconfia, porque é um estado legítimo.
 *
 * A tela de leads já fazia isto à mão para o funil da etapa; aqui virou um
 * lugar só.
 */

/** O campo `name` de uma relação embutida, venha ela como objeto ou como array. */
export function nomeAninhado(bruto: unknown): string | null {
  const primeiro = Array.isArray(bruto) ? bruto[0] : bruto;
  const objeto = primeiro as { name?: unknown } | null | undefined;
  return typeof objeto?.name === 'string' && objeto.name !== '' ? objeto.name : null;
}
