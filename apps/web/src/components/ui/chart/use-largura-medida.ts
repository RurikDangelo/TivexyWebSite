'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/*
 * `useLayoutEffect` avisa quando roda no servidor, e um componente de cliente
 * ainda é renderizado lá antes de hidratar. No navegador medimos antes da
 * pintura — é isso que impede o gráfico de aparecer na largura de retaguarda
 * e saltar para a largura real no quadro seguinte.
 */
const useEfeitoDeLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Largura usada enquanto não há medida: no HTML do servidor e no primeiro
 * quadro. 640 é a largura que os gráficos atuais tinham fixa no `viewBox`.
 */
export const LARGURA_DE_RETAGUARDA = 640;

export interface LarguraMedida<T extends HTMLElement> {
  /** Pendure no elemento que define a largura do desenho. */
  ref: RefObject<T | null>;
  /** Largura do conteúdo em pixels de tela, arredondada. */
  largura: number;
  /** `false` no servidor e antes da primeira medida. */
  medido: boolean;
}

/**
 * A largura real do contêiner, em pixels, para o `viewBox` acompanhar.
 *
 * O defeito que isto conserta é contraintuitivo: com `viewBox` fixo e
 * `h-auto w-full`, **alargar a página piora o gráfico** — o SVG escala o
 * desenho inteiro, e a 1600px um rótulo de 11 unidades vira texto de 27px.
 * Medindo o contêiner, o fator de escala é sempre 1,0 e uma unidade do
 * desenho é um pixel da tela.
 */
export function useLarguraMedida<T extends HTMLElement = HTMLDivElement>(
  larguraInicial: number = LARGURA_DE_RETAGUARDA,
): LarguraMedida<T> {
  const ref = useRef<T | null>(null);
  const [estado, setEstado] = useState({ largura: larguraInicial, medido: false });

  useEfeitoDeLayout(() => {
    const alvo = ref.current;
    if (!alvo) return;

    const aplicar = (bruta: number) => {
      /*
       * Arredondar corta o vaivém de subpixel: 1023,33 → 1023,34 repintaria
       * o gráfico inteiro sem mudar um pixel na tela.
       */
      const largura = Math.round(bruta);
      /*
       * Contêiner escondido mede zero. Manter a retaguarda evita um `viewBox`
       * degenerado; o observador avisa de novo quando ele aparecer.
       */
      if (largura <= 0) return;
      setEstado((anterior) =>
        anterior.medido && anterior.largura === largura ? anterior : { largura, medido: true },
      );
    };

    aplicar(alvo.getBoundingClientRect().width);

    // Sem ResizeObserver (ambiente de teste, navegador antigo) o gráfico fica
    // na medida da montagem em vez de não existir.
    if (typeof ResizeObserver === 'undefined') return;

    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (!entrada) return;
      /*
       * `contentBoxSize` já vem sem padding nem borda — é a medida que o
       * `viewBox` precisa. `contentRect` é só retaguarda.
       */
      const caixa = entrada.contentBoxSize?.[0];
      aplicar(caixa ? caixa.inlineSize : entrada.contentRect.width);
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return { ref, largura: estado.largura, medido: estado.medido };
}
