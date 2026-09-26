import { can, formatDocument, normalizeDocument } from '@tivexy/core';
import { Building2, ListX, RotateCw } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Page } from '@/components/page/page';
import { Pagination } from '@/components/page/pagination';
import { SearchBox } from '@/components/page/search-box';
import { buttonVariants } from '@/components/ui/button';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { nomeDe, tenantMembers } from '@/lib/members';
import { ilikeTerm, paginaPedida } from '@/lib/search';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { NewCompanyDialog } from './company-form';
import { CompanyRows, type ContaListada } from './company-rows';
import { ORDENS_DE_CONTA, POR_PAGINA, ordemDeConta } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/empresas') };
}

/** Os quatro desfechos possíveis da leitura. Nomeados porque decidem a tela inteira. */
type Situacao = 'erro' | 'pagina-vazia' | 'sem-cadastro' | 'lista';

/**
 * As contas — as empresas com quem esta empresa negocia.
 *
 * Mesma busca das pessoas: no banco, em nome, razão social, e-mail, telefone,
 * site e documento sem pontuação. Um CNPJ com letra se acha do mesmo jeito.
 *
 * Ordenação, busca e página vivem no endereço: a lista que alguém está olhando
 * cabe num link. Nada aqui depende de JavaScript.
 */
