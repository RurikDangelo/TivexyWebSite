'use server';

/**
 * As escritas da tela de empresas.
 *
 * Mesmas duas regras da tela de leads, e pelos mesmos motivos:
 *
 * 1. `requireAccess()` roda **aqui dentro**, de novo. Server Action é
 *    endpoint: quem descobrir o identificador dela pode chamá-la sem nunca ter
 *    aberto a página. Abaixo disso ainda há o RLS, que nega a escrita a quem
 *    não tem `crm.companies.write` mesmo que estas linhas sumam.
 * 2. **O tenant vem da sessão, nunca do formulário.** O RLS impede escrever no
 *    tenant de outra pessoa e **não** escolhe em qual dos tenants dela a linha
 *    cai — quem participa de duas empresas tem permissão nas duas. Aceitar
 *    `tenant_id` do formulário deixaria essa escolha com o navegador.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import {
  conferirDocumento,
  conferirEmail,
  conferirSite,
  conferirTelefone,
  mensagemDeErro,
  opcional,
  soDigitos,
  texto,
} from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { EMPRESA_INICIAL, type EmpresaFormState } from './state.ts';

/** De onde a tela lê e escreve. Uma constante: o caminho também é a regra. */
const ROTA = '/crm/empresas';

function conferir(form: FormData): EmpresaFormState['campos'] {
  const campos: Partial<Record<string, string>> = {};

  if (texto(form, 'name') === '') campos.name = 'Obrigatório.';

  const problemas = {
    document: conferirDocumento(texto(form, 'document')),
    email: conferirEmail(texto(form, 'email')),
    phone: conferirTelefone(texto(form, 'phone')),
    website: conferirSite(texto(form, 'website')),
  };

  for (const [campo, problema] of Object.entries(problemas)) {
    if (problema !== null) campos[campo] = problema;
  }

  return campos as EmpresaFormState['campos'];
}

export async function criarEmpresa(
  _anterior: EmpresaFormState,
  form: FormData,
): Promise<EmpresaFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...EMPRESA_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const campos = conferir(form);
  if (Object.keys(campos).length > 0) return { ...EMPRESA_INICIAL, campos };

  const nome = texto(form, 'name');

  /*
   * O documento entra só com dígitos. A coluna exige
   * (`crm_companies_document_digits`), e quem colou do site da Receita colou
   * pontuado — limpar aqui é o que separa "cadastrou" de um erro de constraint
   * falando de expressão regular.
   */
  const documento = texto(form, 'document');

  const supabase = await supabaseServer();

  const { error } = await supabase.from('crm_companies').insert({
    tenant_id: choice.tenant.id,
    name: nome,
    legal_name: opcional(form, 'legal_name'),
    document: documento === '' ? null : soDigitos(documento),
    email: opcional(form, 'email'),
    phone: opcional(form, 'phone'),
    website: opcional(form, 'website'),
    notes: opcional(form, 'notes'),
  });

  if (error !== null) {
    return {
      ...EMPRESA_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para cadastrar empresas aqui.'),
    };
  }

  revalidatePath(ROTA);
  /* A tela de contatos oferece esta empresa numa lista; ela precisa recarregar. */
  revalidatePath('/crm/contatos');
  return { ...EMPRESA_INICIAL, criado: nome };
}
