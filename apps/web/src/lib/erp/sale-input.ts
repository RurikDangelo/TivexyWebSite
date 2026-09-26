/**
 * O que o formulário de venda manda, conferido antes do banco.
 *
 * Itens e pagamentos chegam como JSON em campos escondidos — a tela monta a
 * venda linha a linha, e o formulário não tem como mandar listas de outro
 * jeito. Aqui se confere a **forma**: ids, quantidades e valores. Preço e
 * unidade não vêm daqui — a ação lê do cadastro, e o banco lê de novo.
 */

import { parseCents, parseQuantity } from '@tivexy/core';

import { campo, idOpcional, isUuid, opcional } from '../ids.ts';

export interface SaleInput {
  itens: { produtoId: string; quantidade: number }[];
  pagamentos: { formaId: string; centavos: number }[];
  clienteId: string | null;
  descontoCentavos: number;
  observacao: string | null;
}

export type SaleField = 'itens' | 'pagamentos' | 'cliente' | 'desconto' | 'observacao';

export type SaleCheck =
  { ok: true; valor: SaleInput } | { ok: false; campos: Partial<Record<SaleField, string>> };

/** Uma venda maior que isso é erro de digitação ou de leitor de código de barras. */
export const MAXIMO_DE_ITENS = 200;

function lista(form: FormData, nome: string): unknown[] | null {
  try {
    const valor: unknown = JSON.parse(campo(form, nome) || '[]');
    return Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : '';
}

export function parseSaleInput(form: FormData): SaleCheck {
  const campos: Partial<Record<SaleField, string>> = {};

  const itensBrutos = lista(form, 'itens');
  const itens: SaleInput['itens'] = [];
  if (itensBrutos === null) campos.itens = 'Não consegui ler os itens. Recarregue a página.';
  else if (itensBrutos.length === 0) campos.itens = 'A venda precisa de pelo menos um item.';
  else if (itensBrutos.length > MAXIMO_DE_ITENS) {
    campos.itens = `No máximo ${MAXIMO_DE_ITENS} itens por venda.`;
  } else {
    for (const bruto of itensBrutos) {
      const item = (bruto ?? {}) as Record<string, unknown>;
      const produtoId = texto(item.produto);
      const quantidade = parseQuantity(texto(item.quantidade));
      if (!isUuid(produtoId) || quantidade === null) {
        campos.itens = 'Há um item com quantidade inválida. Use números como 2 ou 0,5.';
        break;
      }
      itens.push({ produtoId, quantidade });
    }
  }

  const pagamentosBrutos = lista(form, 'pagamentos');
  const pagamentos: SaleInput['pagamentos'] = [];
  if (pagamentosBrutos === null) {
    campos.pagamentos = 'Não consegui ler os pagamentos. Recarregue a página.';
  } else {
    for (const bruto of pagamentosBrutos) {
      const pagamento = (bruto ?? {}) as Record<string, unknown>;
      const formaId = texto(pagamento.forma);
      const centavos = parseCents(texto(pagamento.valor));
      if (!isUuid(formaId)) {
        campos.pagamentos = 'Escolha a forma de cada pagamento.';
        break;
      }
      if (centavos === null || centavos <= 0) {
        campos.pagamentos = 'Cada pagamento precisa de um valor maior que zero.';
        break;
      }
      pagamentos.push({ formaId, centavos });
    }
  }

  const descontoBruto = opcional(form, 'desconto');
  const desconto = descontoBruto === null ? 0 : parseCents(descontoBruto);
  if (desconto === null) campos.desconto = 'Valor inválido. Escreva como 1.234,56.';

  const observacao = opcional(form, 'observacao');
  if (observacao !== null && observacao.length > 500) {
    campos.observacao = 'No máximo 500 caracteres.';
  }

  if (Object.keys(campos).length > 0 || desconto === null) return { ok: false, campos };

  return {
    ok: true,
    valor: {
      itens,
      pagamentos,
      clienteId: idOpcional(form, 'cliente'),
      descontoCentavos: desconto,
      observacao,
    },
  };
}
