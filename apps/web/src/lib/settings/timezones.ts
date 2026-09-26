/**
 * Os fusos do Brasil, para o seletor de `core.timezone`.
 *
 * O deslocamento é lido do `Intl` na hora, e não escrito à mão: o Brasil
 * aboliu o horário de verão em 2019 e pode voltar a ter, e um rótulo "UTC−3"
 * fixo no código passaria a mentir sem ninguém perceber.
 *
 * Um fuso que o tenant já usa e não está na lista (um cliente em Lisboa, por
 * exemplo) entra no fim — tirá-lo do seletor trocaria o fuso dele no primeiro
 * "salvar" sem que ele pedisse.
 */

const DO_BRASIL: readonly [string, string][] = [
  ['America/Noronha', 'Fernando de Noronha'],
  ['America/Sao_Paulo', 'Brasília, São Paulo, Rio, Sul e Sudeste'],
  ['America/Bahia', 'Salvador'],
  ['America/Fortaleza', 'Fortaleza, Natal, São Luís, Teresina'],
  ['America/Recife', 'Recife, João Pessoa'],
  ['America/Maceio', 'Maceió, Aracaju'],
  ['America/Belem', 'Belém, Macapá'],
  ['America/Araguaina', 'Palmas, Araguaína'],
  ['America/Santarem', 'Santarém'],
  ['America/Cuiaba', 'Cuiabá'],
  ['America/Campo_Grande', 'Campo Grande'],
  ['America/Manaus', 'Manaus'],
  ['America/Porto_Velho', 'Porto Velho'],
  ['America/Boa_Vista', 'Boa Vista'],
  ['America/Rio_Branco', 'Rio Branco'],
  ['America/Eirunepe', 'Eirunepé'],
];

/** "GMT-3", do jeito que o `Intl` diz, naquele instante. */
export function offsetLabel(timeZone: string, now: Date): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(now);
  return partes.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

export interface OpcaoDeFuso {
  valor: string;
  rotulo: string;
}

export function timeZoneOptions(atual: string, now: Date = new Date()): OpcaoDeFuso[] {
  const opcoes = DO_BRASIL.map(([valor, cidades]) => ({
    valor,
    rotulo: `${cidades} (${offsetLabel(valor, now)})`,
  }));
  if (!DO_BRASIL.some(([valor]) => valor === atual)) {
    opcoes.push({ valor: atual, rotulo: `${atual} (${offsetLabel(atual, now)})` });
  }
  return opcoes;
}
