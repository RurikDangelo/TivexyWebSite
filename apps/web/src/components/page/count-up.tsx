'use client';

import { formatCents } from '@tivexy/core';
import { useEffect, useRef } from 'react';

const FORMATOS = {
  dinheiro: (n: number) => formatCents(Math.round(n)),
  inteiro: (n: number) => Math.round(n).toLocaleString('pt-BR'),
} as const;

export type FormatoDoNumero = keyof typeof FORMATOS;

/**
 * Espelha `--duration-data` (seção 8). O token mora no CSS e não é legível do JS
 * sem um `getComputedStyle` por número montado — o custo não paga a indireção.
 */
const DURACAO_MS = 560;

export interface CountUpProps {
  valor: number;
  formato?: FormatoDoNumero;
  className?: string;
}

/**
 * Um número que conta até o novo valor **quando o valor muda**.
 *
 * O servidor entrega o número final no HTML, e é ele que fica: sem JavaScript,
 * com movimento reduzido ou em leitor de tela, o que se lê é o valor do banco.
 *
 * Por que não contar na montagem: a marca já foi pintada com o valor final
 * antes da hidratação. Começar do zero ali significa ver o número correto
 * *voltar* para zero — o oposto do que a contagem deveria comunicar. Por isso a
 * primeira renderização só registra o ponto de partida; a animação existe para
 * a troca de período, de filtro, de recorte, que é quando há um antes e um
 * depois. A entrada da tela é do container (seção 8, regra 1 — um evento de
 * entrada por tela, nunca dois sistemas ao mesmo tempo).
 */
export function CountUp({ valor, formato = 'inteiro', className }: CountUpProps) {
  const visivel = useRef<HTMLSpanElement>(null);
  /** `null` enquanto não houve navegação anterior nesta instância. */
  const anterior = useRef<number | null>(null);
  const texto = FORMATOS[formato](valor);

  useEffect(() => {
    const el = visivel.current;
    const partida = anterior.current;
    anterior.current = valor;
    if (el === null || partida === null || partida === valor) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const formatar = FORMATOS[formato];
    const distancia = valor - partida;
    let inicio: number | null = null;
    let quadro = 0;
    const passo = (agora: number) => {
      inicio ??= agora;
      const p = Math.min(1, (agora - inicio) / DURACAO_MS);
      /* Cúbica de saída: arranca e freia no fim, para o olho pousar no valor certo. */
      el.textContent = formatar(partida + distancia * (1 - (1 - p) ** 3));
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      /* Desmontar no meio da contagem não pode deixar um número parcial na tela. */
      el.textContent = formatar(valor);
    };
  }, [valor, formato]);

  return (
    <span className={className}>
      {/*
       * Dois spans: o visível é escrito quadro a quadro e fica fora da árvore de
       * acessibilidade; o `sr-only` carrega o valor final e nunca muda durante a
       * contagem, então o leitor de tela anuncia um número, não uma enxurrada.
       */}
      <span ref={visivel} aria-hidden className="tabular-nums">
        {texto}
      </span>
      <span className="sr-only">{texto}</span>
    </span>
  );
}
