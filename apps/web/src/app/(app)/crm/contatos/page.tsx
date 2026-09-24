import { Contact, Mail, Phone } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAccess } from '@/lib/auth/require';
import { nomeAninhado } from '@/lib/crm/postgrest';
import { capitalizar, currentTerms, term } from '@/lib/crm/terms';
import { supabaseServer } from '@/lib/supabase/server';

import { ContactForm } from './contact-form';
import type { ContatoListado, EmpresaOferecida } from './state';

export const metadata: Metadata = { title: 'Contatos' };

/** Os rótulos genéricos, quando o nicho não traduz. */
const PADRAO = { singular: 'contato', plural: 'contatos' };
const PADRAO_EMPRESA = { singular: 'empresa', plural: 'empresas' };

/**
 * As pessoas.
 *
 * Numa clínica isto se chama "paciente"; numa escola, "aluno". É a mesma
 * listagem, lendo `tenants.terms` — não uma segunda tela por nicho. Ver
 * `lib/crm/terms.ts`.
 *
 * ## O tenant no `where`, mesmo com RLS
 *
 * O RLS garante que nada de outra empresa volte. Ele **não** escolhe entre as
 * empresas desta pessoa: quem participa de duas tem permissão nas duas, e a
 * consulta sem filtro devolveria as duas listas misturadas. O RLS é o piso,
 * não o filtro.
 */
export default async function ContatosPage() {
  const { choice } = await requireAccess('/crm/contatos');
  const termos = await currentTerms();
  const rotulo = term(termos, 'crm.contacts', PADRAO);
  const rotuloEmpresa = term(termos, 'crm.companies', PADRAO_EMPRESA);

  if (choice.kind !== 'resolved') {
    /* `requireAccess` já mandaria para `/empresas`; isto é a rede embaixo. */
    return null;
  }

  const supabase = await supabaseServer();

  /*
   * As contas oferecidas na escolha.
   *
   * Quem não tem `crm.companies.read` recebe lista vazia pelo RLS, e a escolha
   * some sozinha do formulário — a política decidindo a interface, sem um
   * segundo `if` aqui para esquecer de atualizar. Mesmo padrão das etapas na
   * tela de leads.
   */
  const { data: empresasBrutas } = await supabase
    .from('crm_companies')
    .select('id, name')
    .eq('tenant_id', choice.tenant.id)
    .order('name')
    .limit(200);

  const empresas: EmpresaOferecida[] = (empresasBrutas ?? []).map((linha) => ({
    id: String(linha.id),
    nome: String(linha.name),
  }));

  const { data, error } = await supabase
    .from('crm_contacts')
    .select('id, name, title, email, phone, created_at, crm_companies(name)')
    .eq('tenant_id', choice.tenant.id)
    .order('name')
    .limit(200);

  const contatos: ContatoListado[] = (data ?? []).map((linha) => ({
    id: String(linha.id),
    name: String(linha.name),
    title: (linha.title as string | null) ?? null,
    email: (linha.email as string | null) ?? null,
    phone: (linha.phone as string | null) ?? null,
    empresa: nomeAninhado(linha.crm_companies),
    createdAt: String(linha.created_at),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-content sm:text-3xl">
          {capitalizar(rotulo.plural)}
        </h1>
        <p className="mt-1 text-content-muted">
          As pessoas com quem se fala. {contatos.length}{' '}
          {contatos.length === 1 ? 'cadastrado' : 'cadastrados'}.
        </p>
      </header>

      <div className="mb-6">
        <ContactForm
          singular={rotulo.singular}
          rotuloEmpresa={capitalizar(rotuloEmpresa.singular)}
          empresas={empresas}
        />
      </div>

      {error !== null && (
        <Card className="mb-4 border-danger/30">
          <CardHeader>
            <CardTitle className="text-sm text-danger">Não consegui ler a lista</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {contatos.length === 0 && error === null ? (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted">
              <Contact className="size-5 text-content-subtle" aria-hidden />
            </div>
            <CardTitle>Nenhum {rotulo.singular} ainda</CardTitle>
            <CardDescription>
              Cadastre o primeiro com o botão acima — ou converta um lead, que cria a pessoa junto
              com a {rotuloEmpresa.singular} e a oportunidade.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line-subtle bg-surface-raised">
          {contatos.map((contato) => (
            <Linha key={contato.id} contato={contato} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Linha({ contato }: { contato: ContatoListado }) {
  /* Cargo e conta dizem a mesma coisa em frases diferentes: "Compras na Padaria". */
  const posicao = [contato.title, contato.empresa].filter(Boolean).join(' · ');

  return (
    <li className="flex flex-col gap-1 border-b border-line-subtle p-4 last:border-b-0">
      <span className="font-medium text-content">{contato.name}</span>

      {posicao !== '' && <p className="text-sm text-content-muted">{posicao}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-content-muted">
        {contato.email !== null && <Contato icone={Mail} texto={contato.email} />}
        {contato.phone !== null && <Contato icone={Phone} texto={contato.phone} />}
        {contato.email === null && contato.phone === null && (
          <span className="text-content-subtle">Sem e-mail nem telefone</span>
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
