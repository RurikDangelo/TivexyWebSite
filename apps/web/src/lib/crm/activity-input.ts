/**
 * O que o formulário de atividade manda, conferido antes do banco.
 *
 * ## Uma atividade fala de exatamente uma coisa
 *
 * O esquema tem quatro colunas de alvo e um check exigindo exatamente uma. O
 * formulário manda o alvo como `tipo:id` num campo só — não há como mandar
 * dois, nem nenhum sem que a conferência daqui diga qual falta.
 *
 * ## Dia sem hora
 *
 * `due_at` é um instante. Uma tarefa "para sexta", sem hora, gravada às 9h
 * apareceria atrasada desde as 9h de sexta. Gravada às 23h59 do fuso do
 * tenant, ela só atrasa quando a sexta acaba — que é o que "para sexta" quer
 * dizer. A tela reconhece 23h59 e mostra "o dia todo".
 */

import { instantFromLocal, isIsoDate, isTime } from '@tivexy/core';

import { campo, idOpcional, isUuid, opcional } from '../ids.ts';

export const DIA_TODO = '23:59';

export const ALVOS = {
  lead: 'lead_id',
  contato: 'contact_id',
  conta: 'company_id',
  negocio: 'deal_id',
} as const;

export type TipoDeAlvo = keyof typeof ALVOS;
export type ColunaDeAlvo = (typeof ALVOS)[TipoDeAlvo];

export interface Alvo {
  tipo: TipoDeAlvo;
  coluna: ColunaDeAlvo;
  id: string;
}

/**
 * `contato:9f…` → o alvo, ou `null` para qualquer coisa torta.
 *
 * `Object.hasOwn`, e não `in`: `'__proto__' in ALVOS` é verdadeiro, porque
 * `in` sobe pela cadeia de protótipos. O nome da coluna sai daqui direto para
 * o `insert`.
 */
export function parseTarget(bruto: string): Alvo | null {
  const [tipo, id] = bruto.split(':');
  if (tipo === undefined || !Object.hasOwn(ALVOS, tipo) || !isUuid(id)) return null;
  return { tipo: tipo as TipoDeAlvo, coluna: ALVOS[tipo as TipoDeAlvo], id };
}

export interface ActivityInput {
  assunto: string;
  tipoId: string | null;
  alvo: Alvo;
  /** Instante em UTC, já convertido do fuso do tenant. */
  venceEm: string | null;
  responsavelId: string | null;
  notas: string | null;
}

export type ActivityField = 'assunto' | 'alvo' | 'data' | 'hora' | 'notas';

export type ActivityCheck =
  | { ok: true; valor: ActivityInput }
  | { ok: false; campos: Partial<Record<ActivityField, string>> };

export function parseActivityInput(form: FormData, timeZone: string): ActivityCheck {
  const campos: Partial<Record<ActivityField, string>> = {};

  const assunto = campo(form, 'assunto');
  if (assunto === '') campos.assunto = 'Obrigatório.';
  else if (assunto.length > 200) campos.assunto = 'No máximo 200 caracteres.';

  const alvo = parseTarget(campo(form, 'alvo'));
  if (alvo === null) campos.alvo = 'Escolha sobre quem, ou sobre o quê.';

  const data = opcional(form, 'data');
  const hora = opcional(form, 'hora');
  if (data !== null && !isIsoDate(data)) campos.data = 'Data inválida.';
  if (hora !== null && !isTime(hora)) campos.hora = 'Hora inválida.';
  if (hora !== null && data === null) campos.data = 'Informe o dia da hora marcada.';

  const notas = opcional(form, 'notas');
  if (notas !== null && notas.length > 5000) campos.notas = 'No máximo 5000 caracteres.';

  if (Object.keys(campos).length > 0 || alvo === null) return { ok: false, campos };

  return {
    ok: true,
    valor: {
      assunto,
      tipoId: idOpcional(form, 'tipo'),
      alvo,
      venceEm: data === null ? null : instantFromLocal(data, hora ?? DIA_TODO, timeZone),
      responsavelId: idOpcional(form, 'responsavel'),
      notas,
    },
  };
}
