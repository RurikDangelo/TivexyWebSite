'use client';

import { formatCents } from '@tivexy/core';
import { ScanBarcode } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';

import { Combobox, type OpcaoDoCombobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/input';

import type { ProdutoNaVenda } from './state';

/**
 * Id fixo, não `useId`: o campo de busca é único na tela e precisa ser
 * alcançável de fora — a quantidade devolve o foco para cá com Enter, e o
 * `<Combobox>` não expõe `ref` para o `<input>`.
 */
export const ID_DA_BUSCA = 'busca-de-produto';

/** Devolve o foco ao balcão. Usada depois de tirar um item e depois de fechar um painel. */
export function focarBusca(): void {
  document.getElementById(ID_DA_BUSCA)?.focus();
}

/** "acucar" acha "Açúcar". */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Mais que isto e a lista deixa de ser escolha e vira rolagem. */
const MAXIMO_NA_LISTA = 8;

/** Valor reservado do aviso de truncagem: nunca é um id de produto, e é inescolhível. */
const MAIS_RESULTADOS = '__mais__';

export interface ProductSearchProps {
  produtos: readonly ProdutoNaVenda[];
  /** Vocabulário do nicho, já resolvido: "produto", "serviço", "peça". */
  rotuloProduto: string;
  aoAdicionar: (produto: ProdutoNaVenda) => void;
}

/**
 * O buscador do balcão: nome, código interno ou leitor de código de barras.
 *
 * Duas mudanças em relação ao que havia aqui:
 *
 * 1. **A lista é sobreposição.** Antes o painel de resultados entrava no fluxo
 *    e empurrava o carrinho inteiro ~330px para baixo a cada tecla, na tela que
 *    mais se opera sem olhar. O `<Combobox>` paira; nada abaixo se mexe.
 * 2. **É um combobox de verdade** — `role="combobox"`, `aria-expanded`,
 *    `aria-activedescendant`, setas e Escape. Antes a lista não estava associada
 *    ao campo, e quem usa leitor de tela digitava sem ouvir nada.
 *
 * O caminho do leitor de código de barras é tratado **antes** do combobox, na
 * fase de captura: o aparelho digita e manda Enter em poucos milissegundos, e o
 * combobox ainda não teria terminado de buscar. Com o código exato em mãos a
 * busca é desnecessária — o produto entra na hora, sem corrida.
 */
export function ProductSearch({ produtos, rotuloProduto, aoAdicionar }: ProductSearchProps) {
  /*
   * A chave que remonta o campo depois de um bipe.
   *
   * O combobox limpa o texto sozinho quando a escolha sai dele (`escolher`),
   * mas o caminho do código exato não passa por lá. Sem limpar, o próximo bipe
   * emendaria no anterior e nenhum dos dois códigos existiria no cadastro.
   * Remontar zera o texto e o `autoFocus` devolve o cursor ao campo, que é o
   * gesto seguinte do balcão.
   */
  const [bipe, setBipe] = useState(0);

  function buscar(texto: string): readonly OpcaoDoCombobox[] {
    const bruto = texto.trim();
    if (bruto === '') return [];
    const termo = semAcento(bruto);

    const achados = produtos.filter(
      (p) =>
        semAcento(p.nome).includes(termo) ||
        (p.sku !== null && semAcento(p.sku) === termo) ||
        p.codigoDeBarras === bruto,
    );

    const opcoes: OpcaoDoCombobox[] = achados.slice(0, MAXIMO_NA_LISTA).map((p) => ({
      valor: p.id,
      rotulo: p.nome,
      descricao: p.sku ?? p.codigoDeBarras ?? undefined,
      detalhe: `${formatCents(p.precoCentavos)} / ${p.unidade}`,
    }));

    /*
     * A lista cortada tem de dizer que foi cortada. Oito de trinta e sete
     * apresentados como se fossem tudo é a mesma classe de mentira que exibir
     * soma truncada como total (CLAUDE.md).
     */
    if (achados.length > MAXIMO_NA_LISTA) {
      opcoes.push({
        valor: MAIS_RESULTADOS,
        rotulo: `mais ${achados.length - MAXIMO_NA_LISTA} — escreva mais para ver`,
        desabilitado: true,
      });
    }
    return opcoes;
  }

  /** Só o código exato. Nome parcial é escolha, e escolha é do combobox. */
  function porCodigoExato(texto: string): ProdutoNaVenda | undefined {
    const bruto = texto.trim();
    if (bruto === '') return undefined;
    const termo = semAcento(bruto);
    return produtos.find(
      (p) => p.codigoDeBarras === bruto || (p.sku !== null && semAcento(p.sku) === termo),
    );
  }

  function aoTeclarNaCaptura(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== 'Enter') return;
    const campo = evento.target;
    if (!(campo instanceof HTMLInputElement)) return;

    const achado = porCodigoExato(campo.value);
    /* Sem código exato, o Enter segue para o combobox, que escolhe a opção em destaque. */
    if (achado === undefined) return;

    evento.preventDefault();
    evento.stopPropagation();
    aoAdicionar(achado);
    setBipe((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ID_DA_BUSCA}>Adicionar {rotuloProduto}</Label>
      {/*
       * O `<div>` só carrega a captura. Quem recebe o teclado é o `<input>` do
       * combobox, que já tem papel, foco e nome acessível — o invólucro não
       * acrescenta nem esconde nada da árvore de acessibilidade.
       */}
      <div onKeyDownCapture={aoTeclarNaCaptura}>
        <Combobox
          key={bipe}
          id={ID_DA_BUSCA}
          rotulo={`Adicionar ${rotuloProduto}`}
          placeholder="Nome, código ou leitor de código de barras"
          Icone={ScanBarcode}
          size="lg"
          autoFocus
          limparAoEscolher
          /*
           * Zero: a busca varre uma lista já em memória, não vai à rede. Esperar
           * 180ms entre a última tecla e o resultado abriria a mesma corrida com
           * o Enter que o caminho do código exato existe para fechar.
           */
          atrasoMs={0}
          buscar={buscar}
          aoEscolher={(opcao) => {
            if (opcao === null || opcao.valor === MAIS_RESULTADOS) return;
            const produto = produtos.find((p) => p.id === opcao.valor);
            if (produto !== undefined) aoAdicionar(produto);
          }}
          inicialRotulo="Passe o leitor, ou escreva o nome."
          aria-describedby={`${ID_DA_BUSCA}-dica`}
        />
      </div>
      <p id={`${ID_DA_BUSCA}-dica`} className="text-caption text-content-subtle">
        Enter adiciona o código exato — ou o primeiro da lista.
      </p>
    </div>
  );
}
