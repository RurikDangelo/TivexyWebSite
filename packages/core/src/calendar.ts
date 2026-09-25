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
