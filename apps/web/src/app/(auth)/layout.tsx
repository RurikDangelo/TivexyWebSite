import { BrandSymbol, BrandWordmark } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';

/*
 * As telas de entrada não usam a casca do app: quem está aqui não tem sessão,
 * e um menu lateral cheio de links que levam de volta para o login seria só
 * ruído. Cartão centrado, marca no topo, e mais nada.
 *
 * Este grupo não chama `requireAccess()`. Suas rotas são `public` em
 * `routes.ts` — exigir sessão para entrar seria o laço mais óbvio possível.
 */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-svh flex-col bg-surface-subtle">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-content">
          <BrandSymbol className="h-6" />
          <BrandWordmark className="h-3.5" label="Tivexy" />
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
