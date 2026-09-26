import { type TenantStatus, isOperational } from '@tivexy/core';
import { blueprintByCode } from '@tivexy/core/blueprints';
import {
  Building2,
  CircleCheck,
  CirclePause,
  Loader,
  Plus,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { Page } from '@/components/page/page';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Stat, StatGrid } from '@/components/ui/stat';
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableEmpty,
  hrefDeOrdem,
  type OrdemDaColuna,
} from '@/components/ui/table';
import { SITUACAO } from '@/lib/admin/labels';
import { embeddedCode } from '@/lib/supabase/embedded';
import { supabaseServer } from '@/lib/supabase/server';
import { atrasoDaLinha, cn } from '@/lib/utils';
import { sqlClient } from '@/server/db';

import { AvisoDeEndereco } from './endereco';
import { FailedRuns, type FalhaResumo } from './failed-runs';
import { dataDaPlataforma } from './plataforma';

export const metadata: Metadata = { title: 'Clientes' };

/*
 * A lista de clientes da plataforma.
 *
 * Lida com `supabaseServer()`, que carrega a sessão e **passa pelo RLS** — não
 * com o cliente de serviço. A política `tenants_select` já libera tudo para
 * `is_super_admin()`; usar a chave secreta aqui seria contornar a verificação
 * em vez de exercitá-la. Se um dia a política quebrar, esta tela fica vazia, e
 * ficar vazia é o sintoma que se quer.
 */

/**
 * Quantos clientes a consulta traz por vez.
 *
 * O número é exportado para a tela: ela precisa dizer que parou aqui. Antes o
 * cabeçalho afirmava "{n} no total" sobre uma consulta truncada — com 140
 * clientes, dizia 100 e omitia 40 sem nenhum sinal.
 */
const LIMITE = 100;

/** Quantas execuções paradas o aviso do topo mostra. Também é um teto, e também se diz. */
const LIMITE_DE_FALHAS = 20;

const JANELA_MS = 30 * 86_400_000;

interface Linha {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  status_reason: string | null;
  created_at: string;
  plans: unknown;
}

/**
 * As colunas por que dá para ordenar, e a coluna de banco de cada uma.
 *
 * Mapa fechado, não interpolação: o `?ordem=` vem da URL, e o valor bruto nunca
 * chega ao `order()`. Nicho, plano e módulos ficam de fora porque não são
 * colunas de `tenants` — ordenar por elas exigiria ordenar fora do banco, sobre
 * um recorte já truncado, e a ordem sairia errada sem avisar.
 */
const COLUNAS_ORDENAVEIS = {
  nome: 'name',
  endereco: 'slug',
  situacao: 'status',
  criado: 'created_at',
} as const;

type ChaveDeOrdem = keyof typeof COLUNAS_ORDENAVEIS;

/** O mais novo primeiro: num painel de plataforma, quem chegou é o que se olha. */
const ORDEM_PADRAO = '-criado';

function ehChave(valor: string): valor is ChaveDeOrdem {
  return Object.hasOwn(COLUNAS_ORDENAVEIS, valor);
}

function lerOrdem(bruto: string | undefined): { chave: ChaveDeOrdem; ascendente: boolean } {
  const valor = bruto === undefined || bruto === '' ? ORDEM_PADRAO : bruto;
  const ascendente = !valor.startsWith('-');
  const chave = ascendente ? valor : valor.slice(1);
  /* Parâmetro inventado cai na ordem padrão — a tela não quebra por causa da URL. */
  return ehChave(chave) ? { chave, ascendente } : { chave: 'criado', ascendente: false };
}

/**
 * As execuções que falharam e ainda não foram desfeitas.
 *
 * Lidas por SQL direto, e não pelo cliente do Supabase: a consulta cruza
 * `provisioning_runs` com `tenants` e lê dentro do `payload`, que é jsonb.
 * Montar isso por PostgREST daria uma cadeia de chamadas para responder uma
 * pergunta que é uma consulta só.
 */
async function falhasAbertas(): Promise<FalhaResumo[]> {
  const { rows } = await sqlClient().query(
    `select r.id,
            r.current_step,
            r.last_error,
            (r.payload -> 'request') is not null as tem_entrada,
            t.name, t.slug
       from public.provisioning_runs r
       join public.tenants t on t.id = r.tenant_id
      where r.status = 'failed'
      order by r.created_at desc
      limit ${LIMITE_DE_FALHAS}`,
  );

  return rows.map((linha) => ({
    runId: String(linha.id),
    tenantName: String(linha.name),
    tenantSlug: String(linha.slug),
    etapa: String(linha.current_step ?? '—'),
    erro: String(linha.last_error ?? 'sem detalhe registrado'),
    temEntrada: linha.tem_entrada === true,
  }));
}

