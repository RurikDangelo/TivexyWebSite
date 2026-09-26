/**
 * O que o formulário de produto manda, conferido antes do banco.
 *
 * As regras são as do Core — `parseCents` para dinheiro, `parseQuantity` e
 * `checkQuantity` para o mínimo de estoque — e as do banco são as mesmas: o
 * teste de contratos confere unidade e fração dos dois lados.
 */

import {
  type ProductUnit,
  checkQuantity,
  isProductUnit,
  parseCents,
  parseQuantity,
} from '@tivexy/core';

import { campo, idOpcional, opcional } from '../ids.ts';

export interface ProductInput {
  nome: string;
  categoriaId: string | null;
  unidade: ProductUnit;
  precoCentavos: number;
  custoCentavos: number | null;
  sku: string | null;
  codigoDeBarras: string | null;
  /**
   * `null` quando o formulário não mostrou a escolha — tenant sem o módulo de
   * estoque. Aí quem salva não mexe no que está gravado: desligar o controle
   * de todo produto porque o interruptor estava escondido seria perder a
   * configuração no dia em que o módulo for contratado.
   */
  controlaEstoque: boolean | null;
  estoqueMinimo: number | null;
  descricao: string | null;
}

export type ProductField =
  'nome' | 'unidade' | 'preco' | 'custo' | 'sku' | 'codigoDeBarras' | 'estoqueMinimo' | 'descricao';

export type ProductCheck =
  { ok: true; valor: ProductInput } | { ok: false; campos: Partial<Record<ProductField, string>> };

const FORMATO_DINHEIRO = 'Valor inválido. Escreva como 1.234,56.';
const CODIGO_DE_BARRAS = /^[0-9A-Za-z.-]{3,64}$/;

/** "0", "0,0", "0,000": sem mínimo. Zero de mínimo é o mesmo que não ter. */
function ehZero(raw: string): boolean {
  return /^0+([.,]0*)?$/.test(raw.trim());
}

export function parseProductInput(form: FormData): ProductCheck {
  const campos: Partial<Record<ProductField, string>> = {};

  const nome = campo(form, 'nome');
  if (nome === '') campos.nome = 'Obrigatório.';
  else if (nome.length > 160) campos.nome = 'No máximo 160 caracteres.';

  const unidadeBruta = campo(form, 'unidade');
  const unidade: ProductUnit = isProductUnit(unidadeBruta) ? unidadeBruta : 'un';
  if (!isProductUnit(unidadeBruta)) campos.unidade = 'Escolha uma unidade da lista.';

  const precoBruto = campo(form, 'preco');
  const preco = parseCents(precoBruto);
  if (precoBruto === '') campos.preco = 'Informe o preço — 0,00 se não é cobrado.';
  else if (preco === null) campos.preco = FORMATO_DINHEIRO;

  const custoBruto = opcional(form, 'custo');
  const custo = custoBruto === null ? null : parseCents(custoBruto);
  if (custoBruto !== null && custo === null) campos.custo = FORMATO_DINHEIRO;

  const sku = opcional(form, 'sku');
  if (sku !== null && sku.length > 60) campos.sku = 'No máximo 60 caracteres.';

  const barrasBruto = opcional(form, 'codigoDeBarras');
  const codigoDeBarras = barrasBruto === null ? null : barrasBruto.replace(/\s/g, '');
  if (codigoDeBarras !== null && !CODIGO_DE_BARRAS.test(codigoDeBarras)) {
    campos.codigoDeBarras = 'Só números e letras, de 3 a 64.';
  }

  const naTela = form.get('controlaEstoqueNaTela') === '1';
  const controlaEstoque = naTela ? form.get('controlaEstoque') === 'on' : null;

  let estoqueMinimo: number | null = null;
  const minimoBruto = opcional(form, 'estoqueMinimo');
  if (minimoBruto !== null && !ehZero(minimoBruto) && controlaEstoque !== false) {
    const minimo = parseQuantity(minimoBruto);
    if (minimo === null) campos.estoqueMinimo = 'Quantidade inválida. Escreva como 12 ou 0,5.';
    else {
      const problema = campos.unidade === undefined ? checkQuantity(minimo, unidade) : null;
      if (problema !== null) campos.estoqueMinimo = `Mínimo inteiro: ${problema}.`;
      else estoqueMinimo = minimo;
    }
  }

  const descricao = opcional(form, 'descricao');
  if (descricao !== null && descricao.length > 2000) {
    campos.descricao = 'No máximo 2000 caracteres.';
  }

  if (Object.keys(campos).length > 0 || preco === null) return { ok: false, campos };

  return {
    ok: true,
    valor: {
      nome,
      categoriaId: idOpcional(form, 'categoria'),
      unidade,
      precoCentavos: preco,
      custoCentavos: custo,
      sku,
      codigoDeBarras,
      controlaEstoque,
      estoqueMinimo,
      descricao,
    },
  };
}

/**
 * Qual campo a unicidade recusou, pelo nome do índice na mensagem do banco.
 *
 * Código interno e código de barras são únicos por tenant; o erro do
 * PostgREST traz o nome do índice, e é ele que diz qual dos dois repetiu.
 */
export function campoRepetido(mensagem: string | null | undefined): ProductField | null {
  const m = mensagem ?? '';
  if (m.includes('erp_products_sku_per_tenant')) return 'sku';
  if (m.includes('erp_products_barcode_per_tenant')) return 'codigoDeBarras';
  return null;
}
