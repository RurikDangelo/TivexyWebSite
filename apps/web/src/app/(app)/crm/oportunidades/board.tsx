'use client';

import { type CrmStageKind, boardTotals, formatCents, stageTotals } from '@tivexy/core';
import {
  ArrowRightLeft,
  CalendarClock,
  CircleDot,
  GripVertical,
  Hourglass,
  Trophy,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { type DragEvent, useOptimistic, useState, useTransition } from 'react';

import { FormError } from '@/components/form/messages';
import { contagem, dias, formatDayMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

import { moverOportunidade } from './actions';
import {
  type CartaoDeNegocio,
  type EtapaDoQuadro,
  JANELA_FECHADAS_DIAS,
  PARADO_A_PARTIR_DE,
} from './state';

interface Movimento {
  id: string;
  para: string;
}

const TIPO: Record<CrmStageKind, { rotulo: string; Icone: typeof Trophy; classe: string }> = {
  open: { rotulo: 'Em aberto', Icone: CircleDot, classe: 'text-content-accent' },
  won: { rotulo: 'Ganho', Icone: Trophy, classe: 'text-success' },
  lost: { rotulo: 'Perdido', Icone: XCircle, classe: 'text-content-muted' },
};

/**
 * O funil em colunas.
 *
 * **Duas formas de mover, e a segunda não é enfeite.** Arrastar é o gesto
 * natural com mouse, e não existe para quem usa teclado, leitor de tela ou o
 * dedo — o arrastar do HTML não funciona em toque. "Mover para" em cada cartão
 * é o mesmo movimento, pela mesma função, alcançável por qualquer um.
 *
 * O cartão muda de coluna na hora (`useOptimistic`) e volta sozinho se o
 * servidor recusar: o estado otimista só vale durante a transição, e depois
 * dela a tela é a que o banco devolveu. Os totais saem do mesmo estado, então
 * a soma da coluna acompanha o cartão.
 */
export function Board({
  etapas,
  negocios,
  podeMover,
  hoje,
  eu,
  singular,
  plural,
}: {
  etapas: readonly EtapaDoQuadro[];
  negocios: readonly CartaoDeNegocio[];
  podeMover: boolean;
  /** Hoje no fuso do tenant, `AAAA-MM-DD`. */
  hoje: string;
  /** Quem está olhando, para o filtro de responsável. */
  eu: string | null;
  /** O nome do recurso no vocabulário do tenant — "tratamento", na clínica. */
  singular: string;
  plural: string;
}) {
  const [otimistas, aplicar] = useOptimistic(
    negocios as CartaoDeNegocio[],
    (atual: CartaoDeNegocio[], m: Movimento) =>
      atual.map((n) => (n.id === m.id ? { ...n, etapaId: m.para, diasParado: 0 } : n)),
  );
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [alvo, setAlvo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [soMinhas, setSoMinhas] = useState(false);

  const visiveis = soMinhas ? otimistas.filter((n) => n.responsavelId === eu) : otimistas;
  const somaveis = visiveis.map((n) => ({ stageId: n.etapaId, valueCents: n.valorCentavos }));
  const porEtapa = stageTotals(etapas, somaveis);
  const totais = boardTotals(etapas, somaveis);
  const nome = new Map(etapas.map((e) => [e.id, e.name]));

  function mover(negocio: CartaoDeNegocio, para: string) {
    if (!podeMover || negocio.etapaId === para) return;
    const de = negocio.etapaId;
    setErro(null);
    iniciar(async () => {
      aplicar({ id: negocio.id, para });
      const r = await moverOportunidade(negocio.id, de, para);
      if (r.erro === null) {
        setAnuncio(`"${negocio.titulo}" foi para ${nome.get(para) ?? 'a nova etapa'}.`);
      } else {
        setErro(r.erro);
        setAnuncio(`Não foi possível mover "${negocio.titulo}".`);
      }
    });
  }

  function soltar(e: DragEvent, etapaId: string) {
    e.preventDefault();
    setAlvo(null);
    const negocio = otimistas.find((n) => n.id === e.dataTransfer.getData('text/plain'));
    if (negocio !== undefined) mover(negocio, etapaId);
  }

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Resumo
          tipo="open"
          rotulo="Em aberto"
          total={totais.open.cents}
          quantidade={contagem(totais.open.count, singular, plural)}
        />
        <Resumo
          tipo="won"
          rotulo={`Ganhos · ${JANELA_FECHADAS_DIAS} dias`}
          total={totais.won.cents}
          quantidade={contagem(totais.won.count, singular, plural)}
        />
        <Resumo
          tipo="lost"
          rotulo={`Perdas · ${JANELA_FECHADAS_DIAS} dias`}
          total={totais.lost.cents}
          quantidade={contagem(totais.lost.count, singular, plural)}
        />
      </dl>

      {eu !== null && (
        <div role="group" aria-label={`Filtrar ${plural}`} className="flex gap-1">
          {[
            { valor: false, rotulo: 'Tudo' },
            { valor: true, rotulo: 'Sou responsável' },
          ].map((opcao) => (
            <button
              key={opcao.rotulo}
              type="button"
              aria-pressed={soMinhas === opcao.valor}
              onClick={() => setSoMinhas(opcao.valor)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                soMinhas === opcao.valor
                  ? 'border-line-accent bg-surface-accent-soft text-content-accent'
                  : 'border-line text-content-muted hover:bg-surface-muted',
              )}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      )}

      {erro !== null && <FormError>{erro}</FormError>}

      {/*
       * `relative` não é estética. Texto `sr-only` é `position: absolute`, e um
       * elemento absoluto só é cortado pelo contêiner que rola se ele for o
       * bloco de contenção. Sem isto, o rótulo de leitor de tela de uma coluna
       * fora da tela escapava e esticava a página inteira na horizontal.
       */}
      <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <ol className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {etapas.map((etapa) => {
            const cartoes = visiveis.filter((n) => n.etapaId === etapa.id);
            const t = porEtapa.get(etapa.id) ?? { count: 0, cents: 0 };
            const { Icone, classe, rotulo } = TIPO[etapa.kind];
            const terminal = etapa.kind !== 'open';

            return (
              <li
                key={etapa.id}
                aria-labelledby={`etapa-${etapa.id}`}
                onDragOver={(e) => {
                  if (!podeMover || arrastando === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (alvo !== etapa.id) setAlvo(etapa.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null);
                }}
                onDrop={(e) => soltar(e, etapa.id)}
                className={cn(
                  'flex flex-col rounded-lg border bg-surface-subtle transition-colors duration-150 lg:w-72 lg:shrink-0',
                  alvo === etapa.id
                    ? 'border-line-accent bg-surface-accent-soft'
                    : 'border-line-subtle',
                )}
              >
                <header className="flex flex-col gap-0.5 border-b border-line-subtle px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icone className={cn('size-4 shrink-0', classe)} aria-hidden />
                    <h2
                      id={`etapa-${etapa.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-content"
                    >
                      {etapa.name}
                      {terminal && <span className="sr-only"> ({rotulo})</span>}
                    </h2>
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 font-mono text-xs tabular-nums text-content-muted">
                      {t.count}
                    </span>
                  </div>
                  <p className="font-mono text-xs tabular-nums text-content-muted">
                    {formatCents(t.cents)}
                    {terminal && (
                      <span className="text-content-subtle">
                        {' '}
                        · últimos {JANELA_FECHADAS_DIAS} dias
                      </span>
                    )}
                  </p>
                </header>

                {cartoes.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-content-subtle">
                    {podeMover ? 'Arraste para cá, ou use "Mover para".' : 'Nada nesta etapa.'}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2 p-2">
                    {cartoes.map((negocio, i) => (
                      <Cartao
                        key={negocio.id}
                        negocio={negocio}
                        ordem={i}
                        aberta={etapa.kind === 'open'}
                        hoje={hoje}
                        podeMover={podeMover}
                        arrastando={arrastando === negocio.id}
                        etapas={etapas}
                        onArrastar={setArrastando}
                        onMover={(para) => mover(negocio, para)}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Resumo({
  tipo,
  rotulo,
  total,
  quantidade,
}: {
  tipo: CrmStageKind;
  rotulo: string;
  total: number;
  /** Já por extenso, no vocabulário do tenant: "3 tratamentos". */
  quantidade: string;
}) {
  const { Icone, classe } = TIPO[tipo];
  return (
    <div className="rounded-lg border border-line-subtle bg-surface-raised px-4 py-3 shadow-xs">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-content-muted">
        <Icone className={cn('size-3.5', classe)} aria-hidden />
        {rotulo}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-xl font-bold tabular-nums text-content">
          {formatCents(total)}
        </span>
        <span className="text-xs text-content-muted">{quantidade}</span>
      </dd>
    </div>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.charAt(0) ?? '') : '';
  return (primeira + ultima).toLocaleUpperCase('pt-BR');
}

function Cartao({
  negocio,
  ordem,
  aberta,
  hoje,
  podeMover,
  arrastando,
  etapas,
  onArrastar,
  onMover,
}: {
  negocio: CartaoDeNegocio;
  ordem: number;
  aberta: boolean;
  hoje: string;
  podeMover: boolean;
  arrastando: boolean;
  etapas: readonly EtapaDoQuadro[];
  onArrastar: (id: string | null) => void;
  onMover: (para: string) => void;
}) {
  const vencida = aberta && negocio.previsao !== null && negocio.previsao < hoje;
  const parada = aberta && negocio.diasParado >= PARADO_A_PARTIR_DE;
  const destinos = etapas.filter((e) => e.id !== negocio.etapaId);

  return (
    <li
      draggable={podeMover}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', negocio.id);
        e.dataTransfer.effectAllowed = 'move';
        onArrastar(negocio.id);
      }}
      onDragEnd={() => onArrastar(null)}
      style={{ animationDelay: `${Math.min(ordem, 8) * 30}ms` }}
      className={cn(
        'animate-enter group rounded-md border border-line-subtle bg-surface-raised p-3 shadow-xs transition-shadow duration-150',
        'hover:shadow-sm focus-within:border-line-accent',
        podeMover && 'lg:cursor-grab lg:active:cursor-grabbing',
        arrastando && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/crm/oportunidades/${negocio.id}`}
          className="min-w-0 flex-1 text-sm font-medium text-content hover:underline"
        >
          {negocio.titulo}
        </Link>
        {podeMover && (
          <GripVertical
            className="mt-0.5 hidden size-4 shrink-0 text-content-subtle opacity-0 transition-opacity group-hover:opacity-100 lg:block"
            aria-hidden
          />
        )}
      </div>

      <p className="mt-1 font-display text-base font-semibold tabular-nums text-content">
        {formatCents(negocio.valorCentavos)}
      </p>

      {(negocio.conta !== null || negocio.pessoa !== null) && (
        <p className="mt-0.5 truncate text-xs text-content-muted">
          {[negocio.conta, negocio.pessoa].filter(Boolean).join(' · ')}
        </p>
      )}

      {(negocio.previsao !== null || parada || negocio.responsavel !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {negocio.previsao !== null && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                vencida
                  ? 'bg-danger-soft text-danger'
                  : 'bg-surface-muted text-content-muted dark:bg-surface-inset',
              )}
            >
              <CalendarClock className="size-3" aria-hidden />
              {vencida
                ? `Previsão vencida · ${formatDayMonth(negocio.previsao)}`
                : formatDayMonth(negocio.previsao)}
            </span>
          )}
          {parada && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                negocio.diasParado >= 30
                  ? 'bg-warning-soft text-warning'
                  : 'bg-surface-muted text-content-muted dark:bg-surface-inset',
              )}
            >
              <Hourglass className="size-3" aria-hidden />
              Sem mudança há {dias(negocio.diasParado)}
            </span>
          )}
          {negocio.responsavel !== null && (
            <span
              title={negocio.responsavel}
              className="ml-auto flex size-6 items-center justify-center rounded-full bg-surface-accent-soft text-[0.625rem] font-semibold text-content-accent"
            >
              <span aria-hidden>{iniciais(negocio.responsavel)}</span>
              <span className="sr-only">Responsável: {negocio.responsavel}</span>
            </span>
          )}
        </div>
      )}

      {podeMover && destinos.length > 0 && (
        <details className="mt-2 border-t border-line-subtle pt-2 [&[open]>summary]:text-content">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-xs text-content-muted hover:text-content [&::-webkit-details-marker]:hidden">
            <ArrowRightLeft className="size-3.5" aria-hidden />
            Mover para…
            <span className="sr-only"> ({negocio.titulo})</span>
          </summary>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {destinos.map((destino) => {
              const { Icone, classe } = TIPO[destino.kind];
              return (
                <li key={destino.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.closest('details')?.removeAttribute('open');
                      onMover(destino.id);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-content-default hover:bg-surface-muted"
                  >
                    <Icone className={cn('size-3.5 shrink-0', classe)} aria-hidden />
                    <span className="truncate">{destino.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
  );
}
