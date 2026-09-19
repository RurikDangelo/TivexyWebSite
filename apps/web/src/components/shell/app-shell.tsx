'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { SidebarNav } from '@/components/shell/sidebar-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);

  /*
   * Fechar a gaveta ao trocar de rota — inclusive por voltar/avançar do
   * navegador. Ajustar estado durante a renderização é o padrão do React para
   * isso; um effect aqui causaria uma renderização em cascata.
   */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  /* Travar o scroll do fundo e devolver o foco para dentro da gaveta. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-brand focus:px-4 focus:py-2 focus:text-sm focus:text-content-on-brand"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface px-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="menu-lateral"
          onClick={() => setOpen(true)}
        >
          <Menu aria-hidden />
        </Button>

        <Logo className="text-content" />

        <Badge tone="warning" className="hidden sm:inline-flex">
          Em construção
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop: coluna fixa. Mobile: escondida, vira gaveta. */}
        <aside className="hidden w-64 shrink-0 border-r border-line-subtle bg-surface-subtle lg:block">
          <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
            <SidebarNav />
          </div>
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Fechar menu"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="absolute inset-0 cursor-default bg-[rgb(11_20_36/0.5)]"
            />
            <div
              id="menu-lateral"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line-subtle bg-surface"
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-line-subtle px-4">
                <Logo className="text-content" />
                <Button
                  ref={closeButton}
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar menu"
                  onClick={() => setOpen(false)}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <main id="conteudo" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
