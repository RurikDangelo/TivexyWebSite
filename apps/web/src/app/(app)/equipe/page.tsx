import { type MembershipStatus, can, dateIn } from '@tivexy/core';
import { Info, MailQuestion, SearchX, UserRoundCheck, UserRoundX, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormWarning } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { FilterBar } from '@/components/page/filter-bar';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Pagination } from '@/components/page/pagination';
import { buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TH, THead, TR, Table, TableEmpty, hrefDeOrdem } from '@/components/ui/table';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { formatDate } from '@/lib/format';
import { paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';

import { LinhaDaPessoa, colunasDaTabela } from './member-row';
import { ORDEM_DA_SITUACAO, SITUACAO, type MembroNaTela, type Papel } from './state';
import { InviteForm, MemberRow } from './team-forms';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/equipe') };
}

/** 25 cabem na tela de 1080p com folga, e a tabela tem 44px por linha. */
const POR_PAGINA = 25;

function relacao<T>(valor: unknown): T | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  return (linha ?? null) as T | null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * O que veio no endereço
 *
 * Busca, filtro e ordem são GET: sobrevivem ao recarregar e cabem num link
 * mandado para quem vai conferir junto.
 * ────────────────────────────────────────────────────────────────────────── */

type Param = string | string[] | undefined;

function primeiro(bruto: Param): string | undefined {
  return Array.isArray(bruto) ? bruto[0] : bruto;
}

function termoPedido(bruto: Param): string {
  const texto = primeiro(bruto);
  return typeof texto === 'string' ? texto.trim().slice(0, 80) : '';
}

function situacaoPedida(bruto: Param): MembershipStatus | null {
  const texto = primeiro(bruto);
  return texto === 'active' || texto === 'invited' || texto === 'suspended' ? texto : null;
}

type ChaveDeOrdem = 'nome' | 'email' | 'papel' | 'situacao' | 'desde';

function ehChaveDeOrdem(valor: string): valor is ChaveDeOrdem {
  return (
    valor === 'nome' ||
    valor === 'email' ||
    valor === 'papel' ||
    valor === 'situacao' ||
    valor === 'desde'
  );
}

/** O `?ordem=` vigente, ou `null` quando ninguém pediu (ou pediu coluna que não existe). */
function ordemPedida(bruto: Param): string | null {
  const texto = primeiro(bruto);
  if (typeof texto !== 'string') return null;
  const chave = texto.startsWith('-') ? texto.slice(1) : texto;
  return ehChaveDeOrdem(chave) ? texto : null;
}

const COMPARADOR: Record<ChaveDeOrdem, (a: MembroNaTela, b: MembroNaTela) => number> = {
  nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  email: (a, b) => (a.email ?? '').localeCompare(b.email ?? '', 'pt-BR'),
  papel: (a, b) => a.papel.localeCompare(b.papel, 'pt-BR'),
  situacao: (a, b) => ORDEM_DA_SITUACAO[a.status] - ORDEM_DA_SITUACAO[b.status],
  /* Data crua, nunca a formatada: `01/2025` vem depois de `31/2024` no
   * alfabeto, e a coluna pareceria ordenada sem estar. Quem ainda não entrou
   * não tem data e cai no começo da ordem crescente. */
  desde: (a, b) => (a.desdeIso ?? '').localeCompare(b.desdeIso ?? ''),
};

/** Sem ordem pedida: quem já trabalha primeiro, e dentro de cada grupo por nome. */
function ordemPadrao(a: MembroNaTela, b: MembroNaTela): number {
  return (
    ORDEM_DA_SITUACAO[a.status] - ORDEM_DA_SITUACAO[b.status] ||
    a.nome.localeCompare(b.nome, 'pt-BR')
  );
}

