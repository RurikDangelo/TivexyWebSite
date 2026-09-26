import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';

export interface PessoaListada {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  /** Já formatado: `529.982.247-25`. */
  documento: string | null;
  conta: string | null;
}

/** As linhas da lista de pessoas. Só desenha: a página decide o que entra. */
export function ContactRows({ pessoas }: { pessoas: readonly PessoaListada[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
      {pessoas.map((p, i) => (
        <li
          key={p.id}
          style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
          className="animate-enter border-b border-line-subtle last:border-b-0"
        >
          <Link
            href={`/crm/contatos/${p.id}`}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle"
          >
            <Avatar nome={p.nome} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-content">{p.nome}</p>
              <p className="truncate text-sm text-content-muted">
                {[p.cargo, p.conta].filter(Boolean).join(' · ') ||
                  p.email ||
                  p.telefone ||
                  'Sem dados de contato'}
              </p>
            </div>
            <div className="hidden min-w-0 max-w-[40%] text-right text-sm text-content-muted sm:block">
              {p.email !== null && <p className="truncate">{p.email}</p>}
              {p.telefone !== null && <p className="truncate">{p.telefone}</p>}
              {p.documento !== null && (
                <p className="font-mono text-xs text-content-subtle">{p.documento}</p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
