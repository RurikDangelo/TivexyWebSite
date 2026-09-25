import { AppShell } from '@/components/shell/app-shell';
import { requireSession } from '@/lib/auth/require';
import { currentTerms } from '@/lib/terms/current';

/**
 * O piso do grupo autenticado: tem sessão.
 *
 * Não mais que isso, de propósito. Este grupo abriga rotas com exigências
 * diferentes — `/painel` quer vínculo ativo, `/acesso-negado` só pode querer
 * sessão, senão negaria quem veio ler o motivo de ter sido negado. Cada página
 * exige o que é dela; ver `lib/auth/require.ts`.
 *
 * O vocabulário vem daqui para o menu. É a mesma leitura que a página faz —
 * `currentTerms()` é cacheada por requisição —, então menu e página leem a
 * mesma linha de `tenants.terms`, e não duas versões dela.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const { viewer, email, choice, options } = await requireSession();
  const terms = await currentTerms();

  return (
    <AppShell
      viewer={viewer}
      email={email}
      empresa={choice.kind === 'resolved' ? choice.tenant : null}
      empresas={options}
      terms={terms}
    >
      {children}
    </AppShell>
  );
}
