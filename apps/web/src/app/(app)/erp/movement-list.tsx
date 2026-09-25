import { type ProductUnit, formatQuantity } from '@tivexy/core';
import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface MovimentoNaTela {
  id: string;
  /** "Entrada", "Contagem", "Venda nº 12" — já no vocabulário do tenant. */
  rotulo: string;
  quantidade: number;
  contado: number | null;
  motivo: string | null;
  quando: string;
  quem: string | null;
  /** O produto, quando a lista mistura vários (a tela de estoque). */
  produto?: { id: string; nome: string; unidade: ProductUnit } | null;
  unidade: ProductUnit;
}

/**
 * O razão do estoque, linha a linha.
 *
 * Entrada e saída se distinguem por sinal **e** por ícone — nunca só pela
 * cor. A contagem mostra o que foi contado e a diferença que ela gerou, que é
 * o que explica "o sistema dizia 8 e agora diz 5".
 */
export function MovementList({
  movimentos,
  vazio,
}: {
  movimentos: readonly MovimentoNaTela[];
  vazio: ReactNode;
}) {
  if (movimentos.length === 0) return <p className="text-sm text-content-muted">{vazio}</p>;

  return (
    <ul className="flex flex-col divide-y divide-line-subtle">
      {movimentos.map((m) => {
        const Icone = m.contado !== null ? Scale : m.quantidade < 0 ? ArrowUpRight : ArrowDownLeft;
        const detalhes = [
          m.quando,
          m.quem,
          m.contado !== null ? `contado ${formatQuantity(m.contado, m.unidade)}` : null,
          m.motivo,
        ].filter((v): v is string => v !== null && v !== '');
        return (
          <li key={m.id} className="flex items-start gap-3 py-2.5 text-sm">
            <Icone
              className={cn(
                'mt-0.5 size-4 shrink-0',
                m.quantidade > 0 ? 'text-success' : 'text-content-muted',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-content">
                {m.rotulo}
                {m.produto != null && (
                  <>
                    {' · '}
                    <Link
                      href={`/erp/produtos/${m.produto.id}`}
                      className="font-normal text-content-accent hover:underline"
                    >
                      {m.produto.nome}
                    </Link>
                  </>
                )}
              </p>
              <p className="text-xs break-words text-content-muted">{detalhes.join(' · ')}</p>
            </div>
            <span
              className={cn(
                'shrink-0 font-mono tabular-nums',
                m.quantidade > 0 ? 'text-success' : 'text-content-default',
              )}
            >
              {m.quantidade > 0 ? '+' : m.quantidade < 0 ? '−' : '±'}
              {formatQuantity(Math.abs(m.quantidade), m.unidade)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
