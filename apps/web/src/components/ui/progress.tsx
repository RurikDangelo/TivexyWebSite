import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Barra de progresso e de medida (P14 do DESIGN_SYSTEM).
 *
 * Server Component: cor, raio, trilho e a animação de primeira pintura são CSS
 * puro. Nada aqui justifica `'use client'`.
 */

/* Só a barra recebe cor; o trilho é sempre `--surface-sunken`. */
const TOM_DA_BARRA = {
  brand: 'bg-surface-brand',
  neutral: 'bg-content-subtle',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

/*
 * Duas alturas e só duas, como a regra de densidade da seção 5: `densa` para
 * barra dentro de linha de lista, `larga` para a barra que é o assunto do bloco.
 */
const ALTURA = {
  densa: 'h-1.5',
  larga: 'h-2.5',
} as const;

/** Sem número não há barra cheia — o trilho vazio é a resposta honesta. */
const SEM_VALOR = 'sem valor para mostrar';

export interface ProgressProps extends Omit<ComponentProps<'div'>, 'children' | 'role'> {
  /**
   * `null` quando o número não pôde ser lido (soma truncada por `.limit()`,
   * contagem que falhou). Rende trilho vazio e diz que está vazio — nunca zero
   * disfarçado de dado.
   */
  valor: number | null;
  maximo?: number;
  tom?: keyof typeof TOM_DA_BARRA;
  densidade?: keyof typeof ALTURA;
  /** Nome acessível. Obrigatório: a barra à mão do funil não tinha nenhum. */
  rotulo: string;
  /**
   * O que o leitor de tela anuncia no lugar da porcentagem. Com `maximo`
   * diferente de 100, "25%" informa menos que "3 de 12 passos".
   */
  descricaoDoValor?: string;
  /**
   * `progresso` é tarefa que caminha para o fim; `medida` é quantidade dentro
   * de uma faixa conhecida (etapa de funil, ocupação de estoque). Papéis ARIA
   * diferentes porque são coisas diferentes, e o leitor de tela distingue.
   */
  semantica?: 'progresso' | 'medida';
  /**
   * Coreografia da seção 8: a barra enche uma vez, na primeira pintura. Passe
   * `false` quando a tela rerenderiza por filtro ou paginação.
   */
  animar?: boolean;
  /** Atraso de entrada em lista — use `atrasoDaLinha(i)` de `lib/utils`. */
  atraso?: string;
}

export function Progress({
  valor,
  maximo = 100,
  tom = 'brand',
  densidade = 'larga',
  rotulo,
  descricaoDoValor,
  semantica = 'progresso',
  animar = true,
  atraso,
  className,
  ...props
}: ProgressProps) {
  /* `maximo` zerado ou negativo não define faixa nenhuma: vira indeterminado. */
  const teto = maximo > 0 ? maximo : 0;
  const atual = valor === null || teto === 0 ? null : Math.min(Math.max(valor, 0), teto);
  const porcentagem = atual === null ? 0 : (atual / teto) * 100;

  /*
   * `meter` exige `aria-valuenow`; indeterminado só existe em `progressbar`.
   * Sem valor, a medida cai para progressbar em vez de virar ARIA inválida.
   */
  const papel = atual !== null && semantica === 'medida' ? 'meter' : 'progressbar';

  return (
    /*
     * O spread vem primeiro de propósito: a ARIA é o motivo deste componente
     * existir, e um `aria-label` solto no ponto de uso não pode apagá-la.
     */
    <div
      {...props}
      role={papel}
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={teto}
      aria-valuenow={atual ?? undefined}
      aria-valuetext={atual === null ? SEM_VALOR : descricaoDoValor}
      className={cn(
        'w-full overflow-hidden rounded-pill bg-surface-sunken',
        ALTURA[densidade],
        className,
      )}
    >
      {atual !== null && atual > 0 && (
        <div
          className={cn(
            'h-full origin-left rounded-pill',
            TOM_DA_BARRA[tom],
            animar && 'animate-fill',
          )}
          style={{
            width: `${porcentagem}%`,
            /* Um valor pequeno mas real tem de aparecer; 0,1% viraria nada. */
            minWidth: '0.25rem',
            animationDelay: atraso,
          }}
        />
      )}
    </div>
  );
}
