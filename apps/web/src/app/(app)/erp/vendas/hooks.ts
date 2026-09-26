'use client';

/**
 * O estado do balcão, fora do JSX.
 *
 * `SaleForm` tinha 658 linhas num corpo só, com doze chamadas de estado
 * misturadas à marcação — não dava para mexer na coluna de itens sem reler o
 * arquivo inteiro. Carrinho e caixa viram dois ganchos com contrato explícito;
 * quem desenha volta a desenhar.
 *
 * Nenhum dos dois inventa preço: o que entra na conta é o `precoCentavos` que
 * veio do cadastro, e a Server Action lê o preço de novo no banco antes de
 * gravar. A tela é uma previsão fiel, não a fonte.
 */

import {
  type ProductUnit,
  UNIT_INFO,
  checkQuantity,
  formatCentsInput,
  isProductUnit,
  lineTotalCents,
  parseCents,
  parseQuantity,
  saleTotals,
} from '@tivexy/core';
import { useMemo, useState } from 'react';

import type { FormaNaVenda, ProdutoNaVenda } from './state';

/*
 * Chave de linha própria, não o id do produto: duas linhas do mesmo produto
 * fracionado são legítimas (dois pesos diferentes na mesma venda), e o React
 * precisa distinguir as duas sem remontar o campo enquanto se digita.
 */
let sequencia = 0;
const novaChave = () => `k${++sequencia}`;

export interface LinhaDaVenda {
  chave: string;
  produtoId: string;
  /** O que está DIGITADO, não o número: "0," é um estado intermediário legítimo. */
  quantidade: string;
}

export interface ItemDaVenda {
  chave: string;
  /** `undefined` quando o produto saiu do cadastro entre a carga e o registro. */
  produto: ProdutoNaVenda | undefined;
  unidade: ProductUnit;
  fracionada: boolean;
  digitado: string;
  /** `null` enquanto `problema` não for `null`. */
  quantidade: number | null;
  problema: string | null;
  totalCentavos: number | null;
}

export interface Carrinho {
  itens: readonly ItemDaVenda[];
  vazio: boolean;
  /** Toda linha tem produto conhecido e quantidade válida. */
  completo: boolean;
  subtotalCentavos: number;
  /**
   * O total depois do desconto, por `saleTotals` — a mesma função que a Server
   * Action e o banco usam. Subtrair à mão aqui abriria a porta para a tela
   * mostrar um total e o registro gravar outro.
   */
  totalComDesconto: (descontoCentavos: number) => number;
  /** O campo escondido que a Server Action lê. */
  json: string;
  /** Devolve a linha tocada, para quem chama decidir o foco e o aviso. */
  adicionar: (produto: ProdutoNaVenda) => { chave: string; fracionada: boolean };
  mudarQuantidade: (chave: string, quantidade: string) => void;
  passo: (chave: string, delta: number) => void;
  /** Devolve o nome do que saiu, ou `null` — é o que o aviso falado precisa dizer. */
  tirar: (chave: string) => string | null;
}

export function useSaleLines(produtos: readonly ProdutoNaVenda[]): Carrinho {
  const [linhas, setLinhas] = useState<LinhaDaVenda[]>([]);
  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const itens: ItemDaVenda[] = linhas.map((linha) => {
    const produto = porId.get(linha.produtoId);
    const unidade: ProductUnit =
      produto !== undefined && isProductUnit(produto.unidade) ? produto.unidade : 'un';
    const quantidade = parseQuantity(linha.quantidade);
    const problema =
      linha.quantidade.trim() === ''
        ? 'Quanto?'
        : quantidade === null
          ? 'Quantidade inválida'
          : checkQuantity(quantidade, unidade);
    const valida = problema === null ? quantidade : null;
    return {
      chave: linha.chave,
      produto,
      unidade,
      fracionada: UNIT_INFO[unidade].fracionada,
      digitado: linha.quantidade,
      quantidade: valida,
      problema,
      totalCentavos:
        valida === null || produto === undefined
          ? null
          : lineTotalCents(valida, produto.precoCentavos),
    };
  });

  /* Linha sem quantidade válida entra como zero: o subtotal parcial é honesto, e o botão de registrar está travado de qualquer forma. */
  const paraSomar = itens.map((i) => ({
    quantidade: i.quantidade ?? 0,
    precoCentavos: i.produto?.precoCentavos ?? 0,
  }));
  const { subtotal } = saleTotals(paraSomar, 0);

  function adicionar(produto: ProdutoNaVenda): { chave: string; fracionada: boolean } {
    const unidade: ProductUnit = isProductUnit(produto.unidade) ? produto.unidade : 'un';
    const fracionada = UNIT_INFO[unidade].fracionada;
    const existente = linhas.find((l) => l.produtoId === produto.id);
    const chave = existente?.chave ?? novaChave();

    if (existente === undefined) {
      setLinhas([...linhas, { chave, produtoId: produto.id, quantidade: fracionada ? '' : '1' }]);
    } else if (!fracionada) {
      /* Bipar de novo o mesmo código é "mais um", não "outra linha igual". */
      setLinhas(
        linhas.map((l) =>
          l.chave === chave
            ? { ...l, quantidade: String((parseQuantity(l.quantidade) ?? 0) + 1) }
            : l,
        ),
      );
    }
    return { chave, fracionada };
  }

  function mudarQuantidade(chave: string, quantidade: string) {
    setLinhas(linhas.map((l) => (l.chave === chave ? { ...l, quantidade } : l)));
  }

  function passo(chave: string, delta: number) {
    setLinhas(
      linhas.map((l) => {
        if (l.chave !== chave) return l;
        const atual = parseQuantity(l.quantidade) ?? 0;
        return { ...l, quantidade: String(Math.max(1, atual + delta)) };
      }),
    );
  }

  function tirar(chave: string): string | null {
    const linha = linhas.find((l) => l.chave === chave);
    setLinhas(linhas.filter((l) => l.chave !== chave));
    return linha === undefined ? null : (porId.get(linha.produtoId)?.nome ?? null);
  }

  return {
    itens,
    vazio: linhas.length === 0,
    completo:
      itens.length > 0 && itens.every((i) => i.problema === null && i.produto !== undefined),
    subtotalCentavos: subtotal,
    totalComDesconto: (descontoCentavos) => saleTotals(paraSomar, descontoCentavos).total,
    json: JSON.stringify(linhas.map((l) => ({ produto: l.produtoId, quantidade: l.quantidade }))),
    adicionar,
    mudarQuantidade,
    passo,
    tirar,
  };
}

