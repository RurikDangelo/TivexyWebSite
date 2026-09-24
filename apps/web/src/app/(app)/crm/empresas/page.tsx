import { Building2, Globe, Mail, Phone } from 'lucide-react';
import type { Metadata } from 'next';

import { BarraDeBusca, SemResultado } from '@/components/crm/search-bar';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { filtroOu, parametro } from '@/lib/crm/busca';
import { formatarDocumento } from '@/lib/crm/form';
import { capitalizar, currentTerms, term } from '@/lib/crm/terms';
import { supabaseServer } from '@/lib/supabase/server';

import { CompanyForm } from './company-form';
import type { EmpresaListada } from './state';

export const metadata: Metadata = { title: 'Empresas' };

/** O rótulo genérico, quando o nicho não traduz. */
const PADRAO = { singular: 'empresa', plural: 'empresas' };

/**
 * As contas — as empresas com quem se faz negócio.
 *
 * Elas já existiam antes desta tela: a conversão de lead cria uma conta, uma
 * pessoa e uma oportunidade numa transação só. Até aqui, duas das três não
 * tinham onde ser vistas — o dado estava certo no banco e invisível para quem
 * trabalha, que é uma forma silenciosa de o sistema mentir sobre o que faz.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas, e a
 * consulta sem filtro devolveria as duas listas misturadas. O RLS é o piso,
 * não o filtro.
 */
export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { choice } = await requireAccess('/crm/empresas');
  const termo = parametro(await searchParams, 'b');
  const rotulo = term(await currentTerms(), 'crm.companies', PADRAO);

  if (choice.kind !== 'resolved') {
    /* `requireAccess` já mandaria para `/empresas`; isto é a rede embaixo. */
    return null;
  }

  const supabase = await supabaseServer();

  /*
   * A busca vira filtro no banco, não `Array.filter` depois de ler.
   * Filtrar na aplicação só encontraria dentro das 200 que vieram — quem
   * procura o cliente cadastrado ano passado não acharia, e a tela diria
   * "nada encontrado" sobre um cadastro que existe.
   */
  const filtro = filtroOu(termo, ['name', 'legal_name', 'document', 'email', 'phone']);

  let consulta = supabase
    .from('crm_companies')
    .select('id, name, legal_name, document, email, phone, website, created_at')
    .eq('tenant_id', choice.tenant.id);

  if (filtro !== null) consulta = consulta.or(filtro);

  const { data, error } = await consulta.order('name').limit(200);

  const empresas: EmpresaListada[] = (data ?? []).map((linha) => ({
    id: String(linha.id),
    name: String(linha.name),
    legalName: (linha.legal_name as string | null) ?? null,
    document: (linha.document as string | null) ?? null,
    email: (linha.email as string | null) ?? null,
    phone: (linha.phone as string | null) ?? null,
    website: (linha.website as string | null) ?? null,
    createdAt: String(linha.created_at),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">
          {capitalizar(rotulo.plural)}
        </h1>
        <p className="mt-1 text-content-muted">
          Com quem se faz negócio. {empresas.length}{' '}
          {termo === '' ? (empresas.length === 1 ? 'cadastrada' : 'cadastradas') : 'encontradas'}.
        </p>
      </header>

      <div className="mb-6">
        <CompanyForm singular={rotulo.singular} />
      </div>

      <BarraDeBusca termo={termo} placeholder="Nome, CNPJ, e-mail ou telefone" />

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler a lista</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {empresas.length === 0 && error === null && termo !== '' ? (
        <SemResultado termo={termo} limpar="/crm/empresas" />
      ) : empresas.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <Building2 className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhuma {rotulo.singular} ainda</CardTitle>
            <CardDescription>
              Cadastre a primeira com o botão acima — ou converta um lead, que cria a{' '}
              {rotulo.singular} junto com a pessoa e a oportunidade.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {empresas.map((empresa) => (
            <Linha key={empresa.id} empresa={empresa} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Linha({ empresa }: { empresa: EmpresaListada }) {
  /*
   * A razão social só aparece quando difere do nome. Repetir a mesma frase
   * duas vezes numa linha não informa nada e empurra o resto para fora da
   * tela no celular.
   */
  const razaoSocial =
    empresa.legalName !== null && empresa.legalName !== empresa.name ? empresa.legalName : null;

  return (
    <li className="flex flex-col gap-1 border-b border-line-subtle p-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-content">{empresa.name}</span>
        {empresa.document !== null && (
          <span className="font-mono text-xs text-content-subtle">
            {formatarDocumento(empresa.document)}
          </span>
        )}
      </div>

      {razaoSocial !== null && <p className="text-sm text-content-muted">{razaoSocial}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-muted">
        {empresa.email !== null && <Contato icone={Mail} texto={empresa.email} />}
        {empresa.phone !== null && <Contato icone={Phone} texto={empresa.phone} />}
        {empresa.website !== null && <Contato icone={Globe} texto={empresa.website} />}
        {empresa.email === null && empresa.phone === null && empresa.website === null && (
          <span className="text-content-subtle">Sem contato cadastrado</span>
        )}
      </div>
    </li>
  );
}

function Contato({ icone: Icone, texto }: { icone: typeof Mail; texto: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icone className="size-3.5 shrink-0 text-content-subtle" aria-hidden />
      <span className="truncate">{texto}</span>
    </span>
  );
}