interface Complemento {
  /** Código do blueprint da última execução de provisionamento. */
  nicho: string | null;
  /** Nomes dos módulos ligados, já em ordem de exibição. */
  modulos: string | null;
}

/**
 * Nicho e módulos ligados de cada empresa — as duas colunas que a lista nunca
 * teve, e sem as quais não dá para responder "quais clientes de clínica eu
 * tenho?" sem abrir um por um.
 *
 * SQL direto pelo mesmo motivo de `falhasAbertas`: são duas subconsultas de
 * agregação, uma delas lendo dentro de jsonb. Por PostgREST seriam duas
 * chamadas e o `payload` inteiro de toda execução vindo pela rede.
 *
 * O cliente direto não passa pelo RLS, então o mapa não decide **quem** aparece
 * na tela: ele é consultado apenas pelos ids que a consulta autorizada já
 * devolveu. Nenhuma empresa entra na lista por este caminho.
 */
async function nichoEModulos(): Promise<Map<string, Complemento>> {
  const { rows } = await sqlClient().query(
    `select t.id,
            (select r.payload -> 'blueprint' ->> 'code'
               from public.provisioning_runs r
              where r.tenant_id = t.id
              order by r.created_at desc
              limit 1) as nicho,
            (select string_agg(m.name, ' · ' order by m.sort_order)
               from public.tenant_modules tm
               join public.modules m on m.id = tm.module_id
              where tm.tenant_id = t.id
                and tm.is_enabled) as modulos
       from public.tenants t`,
  );

  return new Map(
    rows.map((linha) => [
      String(linha.id),
      {
        nicho: typeof linha.nicho === 'string' && linha.nicho !== '' ? linha.nicho : null,
        modulos: typeof linha.modulos === 'string' && linha.modulos !== '' ? linha.modulos : null,
      },
    ]),
  );
}

/** Quantos instantes caem na janela `[inicio, fim)`. */
function criadosEntre(clientes: readonly Linha[], inicio: number, fim: number): number {
  return clientes.filter((c) => {
    const quando = new Date(c.created_at).getTime();
    return quando >= inicio && quando < fim;
  }).length;
}

/**
 * Os últimos 30 dias e os 30 anteriores, para o KPI de entrada.
 *
 * Fora do corpo do componente porque "agora" é impuro — e porque um instante
 * só para as duas janelas é o que impede a virada de um segundo colocar o mesmo
 * cliente nas duas contas.
 */
