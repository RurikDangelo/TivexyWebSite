'use server';

/**
 * As escritas da tela de contatos.
 *
 * Mesmas duas regras das outras telas do módulo: `requireAccess()` roda aqui
 * dentro porque Server Action é endpoint, e o tenant vem da sessão, nunca do
 * formulário. Ver `crm/leads/actions.ts` para o motivo de cada uma.
 *
 * ## A conta escolhida é conferida, e não só oferecida
 *
 * O `select` da tela só lista contas deste tenant, mas ele chega pela rede e
 * `company_id` é um campo que qualquer um edita. A chave estrangeira composta
 * (`tenant_id, company_id`) já recusaria uma conta de outro tenant — o
 * Postgres não deixa escrever —, e o que se ganha conferindo antes é a
 * **mensagem**: "essa empresa não é desta conta" em vez de um erro de
 * constraint que fala de nome de regra.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { conferirEmail, conferirTelefone, mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { CONTATO_INICIAL, type ContatoFormState } from './state.ts';

/** De onde a tela lê e escreve. Uma constante: o caminho também é a regra. */
const ROTA = '/crm/contatos';

function conferir(form: FormData): ContatoFormState['campos'] {
  const campos: Record<string, string> = {};

  if (texto(form, 'name') === '') campos.name = 'Obrigatório.';

  const email = conferirEmail(texto(form, 'email'));
  if (email !== null) campos.email = email;

  const telefone = conferirTelefone(texto(form, 'phone'));
  if (telefone !== null) campos.phone = telefone;

  return campos;
}

export async function criarContato(
  _anterior: ContatoFormState,
  form: FormData,
): Promise<ContatoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...CONTATO_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const campos = conferir(form);
  if (Object.keys(campos).length > 0) return { ...CONTATO_INICIAL, campos };

  const supabase = await supabaseServer();
  const empresaId = opcional(form, 'company_id');

  if (empresaId !== null) {
    /*
     * A leitura passa pelo RLS e pelo tenant da sessão. Uma conta de outro
     * tenant não volta, e o `null` resultante é o que produz a mensagem — sem
     * confirmar para quem tentou que aquele identificador existe em algum
     * lugar.
     */
    const { data: empresa } = await supabase
      .from('crm_companies')
      .select('id')
      .eq('id', empresaId)
      .eq('tenant_id', choice.tenant.id)
      .maybeSingle();

    if (empresa === null) {
      return { ...CONTATO_INICIAL, campos: { company_id: 'Essa empresa não está na sua lista.' } };
    }
  }

  const nome = texto(form, 'name');

  const { error } = await supabase.from('crm_contacts').insert({
    tenant_id: choice.tenant.id,
    company_id: empresaId,
    name: nome,
    title: opcional(form, 'title'),
    email: opcional(form, 'email'),
    phone: opcional(form, 'phone'),
    notes: opcional(form, 'notes'),
  });

  if (error !== null) {
    return {
      ...CONTATO_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para cadastrar contatos aqui.'),
    };
  }

  revalidatePath(ROTA);
  return { ...CONTATO_INICIAL, criado: nome };
}
