'use client';

import { formatCents, parseCents } from '@tivexy/core';
import { Plus, X } from 'lucide-react';

import { FormError, FormWarning } from '@/components/form/messages';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { dias } from '@/lib/format';

import type { Caixa } from './hooks';
import type { FormaNaVenda } from './state';

export interface PaymentSplitProps {
  formas: readonly FormaNaVenda[];
  caixa: Caixa;
  /** O carrinho está vazio: cobrar nada ainda não é uma diferença a resolver. */
  semItens: boolean;
  /** O que a Server Action recusou no campo `pagamentos`. */
  erro?: string;
}

/**
 * Como o cliente pagou — em uma forma ou em várias.
 *
 * O troco é do dinheiro e só dele: a maquininha não devolve troco, e um campo
 * "recebido" ao lado do cartão só faz errar. O prazo de cada forma aparece
 * escrito porque é ele que decide se a venda entra no caixa hoje ou vira conta
 * a receber — e é a pergunta que o balcão faz ao fechar.
 */
export function PaymentSplit({ formas, caixa, semItens, erro }: PaymentSplitProps) {
  const diferenca = caixa.diferencaCentavos;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-label text-content-default">Pagamento</legend>

      {formas.length === 0 && (
        <FormWarning>
          Nenhuma forma de pagamento está no balcão. Quem administra a empresa cadastra em “Formas
          de pagamento” — sem isso, só dá para registrar venda de valor zero.
        </FormWarning>
      )}

      {caixa.pagamentos.map((pagamento, indice) => {
        const forma = formas.find((f) => f.id === pagamento.formaId);
        const emDinheiro = forma?.codigo === 'cash';
        const recebido = parseCents(pagamento.recebido);
        const valor = parseCents(caixa.valorDe(indice)) ?? 0;
        const troco = recebido === null ? null : recebido - valor;

        return (
          <div
            key={pagamento.chave}
            className="flex flex-col gap-2 rounded-card border border-line-subtle p-2.5"
          >
            <div className="flex items-center gap-2">
              <Label htmlFor={`forma-${pagamento.chave}`} className="sr-only">
                Forma do pagamento {indice + 1}
              </Label>
              <Select
                id={`forma-${pagamento.chave}`}
                size="sm"
                value={pagamento.formaId}
                onChange={(evento) =>
                  caixa.mudar(pagamento.chave, { formaId: evento.target.value })
                }
                className="min-w-0 flex-1"
              >
                {formas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>

              <Label htmlFor={`valor-${pagamento.chave}`} className="sr-only">
                Valor do pagamento {indice + 1}
              </Label>
              <Input
                id={`valor-${pagamento.chave}`}
                size="sm"
                inputMode="decimal"
                autoComplete="off"
                value={caixa.valorDe(indice)}
                onChange={(evento) => caixa.mudar(pagamento.chave, { valor: evento.target.value })}
                placeholder="0,00"
                className="w-28 text-right tabular-nums"
              />

              {caixa.dividido && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Tirar o pagamento ${indice + 1}`}
                  onClick={() => caixa.tirar(pagamento.chave)}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>

            {forma !== undefined && forma.prazoEmDias > 0 && (
              <p className="text-caption text-content-subtle">
                Entra no caixa em {dias(forma.prazoEmDias)} — vira conta a receber.
              </p>
            )}

            {emDinheiro && (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`recebido-${pagamento.chave}`} className="text-caption">
                  Recebido
                </Label>
                <Input
                  id={`recebido-${pagamento.chave}`}
                  size="sm"
                  inputMode="decimal"
                  autoComplete="off"
                  value={pagamento.recebido}
                  onChange={(evento) =>
                    caixa.mudar(pagamento.chave, { recebido: evento.target.value })
                  }
                  placeholder="50,00"
                  className="w-24 text-right tabular-nums"
                />
                {troco !== null && troco >= 0 && (
                  <span className="ml-auto text-caption text-content-default">
                    Troco{' '}
                    <span className="text-num text-metric-sm text-content">
                      {formatCents(troco)}
                    </span>
                  </span>
                )}
                {troco !== null && troco < 0 && (
                  <span className="ml-auto text-caption text-danger">
                    Faltam {formatCents(-troco)} do que foi entregue
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {formas.length > 1 && (
        <Button type="button" variant="ghost" size="sm" onClick={caixa.dividir} className="self-start">
          <Plus aria-hidden />
          Dividir em outra forma
        </Button>
      )}

      {erro !== undefined && <FormError>{erro}</FormError>}

      {!semItens && diferenca !== 0 && (
        <p
          role="status"
          className={diferenca > 0 ? 'text-body text-warning' : 'text-body text-danger'}
        >
          {diferenca > 0
            ? `Faltam ${formatCents(diferenca)} nos pagamentos.`
            : `Os pagamentos passam ${formatCents(-diferenca)} do total.`}
        </p>
      )}
    </fieldset>
  );
}
