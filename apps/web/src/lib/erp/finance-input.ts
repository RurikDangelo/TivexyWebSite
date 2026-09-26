/**
 * O lançamento avulso — conta de luz, aluguel, um serviço prestado —,
 * conferido antes do banco.
 *
 * O que nasce da venda não passa por aqui: o banco o cria, e ele segue a
 * venda. Aqui é o resto do dinheiro da empresa.
 *
 * `hoje` vem de fora — o dia do tenant, não o do servidor —, porque pagamento
 * no futuro é recusado: pagamento é o que aconteceu.
 */

import { FINANCE_DIRECTIONS, type FinanceDirection, isIsoDate, parseCents } from '@tivexy/core';

import { campo, opcional } from '../ids.ts';

export interface FinanceEntryInput {
  direcao: FinanceDirection;
  descricao: string;
  valorCentavos: number;
  vencimento: string;
  contraparte: string | null;
  categoria: string | null;
  pagoEm: string | null;
  observacao: string | null;
}

export type FinanceEntryField =
  | 'direcao'
  | 'descricao'
  | 'valor'
  | 'vencimento'
  | 'contraparte'
  | 'categoria'
  | 'pagoEm'
  | 'observacao';

export type FinanceEntryCheck =
  | { ok: true; valor: FinanceEntryInput }
  | { ok: false; campos: Partial<Record<FinanceEntryField, string>> };

function ehDirecao(valor: string): valor is FinanceDirection {
  return (FINANCE_DIRECTIONS as readonly string[]).includes(valor);
}

export function parseFinanceEntryInput(form: FormData, hoje: string): FinanceEntryCheck {
  const campos: Partial<Record<FinanceEntryField, string>> = {};

  const direcaoBruta = campo(form, 'direcao');
  const direcao: FinanceDirection = ehDirecao(direcaoBruta) ? direcaoBruta : 'payable';
  if (!ehDirecao(direcaoBruta)) campos.direcao = 'A receber ou a pagar?';

  const descricao = campo(form, 'descricao');
  if (descricao === '') campos.descricao = 'O que é — "Aluguel de outubro", "Conta de luz".';
  else if (descricao.length > 160) campos.descricao = 'No máximo 160 caracteres.';

  const valorBruto = campo(form, 'valor');
  const valor = parseCents(valorBruto);
  if (valorBruto === '') campos.valor = 'Quanto?';
  else if (valor === null) campos.valor = 'Valor inválido. Escreva como 1.234,56.';
  else if (valor <= 0) campos.valor = 'Maior que zero.';

  const vencimento = campo(form, 'vencimento');
  if (!isIsoDate(vencimento)) campos.vencimento = 'Escolha a data do vencimento.';

  const contraparte = opcional(form, 'contraparte');
  if (contraparte !== null && contraparte.length > 160) {
    campos.contraparte = 'No máximo 160 caracteres.';
  }

  const categoria = opcional(form, 'categoria');
  if (categoria !== null && categoria.length > 60) campos.categoria = 'No máximo 60 caracteres.';

  let pagoEm: string | null = null;
  if (form.get('jaPago') === 'on') {
    const data = campo(form, 'pagoEm');
    if (!isIsoDate(data)) campos.pagoEm = 'Em que dia o dinheiro se moveu?';
    else if (data > hoje)
      campos.pagoEm = 'Pagamento é o que já aconteceu: a data não pode ser futura.';
    else pagoEm = data;
  }

  const observacao = opcional(form, 'observacao');
  if (observacao !== null && observacao.length > 1000) {
    campos.observacao = 'No máximo 1000 caracteres.';
  }

  if (Object.keys(campos).length > 0 || valor === null) return { ok: false, campos };
  return {
    ok: true,
    valor: {
      direcao,
      descricao,
      valorCentavos: valor,
      vencimento,
      contraparte,
      categoria,
      pagoEm,
      observacao,
    },
  };
}
