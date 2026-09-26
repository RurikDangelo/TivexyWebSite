import { formatCents } from '@tivexy/core';
import { Ban, Receipt } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { Periodo, SituacaoDeVenda } from './state';

export interface VendaListada {
  id: string;
  numero: number;
  quando: string;
  cliente: string | null;
  formas: string[];
  totalCentavos: number;
  cancelada: boolean;
}

export interface ResumoDeVendas {
  vendas: number;
  totalCentavos: number;
  descontoCentavos: number;
  canceladas: number;
}

/** Os números do período: quantas, quanto, o tíquete médio e o que foi cancelado. */
export function SalesSummary({
  resumo,
  rotuloPlural,
}: {
  resumo: ResumoDeVendas;
  rotuloPlural: string;
}) {
  const ticket = resumo.vendas === 0 ? null : Math.round(resumo.totalCentavos / resumo.vendas);
  const cartoes = [
    {
      titulo: rotuloPlural,
      valor: resumo.vendas.toLocaleString('pt-BR'),
      detalhe: 'no período, sem os cancelamentos',
    },
    {
      titulo: 'Total',
      valor: formatCents(resumo.totalCentavos),
      detalhe:
        resumo.descontoCentavos > 0
          ? `${formatCents(resumo.descontoCentavos)} em desconto`
          : 'sem desconto',
    },
    {
      titulo: 'Tíquete médio',
      valor: ticket === null ? '—' : formatCents(ticket),
      detalhe: 'total ÷ quantidade',
    },
    {
      titulo: 'Cancelamentos',
      valor: resumo.canceladas.toLocaleString('pt-BR'),
      detalhe: 'fora do total',
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {cartoes.map((c) => (
        <div
          key={c.titulo}
          className="flex min-w-0 flex-col gap-1 rounded-lg border border-line-subtle bg-surface-raised p-3 sm:p-4"
        >
          <dt className="text-xs text-content-muted">{c.titulo}</dt>
          <dd className="font-display text-xl font-bold tabular-nums break-words text-content sm:text-2xl">
            {c.valor}
          </dd>
          <dd className="text-xs text-content-subtle">{c.detalhe}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SalesFilters({
  periodo,
  situacao,
  numero,
}: {
  periodo: Periodo;
  situacao: SituacaoDeVenda;
  numero: string;
}) {
  return (
    <form role="search" method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Select name="periodo" aria-label="Período" defaultValue={periodo} className="sm:w-40">
          <option value="hoje">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="tudo">Desde o início</option>
        </Select>
        <Select name="situacao" aria-label="Situação" defaultValue={situacao} className="sm:w-40">
          <option value="todas">Qualquer situação</option>
          <option value="concluidas">Em vigor</option>
          <option value="canceladas">Cancelamentos</option>
        </Select>
      </div>
      <Label htmlFor="numero" className="sr-only">
        Número
      </Label>
      <Input
        id="numero"
        name="numero"
        type="search"
        inputMode="numeric"
        defaultValue={numero}
        placeholder="Nº"
        className="sm:w-28"
      />
      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}

/** As linhas da lista. Cancelada continua visível — riscada, com selo e ícone. */
export function SaleRows({
  vendas,
  rotuloSingular,
}: {
  vendas: readonly VendaListada[];
  rotuloSingular: string;
}) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
      {vendas.map((v, i) => (
        <li
          key={v.id}
          style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
          className="animate-enter border-b border-line-subtle last:border-b-0"
        >
          <Link
            href={`/erp/vendas/${v.id}`}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted dark:bg-surface-inset">
              {v.cancelada ? (
                <Ban className="size-5 text-content-subtle" aria-hidden />
              ) : (
                <Receipt className="size-5 text-content-subtle" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2">
                <span className="font-medium text-content">
                  <span className="sr-only">{rotuloSingular} </span>nº {v.numero}
                </span>
                {v.cancelada && <Badge tone="danger">Cancelamento</Badge>}
              </p>
              <p className="truncate text-sm text-content-muted">
                {v.quando} · {v.cliente ?? 'Sem identificação'}
              </p>
              {v.formas.length > 0 && (
                <p className="truncate text-xs text-content-subtle">{v.formas.join(' + ')}</p>
              )}
            </div>
            <span
              className={cn(
                'shrink-0 font-mono text-sm font-medium tabular-nums',
                v.cancelada ? 'text-content-subtle line-through' : 'text-content',
              )}
            >
              {formatCents(v.totalCentavos)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