export interface PagamentoDaVenda {
  chave: string;
  formaId: string;
  valor: string;
  /** Só para dinheiro: quanto o cliente entregou, para calcular o troco. */
  recebido: string;
}

export interface Caixa {
  pagamentos: readonly PagamentoDaVenda[];
  /** O valor do pagamento `indice` — que pode ser o total espelhado, ainda não digitado. */
  valorDe: (indice: number) => string;
  pagoCentavos: number;
  /** Positivo falta receber; negativo passou do total. */
  diferencaCentavos: number;
  fechado: boolean;
  dividido: boolean;
  json: string;
  mudar: (chave: string, parte: Partial<PagamentoDaVenda>) => void;
  dividir: () => void;
  tirar: (chave: string) => void;
}

export function usePayments(formas: readonly FormaNaVenda[], totalCentavos: number): Caixa {
  const [pagamentos, setPagamentos] = useState<PagamentoDaVenda[]>(() => [
    { chave: novaChave(), formaId: formas[0]?.id ?? '', valor: '', recebido: '' },
  ]);
  /* Enquanto ninguém tocou no valor, o pagamento único acompanha o total. */
  const [valorEditado, setValorEditado] = useState(false);

  const valorDe = (indice: number): string =>
    pagamentos.length === 1 && !valorEditado
      ? totalCentavos > 0
        ? formatCentsInput(totalCentavos)
        : ''
      : (pagamentos[indice]?.valor ?? '');

  const pago = pagamentos.reduce((soma, _p, i) => soma + (parseCents(valorDe(i)) ?? 0), 0);

  function mudar(chave: string, parte: Partial<PagamentoDaVenda>) {
    /* Digitar no valor do pagamento único desliga o espelho — a partir daí o número é de quem digitou. */
    if (parte.valor !== undefined && pagamentos.length === 1) setValorEditado(true);
    setPagamentos(pagamentos.map((p) => (p.chave === chave ? { ...p, ...parte } : p)));
  }

  function dividir() {
    /* Quem divide assume os valores: o primeiro fica com o que já estava mostrando. */
    setPagamentos([
      ...pagamentos.map((p, i) => ({ ...p, valor: valorDe(i) })),
      {
        chave: novaChave(),
        formaId: formas[1]?.id ?? formas[0]?.id ?? '',
        valor: '',
        recebido: '',
      },
    ]);
    setValorEditado(true);
  }

  function tirar(chave: string) {
    const restantes = pagamentos.filter((p) => p.chave !== chave);
    setPagamentos(restantes);
    /* Voltou a ser um só: o espelho do total volta a valer. */
    if (restantes.length === 1) setValorEditado(false);
  }

  return {
    pagamentos,
    valorDe,
    pagoCentavos: pago,
    diferencaCentavos: totalCentavos - pago,
    fechado:
      totalCentavos - pago === 0 &&
      pagamentos.every((p, i) => valorDe(i) === '' || p.formaId !== ''),
    dividido: pagamentos.length > 1,
    json: JSON.stringify(
      pagamentos
        .map((p, i) => ({ forma: p.formaId, valor: valorDe(i) }))
        .filter((p) => p.valor !== '' && (parseCents(p.valor) ?? 0) > 0),
    ),
    mudar,
    dividir,
    tirar,
  };
}
