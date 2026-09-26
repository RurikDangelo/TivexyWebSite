import type { MembershipStatus } from '@tivexy/core';
import { UserRound, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { FilterBar } from '@/components/page/filter-bar';
import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Stat, StatGrid } from '@/components/ui/stat';
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from '@/components/ui/table';
import { supabaseServer } from '@/lib/supabase/server';
import { atrasoDaLinha, cn } from '@/lib/utils';

import { dataDaPlataforma } from '../plataforma';
import { AccessLinkButton } from './access-link-button';

export const metadata: Metadata = { title: 'Usuários' };

/*
 * Quem tem vínculo com cada empresa — a aba que o dono pediu e que não existia
 * em lugar nenhum do produto.
 *
 * `/equipe` lista as pessoas de **uma** empresa, para quem opera aquela
 * empresa. Esta lista é outra coisa: é a plataforma inteira, vista de cima,
 * por quem administra todos os clientes. As duas leem `tenant_users`; nenhuma
 * duplica a regra, porque quem decide quem enxerga o quê é o RLS.
 *
 * Lida com `supabaseServer()`, que carrega a sessão e **passa pelo RLS** — não
 * com o cliente de serviço. `tenant_users_read` já libera tudo para
 * `is_super_admin()`. Usar a chave secreta aqui seria contornar a verificação
 * em vez de exercitá-la; se a política quebrar, a tela fica vazia, e ficar
 * vazia é o sintoma que se quer.
 */

/** Quantos vínculos a consulta traz por vez. Exportado para a tela poder dizer que parou aqui. */
const LIMITE = 200;

/**
 * Situação do vínculo em português.
 *
 * `Record` sobre o tipo do Core: um estado novo no enum não compila até ganhar
 * rótulo — e rótulo esquecido é código de banco na tela.
 */
const SITUACAO_DO_VINCULO: Readonly<
  Record<MembershipStatus, { rotulo: string; tom: 'success' | 'warning' | 'danger' }>
> = {
  active: { rotulo: 'Ativo', tom: 'success' },
  invited: { rotulo: 'Convidado', tom: 'warning' },
  suspended: { rotulo: 'Suspenso', tom: 'danger' },
};

interface Empresa {
  id: string;
  name: string;
  slug: string;
}

/** Uma relação para-um do PostgREST chega como objeto ou como lista de um. */
function umDe<T>(valor: unknown): T | null {
  const alvo = Array.isArray(valor) ? valor[0] : valor;
  return alvo === null || alvo === undefined || typeof alvo !== 'object' ? null : (alvo as T);
}

interface LinhaBruta {
  id: string;
  status: MembershipStatus;
  invited_at: string;
  joined_at: string | null;
  users: unknown;
  roles: unknown;
  tenants: unknown;
}

interface Vinculo {
  id: string;
  status: MembershipStatus;
  invited_at: string;
  joined_at: string | null;
  nome: string | null;
  email: string | null;
  papel: string | null;
  empresa: { id: string; name: string; slug: string } | null;
}

function normalizar(linha: LinhaBruta): Vinculo {
  const pessoa = umDe<{ email?: unknown; full_name?: unknown }>(linha.users);
  const papel = umDe<{ name?: unknown }>(linha.roles);
  const empresa = umDe<{ id?: unknown; name?: unknown; slug?: unknown }>(linha.tenants);

  return {
    id: String(linha.id),
    status: linha.status,
    invited_at: linha.invited_at,
    joined_at: linha.joined_at,
    nome:
      typeof pessoa?.full_name === 'string' && pessoa.full_name !== '' ? pessoa.full_name : null,
    email: typeof pessoa?.email === 'string' ? pessoa.email : null,
    papel: typeof papel?.name === 'string' ? papel.name : null,
    empresa:
      typeof empresa?.id === 'string' &&
      typeof empresa.name === 'string' &&
      typeof empresa.slug === 'string'
        ? { id: empresa.id, name: empresa.name, slug: empresa.slug }
        : null,
  };
}

