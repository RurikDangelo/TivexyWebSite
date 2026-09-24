/**
 * Instante, dia e fuso.
 *
 * Vive no Core porque **toda** tela que mostra ou recebe uma data precisa da
 * mesma resposta para a mesma pergunta: que horas são para *este* cliente.
 * Uma segunda implementação em algum formulário é a que vai gravar três horas
 * adiantado e ninguém percebe até a agenda do dia aparecer errada.
 *
 * ## Por que não basta `new Date(texto)`
 *
 * `<input type="datetime-local">` manda `2026-09-24T14:30` — hora de parede,
 * sem fuso. `new Date('2026-09-24T14:30')` interpreta no fuso **do servidor**,
 * que na Vercel é UTC. A consulta gravaria 14:30Z, que é 11:30 em São Paulo:
 * a atividade marcada para as duas e meia da tarde apareceria como atrasada
 * desde o começo da manhã.
 *
 * O fuso certo é o do tenant (`core.timezone`), não o do servidor nem o do
 * navegador — o relatório de uma empresa em Manaus não pode mudar porque quem
 * abriu estava viajando.
 *
 * ## Por que não uma biblioteca
 *
 * O `Intl` do runtime já carrega a base de fusos IANA inteira, inclusive o
 * histórico de horário de verão. O que falta é uma função de três linhas para
 * ler o deslocamento dela, e é isso que está aqui. Uma dependência traria a
 * mesma base de novo, desatualizada em relação ao runtime.
 */

/**
 * Este fuso existe?
 *
 * Pergunta ao formatador em vez de consultar `Intl.supportedValuesOf`, que
 * devolve só os nomes **canônicos** e por isso recusa apelidos legítimos como
 * `UTC`. O critério certo é "o runtime consegue formatar neste fuso?", porque
 * é exatamente isso que o sistema vai fazer com o valor.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** O fuso de quem não configurou nada. Igual ao padrão de `core.timezone`. */
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

const CAMPOS = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  /*
   * `h23` e não `hour12: false`. Os dois parecem a mesma coisa e não são: com
   * `hour12: false` alguns runtimes devolvem `24` para meia-noite, e `24`
   * reconstruído vira o dia seguinte — um erro de um dia, uma vez por dia.
   */
  hourCycle: 'h23',
} as const;

/** As partes de um instante, lidas num fuso. */
export interface PartesDoRelogio {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** O que os ponteiros mostram naquele fuso, naquele instante. */
export function clockPartsIn(instant: Date, timeZone: string): PartesDoRelogio {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone, ...CAMPOS }).formatToParts(instant);

  const ler = (tipo: string): number => {
    const parte = partes.find((p) => p.type === tipo);
    return parte === undefined ? 0 : Number(parte.value);
  };

  return {
    year: ler('year'),
    month: ler('month'),
    day: ler('day'),
    hour: ler('hour'),
    minute: ler('minute'),
    second: ler('second'),
  };
}

/**
 * O deslocamento do fuso **naquele instante**, em milissegundos.
 *
 * "Naquele instante" é o detalhe que importa: um fuso com horário de verão não
 * tem um deslocamento, tem dois, e qual vale depende da data. Guardar
 * `-3 horas` numa constante funciona no Brasil de hoje e quebra em qualquer
 * fuso que ainda mude — e quebrou no Brasil até 2019.
 */
