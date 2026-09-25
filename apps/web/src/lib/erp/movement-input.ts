/**
 * O que o formulário de movimentação manda, conferido antes do banco.
 *
 * À mão, só três tipos: entrada, saída e contagem. Baixa e devolução de venda
 * nascem da venda — o RLS nem aceita que alguém as escreva.
 *
 * A unidade vem do cadastro, lido no servidor, e não do formulário: é ela que
 * decide se 1,5 é quantidade ou erro de digitação.
 */

import { type ProductUnit, checkQuantity, parseCents, parseQuantity } from '@tivexy/core';

import { campo, isUuid, opcional } from '../ids.ts';

export const TIPOS_A_MAO = ['in', 'out', 'adjustment'] as const;
export type TipoAMao = (typeof TIPOS_A_MAO)[number];

export function isTipoAMao(valor: unknown): valor is TipoAMao {
  return typeof valor === 'string' && (TIPOS_A_MAO as readonly string[]).includes(valor);
}

export interface MovementInput {
  produtoId: string;
  tipo: TipoAMao;
  /**
   * Com o sinal do tipo, pronta para gravar: entrada positiva, saída
   * negativa. Na contagem é zero — o banco calcula a diferença contra o saldo.
   */
  quantidade: number;
  /** Só na contagem: o que foi contado. Zero vale — "contei, não tem nenhum". */
  contada: number | null;
  custoCentavos: number | null;
  motivo: string | null;
}

export type MovementField = 'produto' | 'tipo' | 'quantidade' | 'custo' | 'motivo';

export type MovementCheck =
  | { ok: true; valor: MovementInput }
  | { ok: false; campos: Partial<Record<MovementField, string>> };

/** "0", "0,0": contagem de nada. `parseQuantity` recusa zero de propósito. */
function ehZero(raw: string): boolean {
  return /^0+([.,]0*)?$/.test(raw.trim());
}

export function parseMovementInput(form: FormData, unidade: ProductUnit): MovementCheck {
  const campos: Partial<Record<MovementField, string>> = {};

  const produtoId = campo(form, 'produto');
  if (!isUuid(produtoId)) campos.produto = 'Escolha da lista.';

  const tipoBruto = campo(form, 'tipo');
  const tipo: TipoAMao = isTipoAMao(tipoBruto) ? tipoBruto : 'in';
  if (!isTipoAMao(tipoBruto)) campos.tipo = 'Escolha entrada, saída ou contagem.';

  let quantidade = 0;
  let contada: number | null = null;
  const bruta = campo(form, 'quantidade');
  if (bruta === '') {
    campos.quantidade = tipo === 'adjustment' ? 'Quanto foi contado — 0 se não tem.' : 'Quanto?';
  } else if (tipo === 'adjustment' && ehZero(bruta)) {
    contada = 0;
  } else {
    const q = parseQuantity(bruta);
    const problema = q === null ? null : checkQuantity(q, unidade);
    if (q === null) campos.quantidade = 'Quantidade inválida. Escreva como 12 ou 0,5.';
    else if (problema !== null) campos.quantidade = `Em número inteiro: ${problema}.`;
    else if (tipo === 'adjustment') contada = q;
    else quantidade = tipo === 'out' ? -q : q;
  }

  const custoBruto = tipo === 'in' ? opcional(form, 'custo') : null;
  const custoCentavos = custoBruto === null ? null : parseCents(custoBruto);
  if (custoBruto !== null && custoCentavos === null) {
    campos.custo = 'Valor inválido. Escreva como 1.234,56.';
  }

  const motivo = opcional(form, 'motivo');
  if (tipo === 'out' && motivo === null) {
    campos.motivo = 'Diga o motivo — perda, quebra, consumo, validade.';
  } else if (motivo !== null && motivo.length > 200) {
    campos.motivo = 'No máximo 200 caracteres.';
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return { ok: true, valor: { produtoId, tipo, quantidade, contada, custoCentavos, motivo } };
}
