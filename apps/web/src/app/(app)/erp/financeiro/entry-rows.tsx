'use client';

import { formatCents } from '@tivexy/core';
import { Ban, Check, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { FormError, FormSuccess } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { TOM_DA_SITUACAO } from '@/lib/erp/finance-text';
import { cn } from '@/lib/utils';

import { cancelarLancamento, darBaixa, desfazerBaixa } from './actions';
import { ACAO_INICIAL, type LancamentoNaTela } from './state';

const SITUACAO = {
  receivable: { paid: 'Recebido', open: 'Em aberto', overdue: 'Vencido', cancelled: 'Cancelado' },
  payable: { paid: 'Pago', open: 'Em aberto', overdue: 'Vencido', cancelled: 'Cancelado' },
} as const;

function Linha({
  l,
  direcao,
  podeEditar,
  hoje,
  rotuloVenda,
}: {
  l: LancamentoNaTela;
  direcao: 'receivable' | 'payable';
  podeEditar: boolean;
  hoje: string;
  rotuloVenda: string;
}) {
  const [painel, setPainel] = useState<'baixa' | 'cancelar' | null>(null);
  const [baixa, baixar] = useActionState(darBaixa, ACAO_INICIAL);
  const [desfeita, desfazer] = useActionState(desfazerBaixa, ACAO_INICIAL);
  const [cancelada, cancelar] = useActionState(cancelarLancamento, ACAO_INICIAL);
  const aberto = l.situacao === 'open' || l.situacao === 'overdue';
  const verbo = direcao === 'receivable' ? 'recebimento' : 'pagamento';

  return (
    <li className="animate-enter flex flex-col gap-2 border-b border-line-subtle p-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium text-content">{l.descricao}</p>
          <p className="text-sm text-content-muted">
            {[l.quem, l.categoria].filter(Boolean).join(' · ') || 'Sem contraparte'}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Badge tone={TOM_DA_SITUACAO[l.situacao]}>{SITUACAO[direcao][l.situacao]}</Badge>
            <span className={cn(l.situacao === 'overdue' ? 'text-danger' : 'text-content-muted')}>
              {l.situacao === 'paid' && l.pagoEm !== null
                ? `em ${l.pagoEm}`
                : l.situacao === 'cancelled'
                  ? (l.motivoDoCancelamento ?? '')
                  : `${l.prazoTexto} · ${l.vencimentoTexto}`}
            </span>
            {l.venda !== null && (
              <Link
                href={`/erp/vendas/${l.venda.id}`}
                className="text-content-accent hover:underline"
              >
                {rotuloVenda} nº {l.venda.numero}
              </Link>
            )}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 font-mono text-sm font-medium tabular-nums',
            l.situacao === 'cancelled' ? 'text-content-subtle line-through' : 'text-content',
          )}
        >
          {formatCents(l.valorCentavos)}
        </span>
      </div>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          {aberto && painel === null && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setPainel('baixa')}>
                <Check aria-hidden />
                Registrar {verbo}
              </Button>
              {l.venda === null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPainel('cancelar')}
                >
                  <Ban aria-hidden />
                  Cancelar
                </Button>
              )}
            </>
          )}
          {l.situacao === 'paid' && (
            <form
              action={desfazer}
              onSubmit={(ev) => {
                if (!window.confirm(`Desfazer o ${verbo}? O lançamento volta a ficar em aberto.`)) {
                  ev.preventDefault();
                }
              }}
            >
              <input type="hidden" name="id" value={l.id} />
              <Submit variant="ghost" size="sm" pendente="Desfazendo…">
                <RotateCcw aria-hidden />
                Desfazer {verbo}
              </Submit>
            </form>
          )}
        </div>
      )}

      {painel === 'baixa' && (
        <form
          action={baixar}
          className="flex flex-wrap items-end gap-2 rounded-md bg-surface-subtle p-3"
        >
          <input type="hidden" name="id" value={l.id} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`pago-${l.id}`} className="text-xs">
              Em que dia o dinheiro {direcao === 'receivable' ? 'entrou' : 'saiu'}
            </Label>
            <Input
              id={`pago-${l.id}`}
              name="pagoEm"
              type="date"
              required
              max={hoje}
              defaultValue={hoje}
              className="h-8 w-40"
            />
          </div>
          <Submit size="sm" pendente="Registrando…">
            Confirmar
          </Submit>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPainel(null)}>
            Voltar
          </Button>
        </form>
      )}

      {painel === 'cancelar' && (
        <form
          action={cancelar}
          className="flex flex-wrap items-end gap-2 rounded-md bg-surface-subtle p-3"
        >
          <input type="hidden" name="id" value={l.id} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor={`motivo-${l.id}`} className="text-xs">
              Motivo do cancelamento
            </Label>
            <Input
              id={`motivo-${l.id}`}
              name="motivo"
              required
              maxLength={300}
              placeholder="Lançado em dobro"
              className="h-8"
            />
          </div>
          <Submit size="sm" variant="outline" pendente="Cancelando…" className="text-danger">
            Cancelar lançamento
          </Submit>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPainel(null)}>
            Voltar
          </Button>
        </form>
      )}

      {[baixa, desfeita, cancelada].map((r, i) =>
        r.erro !== null ? (
          <FormError key={i}>{r.erro}</FormError>
        ) : r.ok !== null ? (
          <FormSuccess key={i}>{r.ok}</FormSuccess>
        ) : null,
      )}
    </li>
  );
}

/** As contas de uma direção. Cancelado continua na lista — riscado, com o motivo. */
export function EntryRows({
  lancamentos,
  direcao,
  podeEditar,
  hoje,
  rotuloVenda,
}: {
  lancamentos: readonly LancamentoNaTela[];
  direcao: 'receivable' | 'payable';
  podeEditar: boolean;
  hoje: string;
  rotuloVenda: string;
}) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
      {lancamentos.map((l) => (
        <Linha
          key={l.id}
          l={l}
          direcao={direcao}
          podeEditar={podeEditar}
          hoje={hoje}
          rotuloVenda={rotuloVenda}
        />
      ))}
    </ul>
  );
}
