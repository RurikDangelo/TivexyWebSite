import { can, formatDocument, normalizeDocument } from '@tivexy/core';
import { Contact, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Pagination } from '@/components/page/pagination';
import { SearchBox } from '@/components/page/search-box';
import { buttonVariants } from '@/components/ui/button';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { contagem } from '@/lib/format';
import { tenantMembers } from '@/lib/members';
import { ilikeTerm, paginaPedida } from '@/lib/search';
import { currentSettings } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { capitalizar, termOf } from '@/lib/terms/vocabulary';

import { NewContactForm } from './contact-form';
import { ContactRows, type PessoaListada } from './contact-rows';
import { POR_PAGINA } from './state';

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
 */
export default async function ContatosPage({ searchParams }: PageProps<'/crm/contatos'>) {
  const { choice, viewer } = await requireAccess('/crm/contatos');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const terms = await currentTerms();
  const titulo = sectionTitle(terms, '/crm/contatos');
  const rotulo = termOf(terms, 'crm.contacts');
  const podeEditar = can(viewer, 'crm.contacts.write');

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const termo = ilikeTerm(q);
  const termoDoc = ilikeTerm(normalizeDocument(q));
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('crm_contacts')
    .select('id, name, email, phone, title, document, company:crm_companies(name)', {
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
      .order('name')
      .order('id')
      .range(de, de + POR_PAGINA - 1),
    tenantMembers(tenantId),
    supabase
      .from('crm_companies')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .limit(500),
    currentSettings(),
  ]);

  const pessoas: PessoaListada[] = (lista.data ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
    email: typeof linha.email === 'string' ? linha.email : null,
    telefone: typeof linha.phone === 'string' ? linha.phone : null,
    cargo: typeof linha.title === 'string' ? linha.title : null,
    documento: typeof linha.document === 'string' ? formatDocument(linha.document) : null,
    conta: nomeEmbutido(linha.company),
  }));
  const total = lista.count ?? pessoas.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={titulo}
        descricao={
          termo === null
            ? `${contagem(total, rotulo.singular, rotulo.plural)} no cadastro.`
            : `${contagem(total, 'resultado', 'resultados')} para “${q}”.`
        }
      />

      <div className="mb-6 flex flex-col gap-4">
        <SearchBox valor={q} rotulo={`Buscar ${rotulo.plural}`} placeholder="Nome, e-mail ou CPF" />
        {podeEditar && (
          <NewContactForm
            singular={rotulo.singular}
            rotuloConta={capitalizar(termOf(terms, 'crm.companies').singular)}
            contas={(contasR.data ?? []).map((c) => ({ id: String(c.id), nome: String(c.name) }))}
            membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
            exigirDocumento={ajustes['crm.contact_requires_document'] === true}
          />
        )}
      </div>

      {lista.error !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler a lista agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      {pessoas.length === 0 && lista.error === null ? (
        termo === null ? (
          <EmptyState icone={Contact} titulo={`Ainda não há ${rotulo.plural}`}>
            {podeEditar
              ? `Cadastre com o botão acima, ou converta pela tela de ${termOf(terms, 'crm.leads').plural}: a conversão cria o cadastro com os dados que já havia.`
              : 'Quando alguém da equipe cadastrar, aparece aqui.'}
          </EmptyState>
        ) : (
          <EmptyState
            icone={SearchX}
            titulo="Nada encontrado"
            acao={
              <Link href="/crm/contatos" className={buttonVariants({ variant: 'outline' })}>
                Limpar a busca
              </Link>
            }
          >
            Nenhum cadastro tem “{q}” no nome, e-mail, telefone, cargo ou documento.
          </EmptyState>
        )
      ) : (
        <ContactRows pessoas={pessoas} />
      )}

      <Pagination pagina={pagina} porPagina={POR_PAGINA} total={total} params={{ q }} />
    </div>
  );
}
