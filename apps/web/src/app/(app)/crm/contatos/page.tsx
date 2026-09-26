import { can, formatDocument, normalizeDocument } from '@tivexy/core';
import { Contact } from 'lucide-react';
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
import { currentSettings } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { NewContactForm } from './contact-form';
import { ContactRows, type PessoaListada } from './contact-rows';
import { BotaoRecarregar } from './reload';
import { ORDENS, POR_PAGINA, TETO_DE_CONTAS, ordemPedida } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/contatos') };
}

function nomeEmbutido(valor: unknown): string | null {
  const linha = Array.isArray(valor) ? valor[0] : valor;
  const nome = (linha as { name?: unknown } | null | undefined)?.name;
  return typeof nome === 'string' ? nome : null;
}

/**
 * As pessoas com quem esta empresa fala.
 *
 * A busca vai ao banco, não filtra a página: com mil pessoas, filtrar as
 * cinquenta da tela acharia a Maria só se ela estivesse entre as cinquenta.
 * Procura em nome, e-mail, telefone, cargo e documento — este último sem
 * pontuação, então "529.982" e "529982" acham a mesma pessoa.
 *
 * A ordem também é do banco, não da página: ordenar as cinquenta visíveis
 * mudaria a ordem dentro do recorte e deixaria a lista inteira como estava.
 */