function offsetOf(instant: Date, timeZone: string): number {
  const p = clockPartsIn(instant, timeZone);
  const comoSeFosseUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

  /*
   * O relógio só tem segundos, então o instante entra truncado ao segundo —
   * senão os milissegundos dele entrariam no deslocamento como se fossem
   * fuso. `Math.floor` e não `%`: para data anterior a 1970 o resto é
   * negativo, e o erro apareceria só em dado importado.
   */
  return comoSeFosseUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Hora de parede naquele fuso → o instante de verdade.
 *
 * Recebe o que `<input type="datetime-local">` manda (`2026-09-24T14:30`, com
 * segundos opcionais) e devolve o `Date` que o banco deve gravar.
 *
 * ## As duas passadas
 *
 * O deslocamento depende do instante, e o instante é justamente o que se quer
 * descobrir. A saída é chutar, medir, e medir de novo: a primeira passada usa
 * o deslocamento do palpite, a segunda corrige se o palpite caiu do outro lado
 * de uma virada de horário de verão. Duas passadas bastam porque a segunda já
 * está dentro da hora certa.
 *
 * Hora que **não existe** — a madrugada pulada quando o relógio adianta —
 * cai na hora seguinte, em vez de ser recusada. Recusar seria correto e
 * inútil: quem digitou não escolheu aquele instante de propósito.
 */
export function zonedToUtc(wall: string, timeZone: string): Date | null {
  const casou = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall.trim());
  if (casou === null || !isValidTimeZone(timeZone)) return null;

  const [, ano, mes, dia, hora, minuto, segundo] = casou;
  const y = Number(ano);
  const mo = Number(mes);
  const d = Number(dia);
  const h = Number(hora);
  const mi = Number(minuto);
  const s = Number(segundo ?? '0');

  const comoSeFosseUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(comoSeFosseUtc)) return null;

  /*
   * `Date.UTC` **normaliza em silêncio**: mês 13 vira janeiro do ano
   * seguinte, dia 32 de janeiro vira 1º de fevereiro, 30 de fevereiro vira 2
   * de março. Nenhum deles dá erro, e todos gravam uma data que a pessoa não
   * escreveu — um ano de diferença, no caso do mês 13.
   *
   * A conferência é reconstruir e comparar. Cobre os três casos de uma vez, e
   * não depende de lembrar os limites de cada mês nem de ano bissexto.
   */
  const reconstruido = new Date(comoSeFosseUtc);
  if (
    reconstruido.getUTCFullYear() !== y ||
    reconstruido.getUTCMonth() !== mo - 1 ||
    reconstruido.getUTCDate() !== d ||
    reconstruido.getUTCHours() !== h ||
    reconstruido.getUTCMinutes() !== mi ||
    reconstruido.getUTCSeconds() !== s
  ) {
    return null;
  }

  const primeiroPalpite = new Date(comoSeFosseUtc - offsetOf(new Date(comoSeFosseUtc), timeZone));
  const corrigido = new Date(comoSeFosseUtc - offsetOf(primeiroPalpite, timeZone));

  return Number.isNaN(corrigido.getTime()) ? null : corrigido;
}

/** Dois dígitos, para montar texto de data sem depender de formatador. */
function dois(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * O instante → o valor de um `<input type="datetime-local">` naquele fuso.
 *
 * O caminho de volta de `zonedToUtc`, e é o que faz um formulário de edição
 * mostrar a hora que a pessoa marcou, e não a hora do servidor.
 */
export function utcToZonedInput(instant: Date, timeZone: string): string {
  const p = clockPartsIn(instant, timeZone);
  return `${p.year}-${dois(p.month)}-${dois(p.day)}T${dois(p.hour)}:${dois(p.minute)}`;
}

/** O dia daquele instante naquele fuso, como `YYYY-MM-DD`. */
export function dayIn(instant: Date, timeZone: string): string {
  const p = clockPartsIn(instant, timeZone);
  return `${p.year}-${dois(p.month)}-${dois(p.day)}`;
}

/**
 * Quantos dias separam dois instantes, **contados em dias de calendário**.
 *
 * Não é a diferença dividida por 24 horas. Vinte e três horas podem cruzar a
 * meia-noite, e nesse caso a resposta certa é 1 — "amanhã" —, não 0. É essa a
 * pergunta que a agenda faz.
 */
export function calendarDaysBetween(de: Date, ate: Date, timeZone: string): number {
  const dia = (instante: Date): number => {
    const p = clockPartsIn(instante, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day);
  };
  return Math.round((dia(ate) - dia(de)) / 86_400_000);
}

/** Como mostrar um instante para gente, no fuso do cliente. */
export function formatInstant(
  instant: Date,
  timeZone: string,
  opcoes: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
  locale = 'pt-BR',
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, ...opcoes }).format(instant);
}