function janelasDeCriacao(clientes: readonly Linha[]): {
  ultimos30: number;
  anteriores30: number;
} {
  const agora = Date.now();
  return {
    ultimos30: criadosEntre(clientes, agora - JANELA_MS, agora + 1),
    anteriores30: criadosEntre(clientes, agora - 2 * JANELA_MS, agora - JANELA_MS),
  };
}

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const params = await searchParams;
  const ordemBruta = typeof params.ordem === 'string' ? params.ordem : undefined;
  const { chave, ascendente } = lerOrdem(ordemBruta);
  /* Normalizado: o `?ordem=` que a tela usa para marcar a coluna e montar o próximo clique. */
  const ordemAtual = `${ascendente ? '' : '-'}${chave}`;

  const supabase = await supabaseServer();
  /*
   * `count: 'exact'` não muda o que a consulta traz — muda o que a tela pode
   * afirmar. É a diferença entre "100 no total" (mentira quando há 140) e
   * "mostrando 100 de 140".
   */
  const { data, error, count } = await supabase
    .from('tenants')
    .select('id, slug, name, status, status_reason, created_at, plans(code)', { count: 'exact' })
    .order(COLUNAS_ORDENAVEIS[chave], { ascending: ascendente })
    .limit(LIMITE);

  const clientes = (data ?? []) as unknown as Linha[];

  /*
   * Falha de leitura aqui não pode derrubar a página inteira: a lista de
   * clientes é o conteúdo principal, e não poder mostrar o aviso de falha é
   * menos grave do que não mostrar nada.
   */
  let falhas: FalhaResumo[] = [];
  /*
   * Um `catch` que deixasse a lista vazia faria o indicador dizer "0 execuções
   * paradas" — que é o oposto de "não consegui olhar". O sinalizador existe
   * para o KPI poder ficar sem número em vez de afirmar zero.
   */
  let falhasLidas = true;
  try {
    falhas = await falhasAbertas();
  } catch {
    falhas = [];
    falhasLidas = false;
  }

  let complementos = new Map<string, Complemento>();
  let complementoFalhou = false;
  try {
    complementos = await nichoEModulos();
  } catch {
    complementoFalhou = true;
  }

  const total = count ?? null;
  /*
   * Sem `count`, o único sinal de que sobrou gente fora é a consulta ter
   * enchido o teto — e aí a tela diz que não sabe o total, em vez de chutar.
   */
  const truncada = total === null ? clientes.length >= LIMITE : total > clientes.length;
  /*
   * A frase é deliberadamente sobre "os carregados", e não sobre "os mais
   * recentes": trocar a ordenação troca QUAIS cem vêm, e a soma passa a ser
   * sobre um recorte diferente. Dizer só "parcial" seria vago; dizer "os 100
   * mais recentes" seria falso depois de ordenar por nome.
   */
  const parcial = truncada
    ? `somado sobre os ${clientes.length} carregados${total === null ? ', de um total que não consegui contar' : ` de ${total}`}`
    : undefined;

  const { ultimos30, anteriores30 } = janelasDeCriacao(clientes);
  /*
   * `null` é o resultado honesto em dois casos: sem janela anterior não há
   * divisão possível, e sobre um recorte truncado a conta compararia duas
   * amostras diferentes. Zero por cento afirmaria estabilidade que ninguém
   * apurou (CLAUDE.md).
   */
  const variacaoDe30 =
    truncada || anteriores30 === 0 ? null : ((ultimos30 - anteriores30) / anteriores30) * 100;

  const quantos = (situacao: TenantStatus) => clientes.filter((c) => c.status === situacao).length;

  const ordemDa = (coluna: ChaveDeOrdem): OrdemDaColuna => ({
    chave: coluna,
    atual: ordemAtual,
    href: hrefDeOrdem({}, coluna, ordemAtual),
  });

  const naPrimeiraVisita = ordemBruta === undefined;

  return (
    <Page variant="painel" className="flex flex-col gap-6">
      <PageHeader
        titulo="Clientes"
        descricao={
          total === null
            ? `Todas as empresas da plataforma. Mostrando ${clientes.length}${truncada ? ' — a consulta para aqui e não consegui contar o resto' : ''}.`
            : truncada
              ? `Todas as empresas da plataforma. Mostrando as ${clientes.length} primeiras de ${total}.`
              : `Todas as empresas da plataforma. ${total} no total.`
        }
        acoes={
          <Link href="/admin/clientes/novo" className={cn(buttonVariants())}>
            <Plus aria-hidden />
            Novo cliente
          </Link>
        }
        className="mb-0"
      />

      {/*
       * A faixa é o único evento de entrada da tela (seção 8, regra 1): as
       * linhas da tabela não animam, e a contagem só roda aqui. Na volta com
       * `?ordem=` a coreografia não se repete — reordenar não é chegar.
       */}
      <StatGrid colunas={5}>
        <Stat
          rotulo="Clientes ativos"
          valor={quantos('active')}
          Icone={CircleCheck}
          tom="success"
          parcial={parcial}
          contar
          animar={naPrimeiraVisita}
          atraso={atrasoDaLinha(0)}
        />
        <Stat
          rotulo="Em provisionamento"
          valor={quantos('provisioning')}
          Icone={Loader}
          tom="warning"
          nota="existem e não operam"
          parcial={parcial}
          contar
          animar={naPrimeiraVisita}
          atraso={atrasoDaLinha(1)}
        />
        <Stat
          rotulo="Suspensos"
          valor={quantos('suspended')}
          Icone={CirclePause}
          tom="danger"
          parcial={parcial}
          contar
          animar={naPrimeiraVisita}
          atraso={atrasoDaLinha(2)}
        />
        <Stat
          rotulo="Execuções paradas"
          valor={falhasLidas ? falhas.length : null}
          semValor="não consegui ler"
          Icone={TriangleAlert}
          tom="danger"
          nota={
            !falhasLidas
              ? 'pode haver provisionamento parado'
              : falhas.length === 0
                ? 'nada para retomar'
                : 'pedem retomar ou desfazer'
          }
          parcial={
            falhasLidas && falhas.length >= LIMITE_DE_FALHAS
              ? `as ${LIMITE_DE_FALHAS} mais recentes`
              : undefined
          }
          contar
          animar={naPrimeiraVisita}
          atraso={atrasoDaLinha(3)}
        />
        <Stat
          rotulo="Criados em 30 dias"
          valor={ultimos30}
          Icone={UserPlus}
          variacao={{ valor: variacaoDe30, rotulo: 'vs. 30 dias anteriores' }}
          parcial={parcial}
          contar
          animar={naPrimeiraVisita}
          atraso={atrasoDaLinha(4)}
        />
      </StatGrid>

      <FailedRuns falhas={falhas} />

      {error !== null ? (
        /*
         * Leitura falhou: não se sabe se existe cliente. Dizer "nenhum cliente
         * ainda" aqui seria afirmar um vazio que ninguém verificou.
         */
        <EmptyState estado="erro" titulo="Não consegui ler a lista de clientes">
          {error.message} Recarregar costuma resolver; se insistir, a política de acesso do banco é
          o primeiro lugar a olhar.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          <Table densidade="densa" rotulo="Clientes da plataforma">
            <THead sticky>
              <tr>
                <TH ordem={ordemDa('nome')}>Cliente</TH>
                <TH ordem={ordemDa('endereco')}>Endereço</TH>
                <TH className="hidden max-md:block lg:table-cell">Nicho</TH>
                <TH>Plano</TH>
                <TH className="hidden max-md:block xl:table-cell">Módulos ligados</TH>
                <TH ordem={ordemDa('situacao')}>Situação</TH>
                <TH ordem={ordemDa('criado')} alinhamento="fim">
                  Criado em
                </TH>
              </tr>
            </THead>
            <TBody>
              {clientes.length === 0 ? (
                <TableEmpty
                  colunas={7}
                  icone={Building2}
                  titulo="Nenhum cliente ainda"
                  acao={
                    <Link
                      href="/admin/clientes/novo"
                      className={cn(buttonVariants({ variant: 'outline' }))}
                    >
                      <Plus aria-hidden />
                      Criar o primeiro cliente
                    </Link>
                  }
                >
                  A plataforma existe e não atende ninguém. Criar o primeiro executa o
                  provisionamento de verdade: empresa, módulos, papéis, administrador e auditoria.
                </TableEmpty>
              ) : (
                clientes.map((cliente) => {
                  const rotulo = SITUACAO[cliente.status];
                  const plano = embeddedCode(cliente.plans);
                  const extra = complementos.get(cliente.id);
                  const nicho =
                    extra?.nicho === null || extra?.nicho === undefined
                      ? null
                      : (blueprintByCode(extra.nicho)?.name ?? extra.nicho);

                  return (
                    <TR
                      key={cliente.id}
                      href={`/admin/clientes/${cliente.id}`}
                      rotulo={`Abrir ${cliente.name}`}
                    >
                      <TD truncar>
                        <span className="font-medium text-content">{cliente.name}</span>
                      </TD>

                      {/*
                       * O slug sozinho, que é o identificador real. O
                       * subdomínio que ele vai virar não é navegável hoje, e
                       * repeti-lo em cem linhas seria repetir cem vezes um
                       * endereço que não abre — o aviso abaixo da tabela diz
                       * isso uma vez.
                       */}
                      <TD rotulo="Endereço" truncar>
                        <span className="font-mono text-caption text-content-muted">
                          {cliente.slug}
                        </span>
                      </TD>

                      <TD rotulo="Nicho" truncar className="hidden max-md:flex lg:table-cell">
                        {/*
                         * Três coisas diferentes, três textos: o nicho, "não
                         * registrado" (empresa criada por fora do
                         * provisionamento) e "não consegui ler". Um travessão
                         * para os três diria que a empresa não tem nicho.
                         */}
                        {nicho ?? (
                          <span className="text-content-subtle">
                            {complementoFalhou ? 'não consegui ler' : 'não registrado'}
                          </span>
                        )}
                      </TD>

                      <TD rotulo="Plano">
                        {plano === null ? (
                          <span className="text-content-subtle">—</span>
                        ) : (
                          <Badge>{plano}</Badge>
                        )}
                      </TD>

                      <TD
                        rotulo="Módulos ligados"
                        truncar
                        className="hidden max-md:flex xl:table-cell"
                      >
                        <span className="text-caption text-content-muted">
                          {extra?.modulos ?? (complementoFalhou ? 'não consegui ler' : 'nenhum')}
                        </span>
                      </TD>

                      <TD rotulo="Situação">
                        <span className="flex flex-col items-start gap-0.5">
                          <Badge tone={rotulo?.tom ?? 'neutral'}>
                            {rotulo?.rotulo ?? cliente.status}
                          </Badge>
                          {!isOperational(cliente.status) && (
                            <span className="block max-w-52 truncate text-caption text-content-subtle">
                              {cliente.status === 'suspended' && cliente.status_reason !== null
                                ? cliente.status_reason
                                : 'não opera — quem entrar cai em /preparando'}
                            </span>
                          )}
                        </span>
                      </TD>

                      <TD rotulo="Criado em" numerico>
                        {dataDaPlataforma(cliente.created_at)}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>

          <AvisoDeEndereco />
          {complementoFalhou && (
            <p className="text-caption text-content-subtle">
              Nicho e módulos não puderam ser lidos agora — as duas colunas estão em branco, e o
              resto da linha veio do banco normalmente.
            </p>
          )}
          {truncada && (
            <p className="text-caption text-content-subtle">
              A consulta para em {LIMITE} clientes. Ordenar por outra coluna muda quais {LIMITE}{' '}
              aparecem; ainda não há busca nem paginação para alcançar o resto.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
