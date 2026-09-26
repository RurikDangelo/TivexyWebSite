import { type ProductUnit, type StockStatus, formatCents, formatQuantity } from '@tivexy/core';
import {
  AlertTriangle,
  CircleCheck,
  CircleMinus,
  type LucideIcon,
  Package,
  PackageX,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { SITUACAO_DO_ESTOQUE, formatMargin } from '@/lib/erp/labels';
import { cn } from '@/lib/utils';

export interface ProdutoListado {
  id: string;
  nome: string;
  categoria: string | null;
  sku: string | null;
  unidade: ProductUnit;
  precoCentavos: number;
  margem: number | null;
  ativo: boolean;
  /** `null`: o tenant não tem estoque, ou o produto não controla. */
  estoque: { saldo: number; situacao: StockStatus } | null;
}

/** O ícone de cada situação — a cor nunca vai sozinha: o rótulo está ao lado. */
export const ICONE_DO_ESTOQUE: Readonly<
  Record<StockStatus, { Icone: LucideIcon; classe: string }>
> = {
  untracked: { Icone: CircleMinus, classe: 'text-content-subtle' },
  negative: { Icone: AlertTriangle, classe: 'text-danger' },
  out: { Icone: PackageX, classe: 'text-warning' },
  low: { Icone: AlertTriangle, classe: 'text-warning' },
  ok: { Icone: CircleCheck, classe: 'text-success' },
};

export function SituacaoDoEstoque({
  saldo,
  situacao,
  unidade,
  className,
}: {
  saldo: number;
  situacao: StockStatus;
  unidade: ProductUnit;
  className?: string;
}) {
  const { Icone, classe } = ICONE_DO_ESTOQUE[situacao];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icone className={cn('size-3.5 shrink-0', classe)} aria-hidden />
      <span className="font-mono tabular-nums">{formatQuantity(saldo, unidade)}</span>
      {situacao !== 'ok' && (
        <span className={situacao === 'negative' ? 'text-danger' : 'text-content-muted'}>
          · {SITUACAO_DO_ESTOQUE[situacao].rotulo.toLowerCase()}
        </span>
      )}
    </span>
  );
}

/** As linhas da lista de produtos. Só desenha: a página decide o que entra. */
export function ProductRows({ produtos }: { produtos: readonly ProdutoListado[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
      {produtos.map((p, i) => (
        <li
          key={p.id}
          style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
          className="animate-enter border-b border-line-subtle last:border-b-0"
        >
          <Link
            href={`/erp/produtos/${p.id}`}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle"
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted dark:bg-surface-inset',
                !p.ativo && 'opacity-60',
              )}
            >
              <Package className="size-5 text-content-subtle" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'truncate font-medium',
                    p.ativo ? 'text-content' : 'text-content-muted',
                  )}
                >
                  {p.nome}
                </span>
                {!p.ativo && (
                  <Badge className="hidden shrink-0 sm:inline-flex">Fora de venda</Badge>
                )}
              </p>
              {/* No celular o selo desce de linha: ao lado do nome, ele engolia o nome. */}
              {!p.ativo && <Badge className="my-0.5 sm:hidden">Fora de venda</Badge>}
              <p className="truncate text-sm text-content-muted">
                {p.categoria ?? 'Sem categoria'}
                {p.sku !== null && <span className="font-mono text-xs"> · {p.sku}</span>}
              </p>
              {p.estoque !== null && (
                <SituacaoDoEstoque
                  saldo={p.estoque.saldo}
                  situacao={p.estoque.situacao}
                  unidade={p.unidade}
                  className="mt-1 text-xs text-content-default"
                />
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="font-mono text-sm font-medium tabular-nums text-content">
                {formatCents(p.precoCentavos)}
              </p>
              <p className="text-xs text-content-muted">por {p.unidade}</p>
              {p.margem !== null && (
                <p
                  className={cn(
                    'hidden text-xs sm:block',
                    p.margem < 0 ? 'text-danger' : 'text-content-subtle',
                  )}
                >
                  margem {formatMargin(p.margem)}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
