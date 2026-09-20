'use client';

import { Building2, Check, ChevronsUpDown, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { trocarEmpresa } from '@/app/(app)/actions';
import { sair } from '@/app/(auth)/actions';
import type { TenantOption } from '@/lib/auth/active-tenant';
import { cn } from '@/lib/utils';

/**
 * Quem sou eu, em que empresa estou, e como saio.
 *
 * As três coisas ficam juntas porque respondem à mesma pergunta — "esta sessão
 * é a que eu penso que é?". Num sistema multi-tenant, errar a empresa é tão
 * fácil quanto errar a conta, e as duas terminam em alguém lançando dado no
 * lugar errado.
 *
 * **Sair é POST, não link.** Um `<a href="/sair">` seria disparado por um
 * `<img src="/sair">` em qualquer página — e, pior, pelo próprio navegador ao
 * pré-carregar o link. O formulário com Server Action carrega a proteção de
 * origem do Next, que um GET não tem.
 */
export function UserMenu({
  email,
  empresa,
  empresas,
}: {
  email: string | null;
  empresa: TenantOption | null;
  empresas: readonly TenantOption[];
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraOuEsc = (evento: Event) => {
      if (evento instanceof KeyboardEvent && evento.key !== 'Escape') return;
      if (evento.type === 'pointerdown' && caixa.current?.contains(evento.target as Node)) return;
      setAberto(false);
    };
    document.addEventListener('pointerdown', foraOuEsc);
    document.addEventListener('keydown', foraOuEsc);
    return () => {
      document.removeEventListener('pointerdown', foraOuEsc);
      document.removeEventListener('keydown', foraOuEsc);
    };
  }, [aberto]);

  const iniciais = (email ?? '?').slice(0, 2).toUpperCase();

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-content-default transition-colors hover:bg-surface-muted"
      >
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-brand text-[0.625rem] font-semibold text-content-on-brand"
        >
          {iniciais}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{empresa?.name ?? email ?? '—'}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
        <span className="sr-only">Conta e empresa</span>
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised shadow-lg"
        >
          <div className="border-b border-line-subtle px-3 py-2.5">
            <p className="truncate text-sm font-medium text-content">{email ?? 'Sem e-mail'}</p>
            {empresa !== null && (
              <p className="truncate text-xs text-content-muted">{empresa.name}</p>
            )}
          </div>

          {empresas.length > 1 && (
            <div className="border-b border-line-subtle py-1">
              <p className="px-3 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-content-subtle">
                Empresas
              </p>
              {empresas.map((opcao) => (
                <form key={opcao.id} action={trocarEmpresa}>
                  <input type="hidden" name="slug" value={opcao.slug} />
                  <button
                    type="submit"
                    role="menuitem"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted',
                      opcao.id === empresa?.id ? 'text-content' : 'text-content-default',
                    )}
                  >
                    <Building2 className="size-3.5 shrink-0 opacity-60" aria-hidden />
                    <span className="truncate">{opcao.name}</span>
                    {opcao.id === empresa?.id && (
                      <Check
                        className="ml-auto size-3.5 shrink-0 text-content-accent"
                        aria-hidden
                      />
                    )}
                  </button>
                </form>
              ))}
            </div>
          )}

          <form action={sair}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-content-default transition-colors hover:bg-surface-muted"
            >
              <LogOut className="size-3.5 shrink-0 opacity-60" aria-hidden />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
