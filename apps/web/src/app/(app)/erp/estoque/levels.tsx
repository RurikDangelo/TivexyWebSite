import {
  type ProductUnit,
  type StockStatus,
  type StockSummary,
  formatCents,
  formatQuantity,
} from '@tivexy/core';
import {
  AlertTriangle,
  ArrowDownLeft,
  CircleCheck,
  type LucideIcon,
  Scale,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { contagem } from '@/lib/format';
import { cn } from '@/lib/utils';

import { SituacaoDoEstoque } from '../produtos/product-rows';
import type { FiltroDeSituacao } from './state';

export interface SaldoNaTela {
  id: string;
  nome: string;
  categoria: string | null;
  unidade: ProductUnit;
  saldo: number;
  minimo: number | null;
  situacao: StockStatus;
  ativo: boolean;
}

function Cartao({
  href,
  ativo,
  Icone,
  classeIcone,
  titulo,
  valor,
  detalhe,
}: {
  href: string;
  ativo: boolean;
  Icone: LucideIcon;
  classeIcone: string;
  titulo: string;
  valor: string;
  detalhe: string;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border bg-surface-raised p-3 transition-colors sm:p-4',
        ativo ? 'border-line-accent' : 'border-line-subtle hover:border-line',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs text-content-muted">
        <Icone className={cn('size-3.5 shrink-0', classeIcone)} aria-hidden />
        {titulo}
      </span>
      <span className="font-display text-xl font-bold tabular-nums text-content sm:text-2xl">
        {valor}
      </span>
      <span className="text-xs text-content-subtle">{detalhe}</span>
    </Link>
  );
}

/**
 * O resumo no topo: o que pede ação, e quanto o estoque vale a custo.
 *
 * Cada cartão é um filtro — clicar em "pedem reposição" lista quais. O valor
 * diz quantos ficaram de fora por falta de custo, em vez de somar como se
 * fossem zero.
 */
export function StockSummaryCards({
  resumo,
  filtro,
  rotulo,
}: {
  resumo: StockSummary;
  filtro: FiltroDeSituacao;
  rotulo: { singular: string; plural: string };
}) {
  const s = resumo.porSituacao;
  const repor = s.low + s.out;
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <Cartao
        href="/erp/estoque?situacao=repor"
        ativo={filtro === 'repor'}
        Icone={AlertTriangle}
        classeIcone="text-warning"
        titulo="Pedem reposição"
        valor={String(repor)}
        detalhe={`${s.out} sem estoque, ${s.low} no mínimo`}
      />
      <Cartao
        href="/erp/estoque?situacao=negativo"
        ativo={filtro === 'negativo'}
        Icone={AlertTriangle}
        classeIcone="text-danger"
        titulo="Saldo negativo"
        valor={String(s.negative)}
        detalhe={s.negative === 0 ? 'nada vendido sem entrada' : 'vendido antes da entrada'}
      />
      <Cartao
        href="/erp/estoque?situacao=em-dia"
        ativo={filtro === 'em-dia'}
        Icone={CircleCheck}
        classeIcone="text-success"
        titulo="Em dia"
        valor={String(s.ok)}
        detalhe={contagem(s.ok + repor + s.negative, rotulo.singular, rotulo.plural) + ' ao todo'}
      />
      <Cartao
        href="/erp/estoque"
        ativo={filtro === 'todos'}
        Icone={Wallet}
        classeIcone="text-content-accent"
        titulo="Valor a custo"
        valor={formatCents(resumo.valorACusto)}
        detalhe={
          resumo.semCusto === 0
            ? 'saldo × custo cadastrado'
            : `${contagem(resumo.semCusto, 'sem custo ficou', 'sem custo ficaram')} de fora`
        }
      />
    </div>
  );
}

/** As linhas do saldo. O nome leva à página do produto; os botões, ao formulário. */
export function LevelRows({
  saldos,
  podeMovimentar,
}: {
  saldos: readonly SaldoNaTela[];
  podeMovimentar: boolean;
}) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
      {saldos.map((s, i) => (
        <li
          key={s.id}
          style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
          className="animate-enter flex items-center gap-3 border-b border-line-subtle p-4 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2">
              <Link
                href={`/erp/produtos/${s.id}`}
                className="truncate font-medium text-content hover:underline"
              >
                {s.nome}
              </Link>
              {!s.ativo && <Badge className="hidden shrink-0 sm:inline-flex">Fora de venda</Badge>}
            </p>
            {!s.ativo && <Badge className="my-0.5 sm:hidden">Fora de venda</Badge>}
            <p className="truncate text-sm text-content-muted">
              {s.categoria ?? 'Sem categoria'}
              {s.minimo !== null && ` · mínimo ${formatQuantity(s.minimo, s.unidade)}`}
            </p>
            <SituacaoDoEstoque
              saldo={s.saldo}
              situacao={s.situacao}
              unidade={s.unidade}
              className="mt-1 text-sm text-content-default"
            />
          </div>
          {podeMovimentar && (
            <div className="flex shrink-0 gap-1">
              <Link
                href={`/erp/estoque?produto=${s.id}&tipo=in#registrar`}
                aria-label={`Registrar entrada de ${s.nome}`}
                title="Entrada"
                className={buttonVariants({ variant: 'outline', size: 'icon' })}
              >
                <ArrowDownLeft aria-hidden />
              </Link>
              <Link
                href={`/erp/estoque?produto=${s.id}&tipo=adjustment#registrar`}
                aria-label={`Contar ${s.nome}`}
                title="Contagem"
                className={buttonVariants({ variant: 'outline', size: 'icon' })}
              >
                <Scale aria-hidden />
              </Link>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
