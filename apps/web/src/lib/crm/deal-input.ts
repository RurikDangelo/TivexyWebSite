/**
 * O que o formulário de oportunidade manda, conferido antes do banco.
 *
 * O banco tem as garantias — título não vazio, valor não negativo, etapa do
 * funil certo. Elas chegam como violação de constraint, que não diz a quem
 * preencheu qual campo consertar. Isto existe para a mensagem, não para a
 * garantia.
 */

import { isIsoDate, parseCents } from '@tivexy/core';

import { campo, idOpcional, isUuid, opcional } from '../ids.ts';

export interface DealInput {
  titulo: string;
  valorCentavos: number;
  etapaId: string;
  contaId: string | null;
  pessoaId: string | null;
  responsavelId: string | null;
  previsao: string | null;
  notas: string | null;
}

export type DealField = 'titulo' | 'valor' | 'etapa' | 'previsao' | 'notas';

export type DealCheck =
  { ok: true; valor: DealInput } | { ok: false; campos: Partial<Record<DealField, string>> };

const TITULO_MAX = 200;
const NOTAS_MAX = 5000;

export function parseDealInput(form: FormData): DealCheck {
  const campos: Partial<Record<DealField, string>> = {};

  const titulo = campo(form, 'titulo');
  if (titulo === '') campos.titulo = 'Obrigatório.';
  else if (titulo.length > TITULO_MAX) campos.titulo = `No máximo ${TITULO_MAX} caracteres.`;

  /*
   * Valor em branco é zero, e valor torto é erro. Quem ainda não sabe quanto
   * vale deixa vazio de propósito; quem digitou `1.2.3` errou — transformar
   * os dois em zero esconde o segundo.
   */
  const valorBruto = campo(form, 'valor');
  const valorCentavos = valorBruto === '' ? 0 : parseCents(valorBruto);
  if (valorCentavos === null) campos.valor = 'Não parece um valor. Use 1.234,56.';

  const etapaId = campo(form, 'etapa');
  if (!isUuid(etapaId)) campos.etapa = 'Escolha a etapa.';

  const previsao = opcional(form, 'previsao');
  if (previsao !== null && !isIsoDate(previsao)) campos.previsao = 'Data inválida.';

  const notas = opcional(form, 'notas');
  if (notas !== null && notas.length > NOTAS_MAX) {
    campos.notas = `No máximo ${NOTAS_MAX} caracteres.`;
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };

  return {
    ok: true,
    valor: {
      titulo,
      valorCentavos: valorCentavos ?? 0,
      etapaId,
      contaId: idOpcional(form, 'conta'),
      pessoaId: idOpcional(form, 'pessoa'),
      responsavelId: idOpcional(form, 'responsavel'),
      previsao,
      notas,
    },
  };
}
