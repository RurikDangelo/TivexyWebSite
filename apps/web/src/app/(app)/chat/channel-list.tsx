'use client';

import { Hash, Lock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { EmptyState } from '@/components/page/empty-state';
import { SectionLabel } from '@/components/ui/section-label';
import type { CanalNaLista } from '@/lib/chat/model';
import { cn } from '@/lib/utils';

/**
 * A coluna de canais.
 *
 * É componente de cliente por uma razão só: destacar o canal aberto. O
 * `layout.tsx` não re-renderiza ao navegar entre canais irmãos — é justamente
 * o que faz a lista não piscar —, então o "ativo" não pode vir de prop do
 * servidor: ele ficaria travado no primeiro canal aberto na sessão.
 * `usePathname()` é a única fonte que acompanha a navegação do cliente.
 *
 * Os dados continuam vindo do servidor. Nada aqui busca, decide acesso ou
 * conta: a contagem é do banco (`chat_unread_counts`), sob o RLS de quem
 * pergunta.
 */

export interface ListaDeCanaisProps {
  canais: readonly CanalNaLista[];
  /** A leitura dos canais falhou. Diferente de "não há canal". */
  falhou: boolean;
  /** Os canais vieram, a contagem não. A lista aparece; os números, não. */
  contagemFalhou: boolean;
  className?: string;
}

export function ListaDeCanais({ canais, falhou, contagemFalhou, className }: ListaDeCanaisProps) {
  const caminho = usePathname();

  return (
    <aside
      aria-label="Canais do chat"
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-line-subtle bg-surface-panel shadow-card',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-subtle px-3 py-2.5">
        <SectionLabel como="h2">Canais</SectionLabel>
        {!falhou && !contagemFalhou && (
          <span className="text-caption text-content-subtle">
            {canais.length === 1 ? '1 canal' : `${canais.length} canais`}
          </span>
        )}
      </div>

      {falhou ? (
        <div className="p-3">
          <EmptyState
            estado="erro"
            titulo="Não consegui ler os canais"
            densidade="compacta"
            moldura={false}
          >
            A leitura falhou agora, então não dá para saber quais canais existem. Use o botão
            Atualizar acima.
          </EmptyState>
        </div>
      ) : canais.length === 0 ? (
        <div className="p-3">
          <EmptyState icone={Hash} titulo="Nenhum canal ainda" densidade="compacta" moldura={false}>
            Crie o primeiro — “Geral” costuma ser um bom começo, e depois um por assunto que a
            equipe repete.
          </EmptyState>
        </div>
      ) : (
        /* A lista rola sozinha; a coluna inteira não. É o que mantém o
           cabeçalho "Canais" à vista num painel de trinta canais. */
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {canais.map((canal) => (
            <li key={canal.id}>
              <LinhaDeCanal
                canal={canal}
                ativo={caminho === `/chat/${canal.id}`}
                contagemFalhou={contagemFalhou}
              />
            </li>
          ))}
        </ul>
      )}

      {contagemFalhou && !falhou && (
        <p
          role="status"
          className="flex shrink-0 items-start gap-2 border-t border-line-subtle px-3 py-2 text-caption text-content-muted"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            Não consegui contar as não lidas. Os canais estão aqui; o número, não — e zero seria
            mentira.
          </span>
        </p>
      )}
    </aside>
  );
}

function LinhaDeCanal({
  canal,
  ativo,
  contagemFalhou,
}: {
  canal: CanalNaLista;
  ativo: boolean;
  contagemFalhou: boolean;
}) {
  const naoLidas = canal.naoLidas ?? 0;
  const mencoes = canal.mencoesNaoLidas ?? 0;
  const temNovidade = !contagemFalhou && naoLidas > 0;
  const Simbolo = canal.restrito ? Lock : Hash;

  return (
    <Link
      href={`/chat/${canal.id}`}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-control px-2.5 py-2 transition-base',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        ativo
          ? 'bg-surface-accent-soft text-content-accent'
          : 'text-content-default hover:bg-surface-muted hover:text-content',
      )}
    >
      <Simbolo className="size-4 shrink-0 opacity-70" aria-hidden />

      <span className="flex min-w-0 flex-1 flex-col">
        {/*
         * Peso, e não só cor, para o canal com novidade: cor sozinha não
         * carrega informação — e aqui o número ao lado já é o reforço.
         */}
        <span className={cn('truncate text-label', temNovidade && 'font-semibold text-content')}>
          {canal.nome}
        </span>
        {canal.restrito && (
          <span className="text-caption text-content-subtle">Restrito a quem participa</span>
        )}
      </span>

      {mencoes > 0 && (
        /* Menção é diferente de não lida: alguém chamou esta pessoa pelo nome. */
        <span className="rounded-pill bg-danger px-1.5 py-px text-micro text-content-on-danger">
          @{mencoes > 99 ? '99+' : mencoes}
          <span className="sr-only"> {mencoes === 1 ? 'menção' : 'menções'} para você</span>
        </span>
      )}

      {temNovidade && (
        <span className="rounded-pill bg-surface-brand px-1.5 py-px text-micro text-content-on-brand tabular-nums">
          {naoLidas > 99 ? '99+' : naoLidas}
          <span className="sr-only">
            {' '}
            {naoLidas === 1 ? 'mensagem não lida' : 'mensagens não lidas'}
          </span>
        </span>
      )}

      {contagemFalhou && (
        <span className="text-caption text-content-subtle" aria-label="contagem indisponível">
          —
        </span>
      )}
    </Link>
  );
}
