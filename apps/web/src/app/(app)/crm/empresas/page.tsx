import { can, formatDocument, normalizeDocument } from '@tivexy/core';
import { Building2, SearchX } from 'lucide-react';
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
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import { NewCompanyForm } from './company-form';
import { CompanyRows, type ContaListada } from './company-rows';
import { POR_PAGINA } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/crm/empresas') };
}

/**
 * As contas — as empresas com quem esta empresa negocia.
 *
 * Mesma busca das pessoas: no banco, em nome, razão social, e-mail, telefone,
 * site e documento sem pontuação. Um CNPJ com letra se acha do mesmo jeito.
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
  const pagina = paginaPedida(params.pagina);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await supabaseServer();
  let consulta = supabase
    .from('crm_companies')
    .select('id, name, legal_name, document, email, phone', { count: 'exact' })
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
      .order('name')
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
  }));
  const total = lista.count ?? contas.length;

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
        <SearchBox valor={q} rotulo={`Buscar ${rotulo.plural}`} placeholder="Nome, site ou CNPJ" />
        {podeEditar && (
          <NewCompanyForm
            singular={rotulo.singular}
            membros={membros.map((m) => ({ id: m.userId, nome: m.nome }))}
          />
        )}
      </div>

      {lista.error !== null && (
        <div className="mb-4">
          <FormError>Não consegui ler a lista agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      {contas.length === 0 && lista.error === null ? (
        termo === null ? (
          <EmptyState icone={Building2} titulo={`Ainda não há ${rotulo.plural}`}>
            {podeEditar
              ? `Cadastre com o botão acima. Converter ${termOf(terms, 'crm.leads').plural} que trouxeram nome de empresa também cria o cadastro.`
              : 'Quando alguém da equipe cadastrar, aparece aqui.'}
          </EmptyState>
        ) : (
          <EmptyState
            icone={SearchX}
            titulo="Nada encontrado"
            acao={
              <Link href="/crm/empresas" className={buttonVariants({ variant: 'outline' })}>
                Limpar a busca
              </Link>
            }
          >
            Nenhum cadastro tem “{q}” no nome, razão social, e-mail, telefone, site ou documento.
          </EmptyState>
        )
      ) : (
        <CompanyRows contas={contas} />
      )}

      <Pagination pagina={pagina} porPagina={POR_PAGINA} total={total} params={{ q }} />
    </div>
  );
}
