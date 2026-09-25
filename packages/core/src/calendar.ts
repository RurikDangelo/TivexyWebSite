/**
 * Datas no fuso do tenant.
 *
 * O servidor roda em UTC. Às 22h de São Paulo já é amanhã em UTC, e uma conta
 * que vence "hoje" apareceria como vencida para quem a olha à noite — ou uma
 * venda das 21h cairia no dia seguinte do relatório. **Hoje é o dia do tenant**,
 * lido de `core.timezone`, e é por isso que estas funções pedem o fuso em vez
 * de perguntar ao relógio da máquina.
 *
 * Datas de calendário circulam como texto `AAAA-MM-DD`, que é como o Postgres
 * devolve `date` e como `<input type="date">` entrega. Texto nesse formato se
 * compara em ordem alfabética na ordem certa, e não carrega fuso nenhum — que
 * é exatamente o que uma data de vencimento é.
 */

const FORMATO_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** O dia de calendário de um instante, no fuso indicado. */
export function dateIn(instant: Date | string, timeZone: string): string {
  const momento = typeof instant === 'string' ? new Date(instant) : instant;
  /* `en-CA` formata como AAAA-MM-DD. Não é o idioma da tela — é o formato. */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento);
}

/** Hoje, no fuso do tenant. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateIn(now, timeZone);
}

/** É uma data `AAAA-MM-DD` que existe no calendário? `2026-02-30` não é. */
export function isIsoDate(valor: string): boolean {
  if (!FORMATO_ISO.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Quantos dias de `de` até `ate`, as duas em `AAAA-MM-DD`.
 *
 * Pela meia-noite UTC de cada uma, e não pela diferença de dois instantes:
 * dia de calendário não tem hora, e o horário de verão de outros fusos não
 * pode transformar um dia em 23 horas e arredondar para zero.
 */
export function daysBetween(de: string, ate: string): number {
  const utc = (iso: string) => {
    const [ano, mes, dia] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(ano, mes - 1, dia);
  };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

/** Soma dias a uma data `AAAA-MM-DD`. */
export function addDays(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** O primeiro dia do mês de uma data `AAAA-MM-DD`. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Quantos minutos o fuso está à frente de UTC naquele instante (São Paulo: −180). */
function deslocamento(utcMs: number, timeZone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
    valor('second'),
  );
  return Math.round((comoUtc - utcMs) / 60_000);
}

/**
 * O instante de "tal dia, tal hora" no fuso do tenant.
 *
 * O formulário entrega `2026-09-25` e `14:30`, sem fuso — é a hora da parede
 * de quem digitou. Gravar isso como UTC poria a consulta das 14h30 às 11h30 de
 * São Paulo. A conta ajusta pelo deslocamento do fuso **naquele dia**, duas
 * vezes, porque em fuso com horário de verão o deslocamento de um palpite pode
 * não ser o do instante certo.
 */
export function instantFromLocal(date: string, time: string, timeZone: string): string {
  const [ano, mes, dia] = date.split('-').map(Number) as [number, number, number];
  const [hora, minuto] = time.split(':').map(Number) as [number, number];
  const parede = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let utc = parede;
  for (let i = 0; i < 2; i++) utc = parede - deslocamento(utc, timeZone) * 60_000;
  return new Date(utc).toISOString();
}

/** A hora de um instante no fuso: `14:30`. */
export function timeIn(instant: Date | string, timeZone: string): string {
  const momento = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(momento);
}

/** É uma hora `HH:MM` que existe? */
export function isTime(valor: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(valor);
  return m !== null && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}