function ordenar(lista: readonly MembroNaTela[], ordem: string | null): MembroNaTela[] {
  if (ordem === null) return [...lista].sort(ordemPadrao);
  const descendente = ordem.startsWith('-');
  const chave = descendente ? ordem.slice(1) : ordem;
  if (!ehChaveDeOrdem(chave)) return [...lista].sort(ordemPadrao);
  const comparar = COMPARADOR[chave];
  /* Desempate sempre pelo nome: sem ele, duas pessoas do mesmo papel trocam de
   * lugar entre recarregamentos e a lista parece instável. */
  return [...lista].sort(
    (a, b) =>
      (descendente ? -comparar(a, b) : comparar(a, b)) || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/**
 * Quem trabalha nesta empresa, com que papel, e em que situação.
 *
 * O dono não reconheceu esta tela como gestão de equipe, e o motivo estava na
 * tela: ela listava gente sem dizer que dali se convida, se troca o papel e se
 * encerra o acesso. Agora o convite é a ação primária do cabeçalho, papel e
 * situação são colunas, e cada linha carrega o próprio menu de ações.
 *
 * As regras que importam continuam no banco — a empresa não fica sem
 * administrador, e ninguém dá um papel com mais poder que o seu. A tela
 * explica quando uma delas recusa.
 */
export default async function EquipePage({ searchParams }: PageProps<'/equipe'>) {
  const { choice, viewer } = await requireAccess('/equipe');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const podeEditar = can(viewer, 'core.users.write');
  const fuso = await tenantTimeZone();
  const supabase = await supabaseServer();

  const params = await searchParams;
  const termo = termoPedido(params.q);
  const situacao = situacaoPedida(params.situacao);
  const ordem = ordemPedida(params.ordem);
  const pagina = paginaPedida(params.pagina);

  const [membrosR, papeisR] = await Promise.all([
    supabase
      .from('tenant_users')
      .select(
        'id, status, joined_at, user_id, role_id, users!tenant_users_user_id_fkey(full_name, email), roles(name)',
      )
      .eq('tenant_id', tenantId),
    supabase
      .from('roles')
      .select('id, name, is_system, tenant_id')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('is_system', { ascending: false })
      .order('name'),
  ]);

  const membros: MembroNaTela[] = (membrosR.data ?? []).map((m) => {
    const pessoa = relacao<{ full_name: string | null; email: string | null }>(m.users);
    const papel = relacao<{ name: string }>(m.roles);
    const entrada = typeof m.joined_at === 'string' ? m.joined_at : null;
    return {
      vinculoId: String(m.id),
      nome: pessoa?.full_name?.trim() || pessoa?.email || 'Sem nome',
      email: pessoa?.email ?? null,
      papelId: String(m.role_id),
      papel: papel?.name ?? '—',
      status: m.status as MembershipStatus,
      desde: entrada === null ? null : formatDate(dateIn(entrada, fuso)),
      desdeIso: entrada,
      voce: m.user_id === viewer.userId,
    };
  });

  const papeis: Papel[] = (papeisR.data ?? []).map((p) => ({
    id: String(p.id),
    nome: String(p.name),
    sistema: p.is_system === true,
  }));

  /*
   * Busca, filtro, ordem e página são resolvidos aqui, e não no banco, de
   * propósito: a consulta acima já lê o vínculo INTEIRO da empresa (sempre
   * leu). Filtrar no banco faria os três números do topo virarem o total da
   * página em vez do total da empresa — e um KPI que muda quando se digita na
   * busca não é um KPI, é uma contagem de recorte com nome errado.
   */
  const leu = membrosR.error === null;
  const procurado = termo.toLocaleLowerCase('pt-BR');
  const filtrados = membros.filter(
    (m) =>
      (situacao === null || m.status === situacao) &&
      (procurado === '' ||
        m.nome.toLocaleLowerCase('pt-BR').includes(procurado) ||
        (m.email ?? '').toLocaleLowerCase('pt-BR').includes(procurado)),
  );
  const ordenados = ordenar(filtrados, ordem);
  const inicio = (pagina - 1) * POR_PAGINA;
  const naPagina = ordenados.slice(inicio, inicio + POR_PAGINA);

  const porSituacao = (alvo: MembershipStatus) => membros.filter((m) => m.status === alvo).length;
  const filtrando = termo !== '' || situacao !== null;
  /* Um evento de entrada por rota (seção 8, regra 3): filtrar, ordenar ou
   * paginar é continuar na mesma tela, e recomeçar a coreografia faria a lista
   * piscar a cada tecla. */
  const primeiraVez = !filtrando && ordem === null && pagina === 1;
  const colunas = colunasDaTabela(podeEditar);
  /* Ordem e filtro preservam um ao outro: o formulário reescreve a query
   * inteira, e o cabeçalho ordenável monta a dele a partir do que sobrou. */
  const paramsDaOrdem = { q: termo, situacao };

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={sectionTitle(terms, '/equipe')}
        descricao="Quem entra nesta empresa, com que papel e em que situação. É daqui que você convida alguém, troca o papel de quem já está e encerra o acesso de quem saiu."
        acoes={podeEditar && papeis.length > 0 ? <InviteForm papeis={papeis} /> : undefined}
      />

      <div className="flex flex-col gap-6">
        <StatGrid colunas={3}>
          <Stat
            rotulo="Com acesso"
            valor={leu ? porSituacao('active') : null}
            Icone={UserRoundCheck}
            nota="entram nesta empresa hoje"
            contar
          />
          <Stat
            rotulo="Convite pendente"
            valor={leu ? porSituacao('invited') : null}
            Icone={MailQuestion}
            tom="warning"
            nota="convidadas, ainda sem primeiro acesso"
            contar
          />
          <Stat
            rotulo="Acesso suspenso"
            valor={leu ? porSituacao('suspended') : null}
            Icone={UserRoundX}
            nota="o vínculo fica, o acesso não"
            contar
          />
        </StatGrid>

        {podeEditar && papeis.length === 0 && (
          <FormWarning>
            Não consegui ler os papéis desta empresa — sem eles não dá para convidar nem trocar o
            papel de ninguém. Recarregue a página em instantes.
          </FormWarning>
        )}

        <div className="flex flex-col gap-4">
          <FilterBar
            busca={{
              rotulo: 'Buscar pessoa por nome ou e-mail',
              placeholder: 'Nome ou e-mail',
              valor: termo,
            }}
            filtros={
              /* `aria-label` no lugar de um `<label>` irmão: o filtro tem uma
                 opção que já se lê como rótulo ("Todas as situações"), e um
                 rótulo visível a mais na barra empurraria a busca. */
              <Select
                name="situacao"
                aria-label="Situação do vínculo"
                defaultValue={situacao ?? ''}
                className="md:w-52"
              >
                <option value="">Todas as situações</option>
                {(['active', 'invited', 'suspended'] as const).map((chave) => (
                  <option key={chave} value={chave}>
                    {SITUACAO[chave].rotulo}
                  </option>
                ))}
              </Select>
            }
            ocultos={ordem === null ? undefined : { ordem }}
          />

          {leu ? (
            <Table densidade="larga" rotulo="Pessoas com acesso a esta empresa">
              <THead sticky>
                <TR>
                  <TH
                    ordem={{
                      chave: 'nome',
                      atual: ordem,
                      href: hrefDeOrdem(paramsDaOrdem, 'nome', ordem),
                    }}
                  >
                    Pessoa
                  </TH>
                  <TH
                    ordem={{
                      chave: 'email',
                      atual: ordem,
                      href: hrefDeOrdem(paramsDaOrdem, 'email', ordem),
                    }}
                  >
                    E-mail
                  </TH>
                  <TH
                    ordem={{
                      chave: 'papel',
                      atual: ordem,
                      href: hrefDeOrdem(paramsDaOrdem, 'papel', ordem),
                    }}
                  >
                    Papel
                  </TH>
                  <TH
                    ordem={{
                      chave: 'situacao',
                      atual: ordem,
                      href: hrefDeOrdem(paramsDaOrdem, 'situacao', ordem),
                    }}
                  >
                    Situação
                  </TH>
                  <TH
                    ordem={{
                      chave: 'desde',
                      atual: ordem,
                      href: hrefDeOrdem(paramsDaOrdem, 'desde', ordem),
                    }}
                  >
                    No acesso desde
                  </TH>
                  {podeEditar && (
                    <TH alinhamento="fim">
                      <span className="sr-only">Ações</span>
                    </TH>
                  )}
                </TR>
              </THead>

              <TBody>
                {naPagina.map((m, i) =>
                  podeEditar ? (
                    <MemberRow
                      key={m.vinculoId}
                      membro={m}
                      papeis={papeis}
                      animar={primeiraVez}
                      indice={i}
                    />
                  ) : (
                    /* Quem só lê não recebe coluna de ações nem o JavaScript do menu. */
                    <LinhaDaPessoa key={m.vinculoId} membro={m} animar={primeiraVez} indice={i} />
                  ),
                )}

                {naPagina.length === 0 && membros.length === 0 && (
                  <TableEmpty colunas={colunas} icone={Users} titulo="Ninguém por aqui ainda">
                    Enquanto só você entra, ninguém mais registra venda, atende cliente nem lança
                    despesa.{' '}
                    {podeEditar
                      ? 'Convide a primeira pessoa pelo botão “Convidar pessoa”, no topo desta tela — ela recebe um papel, e o papel decide o que ela vê.'
                      : 'Quem administra a empresa é quem faz o convite.'}
                  </TableEmpty>
                )}

                {naPagina.length === 0 && membros.length > 0 && (
                  <TableEmpty
                    colunas={colunas}
                    icone={SearchX}
                    titulo={filtrando ? 'Nenhuma pessoa com esse recorte' : 'Nada nesta página'}
                    acao={
                      <Link
                        href="/equipe"
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Ver todas as pessoas
                      </Link>
                    }
                  >
                    {filtrando
                      ? `A empresa tem ${membros.length === 1 ? '1 pessoa' : `${membros.length} pessoas`}, mas nenhuma passa por este filtro. Afrouxe a busca ou volte para todas as situações.`
                      : 'A lista acabou antes desta página. Volte para o começo.'}
                  </TableEmpty>
                )}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              estado="erro"
              titulo="Não consegui ler a equipe"
              acao={
                <Link href="/equipe" className={buttonVariants({ variant: 'outline' })}>
                  Tentar de novo
                </Link>
              }
            >
              A leitura falhou agora — não dá para saber quem tem acesso a esta empresa. Nada foi
              alterado. Tente de novo em instantes.
            </EmptyState>
          )}

          <Pagination
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={ordenados.length}
            params={{ q: termo, situacao, ordem }}
          />
        </div>

        <p className="flex max-w-prose items-start gap-2 text-caption text-content-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Esta tela é de pessoas e papéis. Grupos de trabalho — as equipes que o banco já guarda —
            e a lista do que cada papel concede ainda não têm tela: nada aqui os representa.
          </span>
        </p>
      </div>
    </Page>
  );
}
