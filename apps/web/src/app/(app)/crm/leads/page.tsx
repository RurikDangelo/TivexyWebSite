import { can, type CrmLeadStatus } from '@tivexy/core';
import { SearchX, Target } from 'lucide-react';
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
import { Label, Select } from '@/components/ui/input';
import { hrefDeOrdem, TBody, Table, TableEmpty, TH, THead, TR } from '@/components/ui/table';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem, formatInstant } from '@/lib/format';
import { ilikeTerm, paginaPedida } from '@/lib/search';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { LeadForm } from './lead-form';
import { LeadRow, type LeadListado } from './lead-row';
import { ReloadButton } from './reload-button';
import {
  type ChaveDeOrdem,
  type EtapaOferecida,
  ORDEM_PADRAO,
  ordemPedida,
  POR_PAGINA,
  SITUACAO_LABEL,
  situacaoPedida,
  STATUS_ABERTOS,
  STATUS_FECHADOS,
  type SituacaoDeLead,
} from './state';

/** O título da aba também fala a língua do nicho — é a mesma função do menu. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/leads') };
}

/** Quantas colunas o `<thead>` tem. O vazio e a linha de erro atravessam todas. */
const COLUNAS = 8;

/**
 * A fila de leads.
 *
 * Primeira tela de módulo de negócio do Tivexy — e a primeira em que o
 * vocabulário do Blueprint aparece: uma clínica lê aqui o que ela chama de
 * lead, sem que exista uma segunda tela.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas, e a
 * consulta sem filtro devolveria as duas listas misturadas. O RLS é o piso,
 * não o filtro.
 *
 * ## Por que a contagem mudou de lugar
 *
 * O cabeçalho dizia "{abertos.length} em aberto" a partir de um array cortado
 * em 200 linhas: com 250 leads a tela afirmava 200, um número que era artefato
 * do limite e não do banco — e os leads além do 200º não tinham como ser
 * alcançados. Agora o total vem de `count: 'exact'` e a lista tem busca,
 * filtro, ordenação e paginação (achado `page.tsx:81`).
 */