export default async function ContatosPage({ searchParams }: PageProps<'/crm/contatos'>) {
  const { choice, viewer } = await requireAccess('/crm/contatos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/crm/contatos');
  const rotulo = termOf(terms, 'crm.contacts');
  const rotuloConta = capitalizar(termOf(terms, 'crm.companies').singular);
  const podeEditar = can(viewer, 'crm.contacts.write');

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const termo = ilikeTerm(q);
  const termoDoc = ilikeTerm(normalizeDocument(q));
  const pagina = paginaPedida(params.pagina);
  const ordem = ordemPedida(params.ordem);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('crm_contacts')
    /* `owner_id` entrou para a coluna Responsável da tabela; o nome sai de `tenantMembers`. */
    .select('id, name, email, phone, title, document, owner_id, company:crm_companies(name)', {
      count: 'exact',
    })
    .eq('tenant_id', tenantId);

  if (termo !== null) {
    const condicoes = [
      `name.ilike.${termo}`,
      `email.ilike.${termo}`,
      `phone.ilike.${termo}`,
      `title.ilike.${termo}`,
    ];
    if (termoDoc !== null) condicoes.push(`document.ilike.${termoDoc}`);
    consulta = consulta.or(condicoes.join(','));
  }

  const [lista, membros, contasR, ajustes] = await Promise.all([
    consulta
      /*
       * `nullsFirst: false` porque ordenar por cargo ou e-mail com a metade da
       * lista em branco no topo não é ordenar: quem clicou quer ver os
       * preenchidos. O desempate por `id` é o que mantém a paginação estável —
       * sem ele, dois cargos iguais podem trocar de página entre requisições.
       */
      .order(ORDENS[ordem.chave], { ascending: ordem.ascendente, nullsFirst: false })
      .order('id')
      .range(de, de + POR_PAGINA - 1),
    tenantMembers(tenantId),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(TETO_DE_CONTAS),
    currentSettings(),
  ]);

  const falhou = lista.error !== null;
  const pessoas: PessoaListada[] = (lista.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    email: typeof linha.email === 'string' ? linha.email : null,
    telefone: typeof linha.phone === 'string' ? linha.phone : null,
    cargo: typeof linha.title === 'string' ? linha.title : null,
    documento: typeof linha.document === 'string' ? formatDocument(linha.document) : null,
    conta: nomeEmbutido(linha.company),
    responsavel: nomeDe(membros, linha.owner_id),
  }));
  /*
   * `count` do banco, e `null` é um valor de verdade — não zero.
   *
   * O tamanho da página não é o tamanho do cadastro: chamar 50 de "total"
   * quando a leitura não contou é inventar número. Sem contagem a tela diz que
   * não contou, e a paginação (que precisa do total para saber se há próxima)
   * sai de cena em vez de adivinhar.
   */
  const total = lista.count;

  /*
   * A coreografia de entrada é da primeira leitura da tela. Com busca, ordem ou
   * página no endereço, quem chegou está continuando uma consulta — e re-animar
   * 50 linhas a cada clique transforma um filtro em espera (seção 8, regra 3).
   */
  const primeiraVisita = q === '' && params.ordem === undefined && pagina === 1;

  return (
    <Page variant="operacao">
      <PageHeader
        titulo={titulo}
        descricao={
          falhou
            ? 'Não consegui ler a lista agora.'
            : total === null
              ? `${contagem(pessoas.length, rotulo.singular, rotulo.plural)} nesta página; o total não veio nesta leitura.`
              : termo === null
                ? `${contagem(total, rotulo.singular, rotulo.plural)} no cadastro.`
                : `${contagem(total, 'resultado', 'resultados')} para “${q}”.`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          valor={q}
          rotulo={`Buscar ${rotulo.plural}`}
          placeholder="Nome, e-mail ou CPF"
          /* A ordem escolhida sobrevive à busca; a página, não — filtrar volta para a primeira. */
          ocultos={{ ordem: ordem.atual }}
          className="w-auto min-w-64 flex-1"
        />
        {podeEditar && (
          <NewContactForm
            singular={rotulo.singular}
            rotuloConta={rotuloConta}
            contas={(contasR.data ?? []).map((c) => ({ id: String(c.id), nome: String(c.name) }))}
            contasFalharam={contasR.error !== null}
            membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
            exigirDocumento={ajustes['crm.contact_requires_document'] === true}
          />
        )}
      </div>

      {/*
       * Três ausências, três respostas. Antes o erro mostrava a faixa vermelha E
       * a lista vazia logo abaixo — uma caixa com borda e nada dentro, que dizia
       * "não há ninguém" quando o que houve foi não conseguir olhar.
       */}
      {falhou ? (
        <EmptyState
          estado="erro"
          titulo={`Não consegui carregar ${rotulo.plural}`}
          acao={<BotaoRecarregar />}
        >
          A leitura do cadastro falhou. Não dá para dizer quantas pessoas existem — tente de novo em
          instantes; se repetir, avise quem cuida do sistema.
        </EmptyState>
      ) : pessoas.length === 0 && termo === null ? (
        <EmptyState estado="vazio" icone={Contact} titulo={`Ainda não há ${rotulo.plural}`}>
          {podeEditar
            ? `É aqui que fica quem sua empresa atende: cadastre com o botão acima, ou converta pela tela de ${termOf(terms, 'crm.leads').plural} — a conversão cria o cadastro com os dados que já havia.`
            : 'É aqui que fica quem sua empresa atende. Quando alguém da equipe cadastrar, aparece nesta lista.'}
        </EmptyState>
      ) : pessoas.length === 0 ? (
        <EmptyState
          estado="busca"
          titulo="Nada encontrado"
          acao={
            <Link href="/crm/contatos" className={buttonVariants({ variant: 'outline' })}>
              Limpar a busca
            </Link>
          }
        >
          {/* Sem uma segunda contagem não se sabe quantos registros existem fora do filtro — então a frase não afirma que existem. */}
          Nenhum cadastro tem “{q}” no nome, e-mail, telefone, cargo ou documento. Procure por parte
          do nome, ou limpe a busca para ver a lista inteira.
        </EmptyState>
      ) : (
        <ContactRows
          pessoas={pessoas}
          rotulo={titulo}
          rotuloConta={rotuloConta}
          ordem={ordem.atual}
          params={{ q }}
          animar={primeiraVisita}
        />
      )}

      {!falhou && total !== null && (
        <Pagination
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={total}
          params={{ q, ordem: ordem.atual }}
        />
      )}
    </Page>
  );
}