export default async function EmpresasPage({ searchParams }: PageProps<'/crm/empresas'>) {
  const { choice, viewer } = await requireAccess('/crm/empresas');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/crm/empresas');
  const rotulo = termOf(terms, 'crm.companies');
  const podeEditar = can(viewer, 'crm.companies.write');

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const termo = ilikeTerm(q);
  const termoDoc = ilikeTerm(normalizeDocument(q));
  const ordem = ordemDeConta(params.ordem);
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('crm_companies')
    .select('id, name, legal_name, document, email, phone, owner_id', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (termo !== null) {
    const condicoes = [
      `name.ilike.${termo}`,
      `legal_name.ilike.${termo}`,
      `email.ilike.${termo}`,
      `phone.ilike.${termo}`,
      `website.ilike.${termo}`,
    ];
    if (termoDoc !== null) condicoes.push(`document.ilike.${termoDoc}`);
    consulta = consulta.or(condicoes.join(','));
  }

  const [lista, membros] = await Promise.all([
    consulta
      /*
       * `nullsFirst: false` nos dois sentidos: no Postgres o padrão joga os
       * nulos para o fim no crescente e para o começo no decrescente. Ordenar
       * por documento decrescente abriria a tela com uma página inteira de
       * travessões, que não é o que se pede quando se clica numa coluna.
       */
      .order(ORDENS_DE_CONTA[ordem.chave], { ascending: ordem.ascendente, nullsFirst: false })
      /* Desempate estável: sem ele, duas contas de mesmo nome trocam de página entre recargas. */
      .order('id')
      .range(de, de + POR_PAGINA - 1),
    tenantMembers(tenantId),
  ]);

  const contas: ContaListada[] = (lista.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    razaoSocial: typeof linha.legal_name === 'string' ? linha.legal_name : null,
    documento: typeof linha.document === 'string' ? formatDocument(linha.document) : null,
    email: typeof linha.email === 'string' ? linha.email : null,
    telefone: typeof linha.phone === 'string' ? linha.phone : null,
    responsavel: nomeDe(membros, linha.owner_id),
  }));

  /*
   * `count: 'exact'` conta a consulta inteira, não a página — então "312" é o
   * total de verdade. Quando a contagem não vem (leitura falhou), o total é
   * `null` e a tela diz isso: `contas.length` no lugar dele seria apresentar o
   * tamanho da página como se fosse o cadastro.
   */
  const total = lista.error === null ? lista.count : null;

  const situacao: Situacao =
    lista.error !== null
      ? 'erro'
      : contas.length > 0
        ? 'lista'
        : pagina > 1
          ? 'pagina-vazia'
          : termo === null
            ? 'sem-cadastro'
            : /* Busca sem resultado fica na tabela, com o cabeçalho de pé. */ 'lista';

  const opcoes = membros.map((m) => ({ id: m.userId, nome: m.nome }));
  /*
   * Uma ação `brand` por tela (seção 7, P15). Quando o cadastro está vazio a
   * tela inteira é um convite a criar o primeiro, e o botão mora lá — repeti-lo
   * no topo daria dois primários para a mesma ação.
   */
  const acaoNoTopo = podeEditar && situacao !== 'sem-cadastro';

  const enderecoAtual = comParametros({ q, ordem: ordem.bruta, pagina });

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={titulo}
        descricao={descricao({ total, q, termo, singular: rotulo.singular, plural: rotulo.plural })}
        acoes={
          acaoNoTopo ? (
            <NewCompanyDialog singular={rotulo.singular} membros={opcoes} />
          ) : undefined /* `undefined`, não `null`: o PageHeader só omite a área de ações com ele. */
        }
      />

      <div className="flex flex-col gap-4">
        <SearchBox
          valor={q}
          rotulo={`Buscar ${rotulo.plural}`}
          placeholder="Nome, site ou CNPJ"
          /* A ordem escolhida sobrevive à busca: o GET reescreve a query inteira. */
          ocultos={ordem.bruta === null ? undefined : { ordem: ordem.bruta }}
        />

        {situacao === 'erro' && (
          <EmptyState
            estado="erro"
            titulo="Não consegui ler a lista"
            acao={
              /*
               * `<a>`, e não `<Link>`: navegar para o endereço em que já se
               * está é descartado pelo roteador do cliente, e o botão que
               * promete tentar de novo não tentaria nada. A recarga completa
               * refaz a consulta.
               */
              <a href={enderecoAtual} className={buttonVariants({ variant: 'outline' })}>
                <RotateCw aria-hidden />
                Tentar de novo
              </a>
            }
          >
            A leitura no banco falhou agora. Nada se perdeu — o cadastro continua lá, é esta tela
            que não conseguiu buscá-lo. Se insistir e continuar falhando, avise quem cuida do
            sistema.
          </EmptyState>
        )}

        {situacao === 'pagina-vazia' && (
          <EmptyState
            estado="busca"
            icone={ListX}
            titulo="Esta página não tem nada"
            acao={
              <Link
                href={comParametros({ q, ordem: ordem.bruta, pagina: 1 })}
                className={buttonVariants({ variant: 'outline' })}
              >
                Ir para a primeira página
              </Link>
            }
          >
            A lista encolheu desde que este endereço foi aberto — alguém apagou cadastros, ou o
            filtro mudou. O que existe está nas páginas anteriores.
          </EmptyState>
        )}

        {situacao === 'sem-cadastro' && (
          <EmptyState
            icone={Building2}
            titulo={`Ainda não há ${rotulo.plural}`}
            acao={
              podeEditar ? (
                <NewCompanyDialog singular={rotulo.singular} membros={opcoes} />
              ) : undefined
            }
          >
            {podeEditar
              ? `É aqui que ficam as empresas com quem se negocia: cada ${rotulo.singular} reúne as pessoas de lá, os ${termOf(terms, 'crm.deals').plural} e o histórico. Converter ${termOf(terms, 'crm.leads').plural} que trouxeram nome de empresa também cria o cadastro.`
              : `É aqui que ficam as empresas com quem se negocia, com as pessoas de lá e os ${termOf(terms, 'crm.deals').plural} de cada uma. Seu acesso é de leitura: assim que alguém da equipe cadastrar, aparece nesta lista.`}
          </EmptyState>
        )}

        {situacao === 'lista' && (
          <CompanyRows
            contas={contas}
            ordem={ordem.bruta}
            params={{ q }}
            busca={q}
            /*
             * Entrada só na chegada limpa à rota (seção 8, regra 3). Com busca,
             * ordem ou página no endereço a pessoa está navegando dentro da
             * lista, e repetir a coreografia transforma cada clique em espera.
             */
            animar={q === '' && ordem.bruta === null && pagina === 1}
            rotuloPlural={rotulo.plural}
          />
        )}

        {total !== null && situacao !== 'sem-cadastro' && (
          <Pagination
            pagina={pagina}
            porPagina={POR_PAGINA}
            total={total}
            params={{ q, ordem: ordem.bruta }}
          />
        )}
      </div>
    </Page>
  );
}

/** O endereço desta tela com os parâmetros que valem a pena carregar adiante. */
function comParametros({
  q,
  ordem,
  pagina,
}: {
  q: string;
  ordem: string | null;
  pagina: number;
}): string {
  const query = new URLSearchParams();
  if (q !== '') query.set('q', q);
  if (ordem !== null) query.set('ordem', ordem);
  if (pagina > 1) query.set('pagina', String(pagina));
  const texto = query.toString();
  return texto === '' ? '/crm/empresas' : `/crm/empresas?${texto}`;
}

/**
 * A linha de contexto do cabeçalho.
 *
 * `total === null` é leitura que falhou: dizer "0 empresas no cadastro" ali
 * seria afirmar um vazio que ninguém apurou.
 */
function descricao({
  total,
  q,
  termo,
  singular,
  plural,
}: {
  total: number | null;
  q: string;
  termo: string | null;
  singular: string;
  plural: string;
}): string {
  if (total === null) return 'Não consegui contar o cadastro agora.';
  if (termo === null) return `${contagem(total, singular, plural)} no cadastro.`;
  return `${contagem(total, 'resultado', 'resultados')} para “${q}”.`;
}
