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

/**
 * O nome de uma relação embutida, venha ela como objeto ou como array.
 *
 * O campo é `name` na maior parte das tabelas do CRM e `title` em
 * `crm_deals` — uma oportunidade tem título, não nome. Daí o segundo
 * argumento, em vez de uma segunda função quase igual.
 */
export function nomeAninhado(bruto: unknown, campo = 'name'): string | null {
  const primeiro = Array.isArray(bruto) ? bruto[0] : bruto;
  if (primeiro === null || typeof primeiro !== 'object') return null;

  const valor = (primeiro as Record<string, unknown>)[campo];
  return typeof valor === 'string' && valor !== '' ? valor : null;
}
