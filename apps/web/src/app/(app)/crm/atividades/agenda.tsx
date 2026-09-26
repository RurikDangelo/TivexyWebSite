'use client';

import {
  AlarmClock,
  Building2,
  CheckCircle2,
  Circle,
  Contact,
  Target,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';

import { FormError } from '@/components/form/messages';
import { Avatar } from '@/components/ui/avatar';
import type { TipoDeAlvo } from '@/lib/crm/activity-input';
import { cn } from '@/lib/utils';

import { concluirAtividade } from './actions';
import type { ItemDaAgenda } from './state';

export interface SecaoDaAgenda {
  chave: string;
  titulo: string;
  itens: readonly ItemDaAgenda[];
  /** Seção que avisa — as atrasadas. Tem texto além da cor. */
  alerta?: boolean;
}

const ALVO: Record<TipoDeAlvo, { Icone: typeof Contact; caminho: string }> = {
  lead: { Icone: Target, caminho: '/crm/leads' },
  contato: { Icone: Contact, caminho: '/crm/contatos/' },
  conta: { Icone: Building2, caminho: '/crm/empresas/' },
  negocio: { Icone: Workflow, caminho: '/crm/oportunidades/' },
};

function hrefDoAlvo(alvo: NonNullable<ItemDaAgenda['alvo']>): string {
  /* Lead não tem página própria: a fila é a página. */
  return alvo.tipo === 'lead' ? ALVO.lead.caminho : `${ALVO[alvo.tipo].caminho}${alvo.id}`;
}

/**
 * A agenda em faixas: com atraso, hoje, amanhã, a semana, depois, sem data.
 *
 * Concluir é um clique, e o item risca na hora (`useOptimistic`); se o
 * servidor recusar, ele volta. As seções vazias não aparecem — uma lista de
 * títulos sem nada embaixo parece defeito. A página diz o que fazer quando
 * todas estão vazias.
 */
export function AgendaList({
  secoes,
  podeEditar,
  mostrarAlvo = true,
}: {
  secoes: readonly SecaoDaAgenda[];
  podeEditar: boolean;
  /** Na página de uma pessoa, o alvo é ela: não precisa repetir em cada linha. */
  mostrarAlvo?: boolean;
}) {
  /* O que foi clicado e o servidor ainda não confirmou. Sem entrada, vale o que veio do banco. */
  const [mudancas, marcar] = useOptimistic(
    new Map<string, boolean>(),
    (atual: Map<string, boolean>, mudanca: { id: string; feita: boolean }) =>
      new Map(atual).set(mudanca.id, mudanca.feita),
  );
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  function alternar(item: ItemDaAgenda, feita: boolean) {
    setErro(null);
    iniciar(async () => {
      marcar({ id: item.id, feita });
      const r = await concluirAtividade(item.id, feita);
      if (r.erro !== null) setErro(r.erro);
      else setAnuncio(feita ? `"${item.assunto}" concluído.` : `"${item.assunto}" reaberto.`);
    });
  }

  const visiveis = secoes.filter((s) => s.itens.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {erro !== null && <FormError>{erro}</FormError>}

      {visiveis.map((secao) => (
        <section key={secao.chave} aria-labelledby={`faixa-${secao.chave}`}>
          <h2
            id={`faixa-${secao.chave}`}
            className={cn(
              'mb-2 flex items-center gap-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider',
              secao.alerta ? 'text-danger' : 'text-content-subtle',
            )}
          >
            {secao.alerta && <AlarmClock className="size-3.5" aria-hidden />}
            {secao.titulo}
            <span className="font-sans tabular-nums">· {secao.itens.length}</span>
          </h2>

          <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
            {secao.itens.map((item, i) => {
              const concluida = mudancas.get(item.id) ?? item.faixa === 'done';
              const alvo = item.alvo;
              return (
                <li
                  key={item.id}
                  style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                  className="animate-enter flex items-start gap-3 border-b border-line-subtle p-3 last:border-b-0 sm:p-4"
                >
                  <button
                    type="button"
                    disabled={!podeEditar}
                    onClick={() => alternar(item, !concluida)}
                    aria-label={
                      concluida ? `Reabrir: ${item.assunto}` : `Concluir: ${item.assunto}`
                    }
                    aria-pressed={concluida}
                    className="mt-0.5 shrink-0 rounded-full text-content-subtle transition-colors hover:text-success disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {concluida ? (
                      <CheckCircle2 className="size-5 text-success" aria-hidden />
                    ) : (
                      <Circle className="size-5" aria-hidden />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium break-words',
                        concluida ? 'text-content-muted line-through' : 'text-content',
                      )}
                    >
                      {item.assunto}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                      {item.quando !== null && <span className="tabular-nums">{item.quando}</span>}
                      {item.atraso !== null && item.faixa === 'overdue' && !concluida && (
                        <span className="font-medium text-danger">Venceu {item.atraso}</span>
                      )}
                      {item.tipo !== null && (
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 dark:bg-surface-inset">
                          {item.tipo}
                        </span>
                      )}
                      {mostrarAlvo && alvo !== null && (
                        <Link
                          href={hrefDoAlvo(alvo)}
                          className="inline-flex min-w-0 items-center gap-1 text-content-accent hover:underline"
                        >
                          {(() => {
                            const { Icone } = ALVO[alvo.tipo];
                            return <Icone className="size-3 shrink-0" aria-hidden />;
                          })()}
                          <span className="truncate">{alvo.nome}</span>
                        </Link>
                      )}
                    </div>
                    {item.notas !== null && (
                      <p className="mt-1 line-clamp-2 text-xs text-content-subtle">{item.notas}</p>
                    )}
                  </div>

                  {item.responsavel !== null && (
                    <Avatar
                      nome={item.responsavel}
                      rotulo={`Responsável: ${item.responsavel}`}
                      tamanho="sm"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