export default async function LeadsPage({ searchParams }: PageProps<'/crm/leads'>) {
  const { choice, viewer } = await requireAccess('/crm/leads');
  /* Antes isto devolvia `null` — página em branco, que parece defeito. */
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/crm/leads');
  const rotulo = termOf(terms, 'crm.leads');

  /*
   * Sem `crm.leads.write` não se desenha o que a pessoa não pode fazer. A tela
   * mostrava "Cadastrar", "Qualificar", "Descartar" e "Converter" para quem só
   * tinha leitura, e o clique não fazia nada (achado `page.tsx:112`).
   */
  const podeEditar = can(viewer, 'crm.leads.write');
  /* Quem não lê o funil não vê etapa nenhuma pelo RLS; avisar de funil vazio
     seria dar o diagnóstico errado para um problema de permissão. */
  const podeVerFunil = can(viewer, 'crm.deals.read');

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const termo = ilikeTerm(q);
  const situacao = situacaoPedida(params.situacao);
  const ordem = ordemPedida(params.ordem);
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await supabaseServer();

  let consulta = supabase
    .from('crm_leads')
    .select('id, name, email, phone, company_name, source, status, created_at', {
      count: 'exact',
    })
    .eq('tenant_id', tenantId);

  if (situacao !== 'todos') {
    consulta = consulta.in('status', [
      ...(situacao === 'abertos' ? STATUS_ABERTOS : STATUS_FECHADOS),
    ]);
  }

  /*
   * A busca vai ao banco, não filtra a página: com mil leads, filtrar os
   * cinquenta da tela acharia a Maria só se ela estivesse entre os cinquenta.
   * Inclui `source` porque "quem veio da feira" é a pergunta que a lista de
   * leads recebe — e é isso que dispensa, por ora, um filtro próprio de origem,
   * que é texto livre e não tem lista fechada de onde sair.
   */
  if (termo !== null) {
    consulta = consulta.or(
      [
        `name.ilike.${termo}`,
        `email.ilike.${termo}`,
        `phone.ilike.${termo}`,
        `company_name.ilike.${termo}`,
        `source.ilike.${termo}`,
      ].join(','),
    );
  }

  const [lista, etapasR, fuso] = await Promise.all([
    consulta
      /* `nullsFirst: false` para que empresa e origem em branco fiquem no fim:
         numa coluna ordenada, vinte traços no topo escondem o dado. */
      .order(ordem.coluna, { ascending: ordem.ascendente, nullsFirst: false })
      /* Desempate estável: sem ele, duas páginas podem repetir ou pular linha. */
      .order('id')
      .range(de, de + POR_PAGINA - 1),
    /*
     * As etapas onde uma oportunidade pode nascer.
     *
     * Só as `open`: converter direto para "Ganho" existe em teoria e na prática
     * é engano de clique, e o negócio nasceria fechado sem nunca ter sido
     * trabalhado — sujando o tempo médio de ciclo de todo mundo.
     *
     * Quem não tem `crm.deals.read` recebe lista vazia pelo RLS, e o botão de
     * converter some sozinho. É a política decidindo a interface, sem um
     * segundo `if` aqui para esquecer de atualizar.
     */
    supabase
      .from('crm_pipeline_stages')
      .select('id, name, position, crm_pipelines!inner(name, position)')
      .eq('tenant_id', tenantId)
      .eq('kind', 'open')
      .order('position'),
    tenantTimeZone(),
  ]);

  const etapas: EtapaOferecida[] = (etapasR.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    funil: String(
      (linha.crm_pipelines as { name?: unknown } | null)?.name ??
        (Array.isArray(linha.crm_pipelines) ? linha.crm_pipelines[0]?.name : '') ??
        '',
    ),
  }));

  const leads: LeadListado[] = (lista.data ?? []).map((linha) => ({
    id: String(linha.id),
    name: String(linha.name),
    email: (linha.email as string | null) ?? null,
    phone: (linha.phone as string | null) ?? null,
    companyName: (linha.company_name as string | null) ?? null,
    source: (linha.source as string | null) ?? null,
    status: linha.status as CrmLeadStatus,
    criadoEm: formatInstant(String(linha.created_at), fuso),
    criadoEmISO: String(linha.created_at),
  }));

  /* O total é do banco. Sem `count` (só acontece com erro) não se inventa um. */
  const total = lista.count ?? 0;

  /* O que precisa sobreviver à troca de página e à troca de ordem. */
  const filtros: Readonly<Record<string, string | null>> = {
    q: q === '' ? null : q,
    situacao: situacao === 'todos' ? null : situacao,
  };

  /*
   * Entrada escalonada só na primeira pintura da rota (seção 8, regra 3):
   * filtrar, ordenar ou paginar não reexecuta a coreografia. Sem parâmetro na
   * URL é a primeira vez que se olha para esta lista.
   */
  const primeiraPintura =
    q === '' && situacao === 'todos' && pagina === 1 && params.ordem === undefined;

  const semFunil = podeEditar && podeVerFunil && etapas.length === 0 && leads.length > 0;

  /* A ordem padrão não vai para o endereço: link limpo é link que se lê. */
  const ordemNaUrl = ordem.bruta === ORDEM_PADRAO ? null : ordem.bruta;

  /** O estado de ordenação de uma coluna, montado num lugar só. */
  const coluna = (chave: ChaveDeOrdem) => ({
    chave,
    atual: ordem.bruta,
    href: hrefDeOrdem(filtros, chave, ordem.bruta),
  });

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={titulo}
        descricao={descricaoDaLista({ q, termo, situacao, total, rotulo })}
        acoes={podeEditar ? <LeadForm singular={rotulo.singular} /> : undefined}
      />

      <FilterBar
        className="mb-4"
        busca={{
          rotulo: `Buscar ${rotulo.plural}`,
          placeholder: 'Nome, e-mail, telefone ou origem',
          valor: q,
        }}
        filtros={
          /*
           * Rótulo oculto, não ausente: um `<select>` sem nome acessível é
           * anunciado só como "caixa de combinação". `Field` resolveria isto,
           * mas o módulo dele exporta um hook, e importá-lo aqui puxaria esta
           * página para o cliente — este é um filtro, não um campo com erro.
           */
          <div className="flex min-w-0 flex-col md:w-44">
            <Label htmlFor="situacao" className="sr-only">
              Situação
            </Label>
            <Select id="situacao" name="situacao" defaultValue={situacao}>
              {(Object.keys(SITUACAO_LABEL) as SituacaoDeLead[]).map((chave) => (
                <option key={chave} value={chave}>
                  {SITUACAO_LABEL[chave]}
                </option>
              ))}
            </Select>
          </div>
        }
        /* O GET reescreve a query inteira: sem isto, filtrar perderia a ordem. */
        ocultos={ordemNaUrl === null ? undefined : { ordem: ordemNaUrl }}
      />

      {semFunil && (
        <FormWarning className="mb-4">
          Converter está indisponível: nenhum funil tem etapa em aberto.{' '}
          <Link href="/crm/oportunidades/funis" className="font-medium underline">
            Crie uma etapa
          </Link>{' '}
          para que o lead vire conta, pessoa e oportunidade.
        </FormWarning>
      )}

      {lista.error !== null ? (
        /*
         * Com erro a lista não é desenhada. Antes ela aparecia vazia embaixo do
         * aviso — uma caixa sem nada, que lê como "não há leads" quando a
         * verdade é que não se sabe quantos há.
         */
        <EmptyState estado="erro" titulo="Não consegui ler a lista" acao={<ReloadButton />}>
          A consulta falhou agora. Enquanto ela não voltar não dá para saber quantos {rotulo.plural}{' '}
          existem — nenhum número desta tela seria verdadeiro.
        </EmptyState>
      ) : (
        <>
          <Table densidade="larga" rotulo={`Lista de ${rotulo.plural}`}>
            <THead sticky>
              <TR>
                <TH ordem={coluna('nome')}>Nome</TH>
                <TH ordem={coluna('estado')}>Estado</TH>
                {/*
                 * Colunas extras entram por breakpoint (seção 3). Abaixo de
                 * `md` o modo blocos do `<Table>` vence este `hidden` e as traz
                 * de volta como linhas rotuladas — que é o certo: no celular há
                 * altura de sobra e é o e-mail que faz alguém ligar de volta.
                 */}
                <TH className="hidden xl:table-cell" ordem={coluna('empresa')}>
                  Empresa
                </TH>
                <TH className="hidden lg:table-cell">E-mail</TH>
                <TH className="hidden xl:table-cell">Telefone</TH>
                <TH className="hidden xl:table-cell" ordem={coluna('origem')}>
                  Origem
                </TH>
                <TH ordem={coluna('entrou')}>Entrou</TH>
                <TH alinhamento="fim">
                  <span className="sr-only">Ações</span>
                </TH>
              </TR>
            </THead>

            <TBody>
              {leads.length === 0 ? (
                <VazioDaLista
                  q={q}
                  temFiltro={termo !== null || situacao !== 'todos'}
                  podeEditar={podeEditar}
                  plural={rotulo.plural}
                  singular={rotulo.singular}
                />
              ) : (
                leads.map((lead, i) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    etapas={etapas}
                    podeEditar={podeEditar}
                    colunas={COLUNAS}
                    indice={i}
                    escalonar={primeiraPintura}
                  />
                ))
              )}
            </TBody>
          </Table>

          <Pagination
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={total}
            params={{ ...filtros, ordem: ordemNaUrl }}
          />
        </>
      )}
    </Page>
  );
}

