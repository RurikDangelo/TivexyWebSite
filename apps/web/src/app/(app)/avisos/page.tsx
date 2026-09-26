import { Bell, BellOff, CheckCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { FormError } from '@/components/form/messages';
import { Submit } from '@/components/form/submit';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Pagination } from '@/components/page/pagination';
import { requireAccess } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';

import { marcarTodosComoLidos } from './actions';
import { type Aviso, NotificationList } from './notification-list';

export const metadata: Metadata = { title: 'Avisos' };

const POR_PAGINA = 30;

/**
 * Os avisos desta pessoa, nesta empresa.
 *
 * Nascem das automações — nada aqui é e-mail, nada sai do Tivexy. Só a
 * própria pessoa lê os dela; o banco garante (`notifications_read_own`).
 */
export default async function AvisosPage({ searchParams }: PageProps<'/avisos'>) {
  const { choice, viewer } = await requireAccess('/avisos');
  if (choice.kind !== 'resolved' || viewer.userId === null) return <NoTenant />;

  const params = await searchParams;
  const pagina = paginaPedida(params.pagina);
  const fuso = await tenantTimeZone();
  const supabase = await supabaseServer();
  const inicio = (pagina - 1) * POR_PAGINA;
  const [lista, naoLidos] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, title, body, link, created_at, read_at', { count: 'exact' })
      .eq('tenant_id', choice.tenant.id)
      .eq('user_id', viewer.userId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(inicio, inicio + POR_PAGINA - 1),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', choice.tenant.id)
      .eq('user_id', viewer.userId)
      .is('read_at', null),
  ]);

  const avisos: Aviso[] = (lista.data ?? []).map((a) => ({
    id: String(a.id),
    titulo: String(a.title),
    texto: typeof a.body === 'string' ? a.body : null,
    temLink: typeof a.link === 'string' && a.link !== '',
    quando: String(a.created_at),
    lido: a.read_at !== null,
  }));
  const pendentes = naoLidos.count ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo="Avisos"
        descricao={
          pendentes === 0
            ? 'Tudo lido. Os avisos nascem das automações da empresa, e ficam só aqui dentro.'
            : `${contagem(pendentes, 'aviso não lido', 'avisos não lidos')}. Os avisos nascem das automações da empresa, e ficam só aqui dentro.`
        }
        acoes={
          pendentes > 0 ? (
            <form action={marcarTodosComoLidos}>
              <Submit variant="outline" size="sm" pendente="Marcando…">
                <CheckCheck aria-hidden />
                Marcar tudo como lido
              </Submit>
            </form>
          ) : undefined
        }
      />

      {(lista.error !== null || naoLidos.error !== null) && (
        <div className="mb-4">
          <FormError>Não consegui ler os avisos agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      {avisos.length === 0 && lista.error === null ? (
        <EmptyState icone={BellOff} titulo={pagina > 1 ? 'Nada nesta página' : 'Nenhum aviso'}>
          Aviso aparece aqui quando uma automação da empresa manda um para você — por exemplo, num
          registro acima de um valor ou num saldo que chegou no mínimo. Nada aqui é e-mail.
        </EmptyState>
      ) : (
        <NotificationList avisos={avisos} fuso={fuso} />
      )}

      <Pagination pagina={pagina} porPagina={POR_PAGINA} total={lista.count ?? 0} params={{}} />
      <p className="mt-6 flex items-center gap-1.5 text-xs text-content-subtle">
        <Bell className="size-3.5" aria-hidden />O número no sino atualiza a cada página aberta —
        não há aviso em tempo real.
      </p>
    </div>
  );
}
