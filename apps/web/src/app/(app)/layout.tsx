import { AppShell } from '@/components/shell/app-shell';
import { requireSession } from '@/lib/auth/require';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';

/**
 * Quantos avisos esperam esta pessoa nesta empresa — o número do sino.
 *
 * Sem empresa escolhida não há sino: aviso é de uma empresa. Falha de leitura
 * vira `null`, e o sino aparece sem número em vez de derrubar a página.
 */
async function avisosNaoLidos(tenantId: string, userId: string): Promise<number | null> {
  const supabase = await supabaseServer();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .is('read_at', null);
  return error === null ? (count ?? 0) : null;
}

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
  const avisos =
    choice.kind === 'resolved' && viewer.userId !== null && viewer.membershipStatus === 'active'
      ? { naoLidos: await avisosNaoLidos(choice.tenant.id, viewer.userId) }
      : null;

  return (
    <AppShell
      viewer={viewer}
      email={email}
      empresa={choice.kind === 'resolved' ? choice.tenant : null}
      empresas={options}
      terms={terms}
      avisos={avisos}
    >
      {children}
    </AppShell>
  );
}
