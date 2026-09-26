'use client';

import { formatCents } from '@tivexy/core';

import { Field } from '@/components/form/field';
import { Input } from '@/components/ui/input';

export interface SaleTotalsProps {
  subtotalCentavos: number;
  totalCentavos: number;
  desconto: string;
  aoMudarDesconto: (valor: string) => void;
  /** Da Server Action ou da conferência local — a que existir. */
  erroDoDesconto?: string;
}

/**
 * O que os itens somam, o que sai de desconto e o que o cliente paga.
 *
 * O total é o único número de 32px da coluna: ele é a pergunta do balcão. O
 * subtotal fica em corpo normal porque é passagem, não destino.
 *
 * `aria-live="polite"` no total, e não `assertive`: o número muda a cada tecla
 * da quantidade, e interromper o leitor de tela a cada dígito tornaria o campo
 * impossível de usar.
 */
export function SaleTotals({
  subtotalCentavos,
  totalCentavos,
  desconto,
  aoMudarDesconto,
  erroDoDesconto,
}: SaleTotalsProps) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex items-baseline justify-between gap-3">
        <dt className="text-body text-content-muted">Itens</dt>
        <dd className="text-num text-content">{formatCents(subtotalCentavos)}</dd>
      </dl>

      <Field nome="desconto" rotulo="Desconto" erro={erroDoDesconto}>
        <div className="relative">
          <span
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-content-subtle"
            aria-hidden
          >
            R$
          </span>
          <Input
            id="desconto"
            name="desconto"
            inputMode="decimal"
            autoComplete="off"
            value={desconto}
            onChange={(evento) => aoMudarDesconto(evento.target.value)}
            placeholder="0,00"
            className="pl-9 text-right tabular-nums"
            aria-invalid={erroDoDesconto !== undefined}
          />
        </div>
      </Field>

      <div className="flex items-baseline justify-between gap-3 border-t border-line-subtle pt-3">
        <span className="text-label text-content-default">Total</span>
        <span className="text-metric tabular-nums text-content" aria-live="polite">
          {formatCents(totalCentavos)}
        </span>
      </div>
    </div>
  );
}
