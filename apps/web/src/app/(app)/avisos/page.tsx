import { Bell, BellOff, BellRing, CheckCheck, Inbox, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Submit } from '@/components/form/submit';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Pagination } from '@/components/page/pagination';
import { buttonVariants } from '@/components/ui/button';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';
import { requireAccess } from '@/lib/auth/require';
import { paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';

import { marcarTodosComoLidos } from './actions';
import { COLUNAS_DE_AVISOS, LinhaDeAviso, type Aviso } from './notification-row';

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

  /*
   * Os três números são `count: 'exact'` do banco, não o tamanho da página:
   * são totais de verdade. `null` quando a leitura falhou — o `Stat` escreve
   * que não conseguiu ler, em vez de exibir um zero que passaria por medida.
   */
  const leu = lista.error === null && naoLidos.error === null;
  const total = lista.count ?? 0;
  const pendentes = naoLidos.count ?? 0;

  return (
    <Page variant="operacao">
      <PageHeader
        titulo="Avisos"
        descricao="O que as automações desta empresa mandaram para você. Nada aqui é e-mail: os avisos nascem e ficam dentro do Tivexy."
        acoes={
          leu && pendentes > 0 ? (
            <form action={marcarTodosComoLidos}>
              <Submit variant="outline" pendente="Marcando…">
                <CheckCheck aria-hidden />
                Marcar tudo como lido
              </Submit>
            </form>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6">
        <StatGrid colunas={3}>
          <Stat
            rotulo="Não lidos"
            valor={leu ? pendentes : null}
            Icone={BellRing}
            tom="warning"
            nota="é este o número do sino"
            contar
          />
          <Stat
            rotulo="Já lidos"
            valor={leu ? total - pendentes : null}
            Icone={Bell}
            nota="ficam aqui, não somem"
            contar
          />
          <Stat
            rotulo="Todos os avisos"
            valor={leu ? total : null}
            Icone={Inbox}
            nota="desde que a empresa começou"
            contar
          />
        </StatGrid>

        <div className="flex flex-col gap-4">
          {leu ? (
            <Table densidade="larga" rotulo="Seus avisos nesta empresa">
              <THead sticky>
                <TR>
                  <TH className="w-px whitespace-nowrap">Situação</TH>
                  <TH>Aviso</TH>
                  <TH>Quando</TH>
                  <TH alinhamento="fim">
                    <span className="sr-only">Ações</span>
                  </TH>
                </TR>
              </THead>

              <TBody>
                {avisos.map((aviso, i) => (
                  <LinhaDeAviso
                    key={aviso.id}
                    aviso={aviso}
                    fuso={fuso}
                    animar={pagina === 1}
                    indice={i}
                  />
                ))}

                {avisos.length === 0 && total === 0 && (
                  <TableEmpty colunas={COLUNAS_DE_AVISOS} icone={BellOff} titulo="Nenhum aviso">
                    Um aviso aparece aqui quando uma automação da empresa manda um para você — por
                    exemplo, num registro acima de um valor ou num saldo que chegou no mínimo.
                    Enquanto nenhuma regra disparar, esta lista fica vazia, e isso é o esperado.
                  </TableEmpty>
                )}

                {avisos.length === 0 && total > 0 && (
                  <TableEmpty
                    colunas={COLUNAS_DE_AVISOS}
                    icone={SearchX}
                    titulo="Nada nesta página"
                    acao={
                      <Link
                        href="/avisos"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Voltar ao começo
                      </Link>
                    }
                  >
                    A lista acabou antes desta página — você tem {total.toLocaleString('pt-BR')}{' '}
                    {total === 1 ? 'aviso' : 'avisos'} no total.
                  </TableEmpty>
                )}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              estado="erro"
              titulo="Não consegui ler os avisos"
              acao={
                <Link href="/avisos" className={buttonVariants({ variant: 'outline' })}>
                  Tentar de novo
                </Link>
              }
            >
              A leitura falhou agora, então não dá para saber se há aviso esperando por você — nem o
              número do sino é confiável nesta carga. Nada foi marcado como lido.
            </EmptyState>
          )}

          <Pagination pagina={pagina} porPagina={POR_PAGINA} total={total} params={{}} />
        </div>

        <p className="flex max-w-prose items-start gap-2 text-caption text-content-subtle">
          <Bell className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            O número no sino atualiza a cada página aberta — não há aviso em tempo real, e esta
            lista não se ordena nem se filtra ainda.
          </span>
        </p>
      </div>
    </Page>
  );
}