export default async function UsuariosPage({ searchParams }: PageProps<'/adminpanel/usuarios'>) {
  const params = await searchParams;
  const empresaBruta = typeof params.empresa === 'string' ? params.empresa : '';

  const supabase = await supabaseServer();

  /* As empresas do seletor. Mesmo cliente, mesmo RLS — é a lista da aba Clientes. */
  const { data: empresasBrutas } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .order('name', { ascending: true })
    .limit(500);
  const empresas = (empresasBrutas ?? []) as unknown as Empresa[];

  /*
   * O `?empresa=` só vale se casar com uma empresa que esta sessão alcança.
   *
   * Não é teatro de segurança — o RLS decide isso de qualquer jeito. É que
   * `tenant_id` é `uuid`: um valor inventado na URL faz o Postgres recusar a
   * consulta inteira, e a tela mostraria "não consegui ler os vínculos" para
   * um problema que é só um parâmetro torto. Parâmetro inválido cai no
   * padrão — sem filtro —, como `lerOrdem` faz na aba Clientes.
   */
  const empresaEscolhida = empresas.find((e) => e.id === empresaBruta) ?? null;
  const empresaFiltro = empresaEscolhida?.id ?? '';

  /*
   * `users!tenant_users_user_id_fkey` porque `tenant_users` tem DUAS chaves
   * estrangeiras para `users`: `user_id` e `invited_by`. Sem nomear a
   * restrição, o PostgREST recusa a consulta por ambiguidade — e o erro só
   * apareceria em tempo de execução.
   */
  let consulta = supabase
    .from('tenant_users')
    .select(
      'id, status, invited_at, joined_at, ' +
        'users!tenant_users_user_id_fkey(email, full_name), ' +
        'roles(name), ' +
        'tenants(id, name, slug)',
      { count: 'exact' },
    );

  /*
   * O filtro é por `tenant_id`, coluna da própria tabela — e não por um campo
   * da relação embutida. É o que mantém o recorte dentro do banco: filtrar
   * depois, em JavaScript, filtraria sobre as 200 linhas já truncadas e
   * esconderia gente sem avisar.
   */
  if (empresaFiltro !== '') consulta = consulta.eq('tenant_id', empresaFiltro);

  /*
   * Ordenado por `invited_at`, coluna de primeiro nível. Ordenar por nome da
   * empresa exigiria ordenar por relação embutida, que o PostgREST resolve de
   * forma frágil — e sobre um recorte truncado a ordem sairia errada sem
   * avisar. Quem quer ver uma empresa só usa o filtro, que é exato.
   */
  const { data, error, count } = await consulta
    .order('invited_at', { ascending: false })
    .limit(LIMITE);

  const vinculos = ((data ?? []) as unknown as LinhaBruta[]).map(normalizar);

  const total = count ?? null;
  const truncada = total === null ? vinculos.length >= LIMITE : total > vinculos.length;
  const parcial = truncada
    ? `somado sobre os ${vinculos.length} carregados${total === null ? ', de um total que não consegui contar' : ` de ${total}`}`
    : undefined;

  const quantos = (situacao: MembershipStatus) =>
    vinculos.filter((v) => v.status === situacao).length;

  const filtrando = empresaFiltro !== '';

  return (
    <Page variant="painel" className="flex flex-col gap-6">
      <PageHeader
        titulo="Usuários"
        descricao={
          empresaEscolhida !== null
            ? `Os vínculos de ${empresaEscolhida.name}.`
            : total === null
              ? `Todos os vínculos de pessoa com empresa. Mostrando ${vinculos.length}.`
              : truncada
                ? `Todos os vínculos de pessoa com empresa. Mostrando os ${vinculos.length} mais recentes de ${total}.`
                : `Todos os vínculos de pessoa com empresa. ${total} no total.`
        }
        className="mb-0"
      />

      <StatGrid colunas={3}>
        <Stat
          rotulo="Vínculos ativos"
          valor={quantos('active')}
          Icone={UserRound}
          tom="success"
          parcial={parcial}
          contar
          animar={!filtrando}
          atraso={atrasoDaLinha(0)}
        />
        <Stat
          rotulo="Convites pendentes"
          valor={quantos('invited')}
          Icone={Users}
          tom="warning"
          /*
           * A nota é a razão de ser desta aba: o convite não foi ENTREGUE,
           * porque não há servidor de e-mail. Dizer só "pendente" deixaria
           * parecer que alguém está demorando a aceitar.
           */
          nota="nenhum e-mail foi enviado — gere o link"
          parcial={parcial}
          contar
          animar={!filtrando}
          atraso={atrasoDaLinha(1)}
        />
        <Stat
          rotulo="Acessos suspensos"
          valor={quantos('suspended')}
          Icone={Users}
          tom="danger"
          parcial={parcial}
          contar
          animar={!filtrando}
          atraso={atrasoDaLinha(2)}
        />
      </StatGrid>

      <FilterBar
        filtros={
          <Select
            name="empresa"
            defaultValue={empresaFiltro}
            aria-label="Filtrar por empresa"
            className="md:w-64"
          >
            <option value="">Todas as empresas</option>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>
                {empresa.name}
              </option>
            ))}
          </Select>
        }
        rotuloDeEnvio="Filtrar"
        acoes={
          empresaEscolhida !== null ? (
            <Link
              href={`/adminpanel/clientes/${empresaEscolhida.id}`}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Abrir {empresaEscolhida.name}
            </Link>
          ) : undefined
        }
      />

      {error !== null ? (
        <EmptyState estado="erro" titulo="Não consegui ler os vínculos">
          {error.message} Recarregar costuma resolver; se insistir, a política de acesso do banco é
          o primeiro lugar a olhar.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          <Table densidade="densa" rotulo="Vínculos de pessoas com empresas">
            <THead sticky>
              <tr>
                <TH>Pessoa</TH>
                <TH className="hidden max-md:block lg:table-cell">Empresa</TH>
                <TH>Papel</TH>
                <TH>Situação</TH>
                <TH className="hidden max-md:block xl:table-cell" alinhamento="fim">
                  Convidado em
                </TH>
                <TH alinhamento="fim">Acesso</TH>
              </tr>
            </THead>
            <TBody>
              {vinculos.length === 0 ? (
                <TableEmpty
                  colunas={6}
                  icone={Users}
                  titulo={filtrando ? 'Nenhum vínculo nesta empresa' : 'Nenhum vínculo ainda'}
                  acao={
                    filtrando ? (
                      <Link
                        href="/adminpanel/usuarios"
                        className={cn(buttonVariants({ variant: 'outline' }))}
                      >
                        Ver todas as empresas
                      </Link>
                    ) : (
                      <Link
                        href="/adminpanel/clientes/novo"
                        className={cn(buttonVariants({ variant: 'outline' }))}
                      >
                        Criar o primeiro cliente
                      </Link>
                    )
                  }
                >
                  {filtrando
                    ? 'A empresa existe e ninguém tem acesso a ela. O administrador nasce junto com o provisionamento — se ele não está aqui, a etapa de criar administrador não concluiu.'
                    : 'Nenhuma pessoa está ligada a nenhuma empresa. O primeiro vínculo nasce no provisionamento de um cliente.'}
                </TableEmpty>
              ) : (
                vinculos.map((vinculo) => {
                  const rotulo = SITUACAO_DO_VINCULO[vinculo.status];

                  return (
                    <TR key={vinculo.id}>
                      <TD truncar>
                        <span className="block truncate font-medium text-content">
                          {vinculo.nome ?? vinculo.email ?? 'sem nome'}
                        </span>
                        {vinculo.nome !== null && vinculo.email !== null && (
                          <span className="block truncate text-caption text-content-muted">
                            {vinculo.email}
                          </span>
                        )}
                      </TD>

                      <TD rotulo="Empresa" truncar className="hidden max-md:flex lg:table-cell">
                        {vinculo.empresa === null ? (
                          <span className="text-content-subtle">—</span>
                        ) : (
                          <Link
                            href={`/adminpanel/clientes/${vinculo.empresa.id}`}
                            className="text-content-accent underline-offset-4 hover:underline"
                          >
                            {vinculo.empresa.name}
                          </Link>
                        )}
                      </TD>

                      <TD rotulo="Papel" truncar>
                        {/*
                         * O nome do papel, lido de `roles.name`. Um blueprint
                         * cria papéis próprios por nicho — "Recepção" numa
                         * clínica —, e imprimir o `code` aqui mostraria
                         * `recepcao` em vez do nome que o cliente vê.
                         */}
                        {vinculo.papel ?? <span className="text-content-subtle">—</span>}
                      </TD>

                      <TD rotulo="Situação">
                        <Badge tone={rotulo.tom}>{rotulo.rotulo}</Badge>
                      </TD>

                      <TD
                        rotulo="Convidado em"
                        numerico
                        className="hidden max-md:flex xl:table-cell"
                      >
                        {dataDaPlataforma(vinculo.invited_at)}
                      </TD>

                      <TD acoes>
                        {vinculo.email === null ? (
                          /*
                           * Sem e-mail não há link: `generate_link` é por
                           * e-mail. Um botão que não pode funcionar é pior do
                           * que a frase que explica por quê.
                           */
                          <span className="text-caption text-content-subtle">
                            sem e-mail na conta
                          </span>
                        ) : (
                          <AccessLinkButton
                            email={vinculo.email}
                            nome={vinculo.nome ?? vinculo.email}
                          />
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>

          <p className="text-caption text-content-subtle">
            O link de acesso é gerado sob demanda e <strong>nenhum e-mail é enviado</strong>: o
            projeto ainda usa o servidor de e-mail embutido do Supabase, que só escreve para membros
            da equipe. Servidor de e-mail próprio é dependência externa pendente — até lá, esta aba
            é o caminho para reentregar um acesso.
          </p>

          {truncada && (
            <p className="text-caption text-content-subtle">
              A consulta para em {LIMITE} vínculos, dos mais recentes para os mais antigos. Filtrar
              por empresa é o caminho para alcançar o resto; ainda não há busca por nome nem
              paginação.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
