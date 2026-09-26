import { Building2 } from 'lucide-react';
import Link from 'next/link';

export interface ContaListada {
  id: string;
  nome: string;
  razaoSocial: string | null;
  /** Já formatado: `12.ABC.345/01DE-35`. */
  documento: string | null;
  email: string | null;
  telefone: string | null;
}

/** As linhas da lista de contas. Só desenha: a página decide o que entra. */
export function CompanyRows({ contas }: { contas: readonly ContaListada[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
      {contas.map((c, i) => (
        <li
          key={c.id}
          style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
          className="animate-enter border-b border-line-subtle last:border-b-0"
        >
          <Link
            href={`/crm/empresas/${c.id}`}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-accent-soft">
              <Building2 className="size-4 text-content-accent" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-content">{c.nome}</p>
              <p className="truncate text-sm text-content-muted">
                {c.razaoSocial ?? c.email ?? c.telefone ?? 'Sem dados de contato'}
              </p>
            </div>
            {c.documento !== null && (
              <p className="hidden shrink-0 font-mono text-xs text-content-subtle sm:block">
                {c.documento}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
