import { AppShell } from '@/components/shell/app-shell';
import { requireSession } from '@/lib/auth/require';

/**
 * O piso do grupo autenticado: tem sessão.
 *
 * Não mais que isso, de propósito. Este grupo abriga rotas com exigências
 * diferentes — `/painel` quer vínculo ativo, `/acesso-negado` só pode querer
 * sessão, senão negaria quem veio ler o motivo de ter sido negado. Cada página
 * exige o que é dela; ver `lib/auth/require.ts`.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const { viewer, email, choice, options } = await requireSession();

  return (
    <AppShell
      viewer={viewer}
      email={email}
      empresa={choice.kind === 'resolved' ? choice.tenant : null}
      empresas={options}
    >
      {children}
    </AppShell>
  );
}
