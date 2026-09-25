import { formatCents } from '@tivexy/core';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  type LucideIcon,
  Scale,
} from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

import type { Aba } from './state';

export interface ResumoFinanceiro {
  aReceber: number;
  aReceberVencido: number;
  aReceberQuantos: number;
  aPagar: number;
  aPagarVencido: number;
  aPagarQuantos: number;
  entrouNoMes: number;
  saiuNoMes: number;
  aReceber30: number;
  aPagar30: number;
}

/** Com sinal, porque saldo negativo precisa se ler como negativo: "−R$ 120,00". */
function comSinal(centavos: number): string {
  if (centavos === 0) return formatCents(0);
  return `${centavos > 0 ? '+' : '−'}${formatCents(Math.abs(centavos))}`;
}

function Cartao({
  titulo,
  Icone,
  classeIcone,
  valor,
  classeValor,
  detalhe,
  href,
}: {
  titulo: string;
  Icone: LucideIcon;
  classeIcone: string;
  valor: string;
  classeValor?: string;
  detalhe: React.ReactNode;
  href?: string;
}) {
  const corpo = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-content-muted">
        <Icone className={cn('size-3.5 shrink-0', classeIcone)} aria-hidden />
        {titulo}
      </span>
      <span
        className={cn(
          'font-display text-xl font-bold tabular-nums break-words sm:text-2xl',
          classeValor ?? 'text-content',
        )}
      >
        {valor}
      </span>
      <span className="text-xs text-content-subtle">{detalhe}</span>
    </>
  );
  const classe =
    'flex min-w-0 flex-col gap-1 rounded-lg border border-line-subtle bg-surface-raised p-3 sm:p-4';
  return href === undefined ? (
    <div className={classe}>{corpo}</div>
  ) : (
    <Link href={href} className={cn(classe, 'transition-colors hover:border-line')}>
      {corpo}
    </Link>
  );
}

/**
 * Os quatro números do caixa: o mês realizado, o que há a receber e a pagar,
 * e o que vem nos próximos 30 dias.
 *
 * Vencido aparece dentro do total, em vermelho **e** escrito — "R$ 300,00
 * vencidos" —, e o cartão leva à lista já filtrada.
 */
export function FinanceSummary({ r }: { r: ResumoFinanceiro }) {
  const saldoDoMes = r.entrouNoMes - r.saiuNoMes;
  const saldo30 = r.aReceber30 - r.aPagar30;
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <Cartao
        titulo="Saldo do mês"
        Icone={Scale}
        classeIcone="text-content-accent"
        valor={comSinal(saldoDoMes)}
        classeValor={saldoDoMes < 0 ? 'text-danger' : 'text-content'}
        detalhe={`entrou ${formatCents(r.entrouNoMes)}, saiu ${formatCents(r.saiuNoMes)}`}
      />
      <Cartao
        titulo="A receber"
        Icone={ArrowDownLeft}
        classeIcone="text-success"
        valor={formatCents(r.aReceber)}
        href={
          r.aReceberVencido > 0
            ? '/erp/financeiro?aba=receber&filtro=vencidos'
            : '/erp/financeiro?aba=receber'
        }
        detalhe={
          r.aReceberVencido > 0 ? (
            <span className="text-danger">{formatCents(r.aReceberVencido)} vencidos</span>
          ) : (
            `${r.aReceberQuantos} em aberto, nada vencido`
          )
        }
      />
      <Cartao
        titulo="A pagar"
        Icone={ArrowUpRight}
        classeIcone="text-danger"
        valor={formatCents(r.aPagar)}
        href={
          r.aPagarVencido > 0
            ? '/erp/financeiro?aba=pagar&filtro=vencidos'
            : '/erp/financeiro?aba=pagar'
        }
        detalhe={
          r.aPagarVencido > 0 ? (
            <span className="text-danger">{formatCents(r.aPagarVencido)} vencidos</span>
          ) : (
            `${r.aPagarQuantos} em aberto, nada vencido`
          )
        }
      />
      <Cartao
        titulo="Próximos 30 dias"
        Icone={CalendarClock}
        classeIcone="text-content-accent"
        valor={comSinal(saldo30)}
        classeValor={saldo30 < 0 ? 'text-danger' : 'text-content'}
        detalhe={`entra ${formatCents(r.aReceber30)}, sai ${formatCents(r.aPagar30)}`}
      />
    </div>
  );
}

export interface ProximoVencimento {
  id: string;
  direcao: 'receivable' | 'payable';
  descricao: string;
  valorCentavos: number;
  prazoTexto: string;
  vencido: boolean;
}

/** Os próximos vencimentos das duas direções, vencidos primeiro. */
export function UpcomingDues({ itens }: { itens: readonly ProximoVencimento[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-content-muted">
        Nada em aberto. Vendas a prazo e contas lançadas aparecem aqui quando vencerem.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line-subtle">
      {itens.map((i) => {
        const entra = i.direcao === 'receivable';
        const Icone = entra ? ArrowDownLeft : ArrowUpRight;
        const aba: Aba = entra ? 'receber' : 'pagar';
        return (
          <li key={i.id}>
            <Link
              href={`/erp/financeiro?aba=${aba}`}
              className="flex items-center gap-3 py-2.5 text-sm hover:bg-surface-subtle"
            >
              <Icone
                className={cn('size-4 shrink-0', entra ? 'text-success' : 'text-danger')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-content">{i.descricao}</span>
                <span className={cn('text-xs', i.vencido ? 'text-danger' : 'text-content-muted')}>
                  {entra ? 'a receber' : 'a pagar'} · {i.prazoTexto}
                  {i.vencido && <AlertTriangle className="ml-1 inline size-3" aria-hidden />}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-content">
                {formatCents(i.valorCentavos)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** As três abas, como endereço. */
export function FinanceTabs({ aba }: { aba: Aba }) {
  const abas: { chave: Aba; rotulo: string; href: string }[] = [
    { chave: 'visao', rotulo: 'Visão', href: '/erp/financeiro' },
    { chave: 'receber', rotulo: 'A receber', href: '/erp/financeiro?aba=receber' },
    { chave: 'pagar', rotulo: 'A pagar', href: '/erp/financeiro?aba=pagar' },
  ];
  return (
    <nav
      aria-label="Financeiro"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-line-subtle"
    >
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          aria-current={aba === a.chave ? 'page' : undefined}
          className={cn(
            '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
            aba === a.chave
              ? 'border-surface-brand font-medium text-content'
              : 'border-transparent text-content-muted hover:text-content',
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
