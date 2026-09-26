'use client';

import { formatCents } from '@tivexy/core';
import { useEffect, useRef } from 'react';

const FORMATOS = {
  dinheiro: (n: number) => formatCents(Math.round(n)),
  inteiro: (n: number) => Math.round(n).toLocaleString('pt-BR'),
} as const;

export type FormatoDoNumero = keyof typeof FORMATOS;

/**
 * Um número do painel que chega contando, de zero até o valor.
 *
 * O servidor já entrega o valor final — sem JavaScript, é ele que aparece. O
 * movimento só existe para quem não pediu movimento reduzido, dura 700 ms e
 * termina exatamente no valor do banco. O leitor de tela lê o valor final,
 * uma vez: a contagem fica escondida dele.
 */
export function CountUp({
  valor,
  formato = 'inteiro',
  className,
}: {
  valor: number;
  formato?: FormatoDoNumero;
  className?: string;
}) {
  const visivel = useRef<HTMLSpanElement>(null);
  const texto = FORMATOS[formato](valor);

  useEffect(() => {
    const el = visivel.current;
    if (el === null || valor === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const formatar = FORMATOS[formato];
    let inicio: number | null = null;
    let quadro = 0;
    const passo = (agora: number) => {
      inicio ??= agora;
      const p = Math.min(1, (agora - inicio) / 700);
      el.textContent = formatar(valor * (1 - (1 - p) ** 3));
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      el.textContent = formatar(valor);
    };
  }, [valor, formato]);

  return (
    <span className={className}>
      <span ref={visivel} aria-hidden className="tabular-nums">
        {texto}
      </span>
      <span className="sr-only">{texto}</span>
    </span>
  );
}