/**
 * A linha de contexto do cabeçalho.
 *
 * Todo número aqui é `count: 'exact'` do banco. Nada é derivado do tamanho da
 * página — era exatamente esse o defeito que a tela tinha.
 */
function descricaoDaLista({
  q,
  termo,
  situacao,
  total,
  rotulo,
}: {
  q: string;
  termo: string | null;
  situacao: SituacaoDeLead;
  total: number;
  rotulo: { singular: string; plural: string };
}): string {
  const recorte = situacao === 'todos' ? '' : ` ${SITUACAO_LABEL[situacao].toLowerCase()}`;

  if (termo !== null) {
    return `${contagem(total, 'resultado', 'resultados')} para “${q}”${recorte}.`;
  }
  if (situacao !== 'todos') {
    return `${contagem(total, rotulo.singular, rotulo.plural)}${recorte}.`;
  }
  return `Contatos que ainda não viraram cliente. ${contagem(total, rotulo.singular, rotulo.plural)} no cadastro.`;
}

/**
 * Os dois vazios que não são erro, e que não são a mesma coisa.
 *
 * "Ainda não há nada" pede o primeiro cadastro; "a busca não achou" pede
 * afrouxar o filtro. Uma frase só para os dois manda a pessoa cadastrar de
 * novo alguém que já existe.
 */
function VazioDaLista({
  q,
  temFiltro,
  podeEditar,
  plural,
  singular,
}: {
  q: string;
  temFiltro: boolean;
  podeEditar: boolean;
  plural: string;
  singular: string;
}) {
  if (temFiltro) {
    return (
      <TableEmpty
        colunas={COLUNAS}
        icone={SearchX}
        titulo="Nada encontrado"
        acao={
          <Link href="/crm/leads" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Limpar busca e filtro
          </Link>
        }
      >
        {q === ''
          ? `Nenhum ${singular} nesta situação. Troque o filtro para ver os demais.`
          : `Nenhum ${singular} tem “${q}” no nome, e-mail, telefone, empresa ou origem.`}
      </TableEmpty>
    );
  }

  return (
    <TableEmpty colunas={COLUNAS} icone={Target} titulo={`Ainda não há ${plural}`}>
      {podeEditar
        ? `É aqui que entra quem ligou, mandou mensagem ou deixou o contato na feira — antes de virar cliente. Cadastre o primeiro pelo botão no topo: só o nome é obrigatório.`
        : `Quando alguém da equipe cadastrar o primeiro contato, ele aparece nesta lista.`}
    </TableEmpty>
  );
}
