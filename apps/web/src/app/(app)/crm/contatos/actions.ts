'use server';

/**
 * As escritas de pessoas.
 *
 * `requireAccess()` de novo aqui dentro — Server Action é endpoint. O tenant
 * vem da sessão, nunca do formulário. E a exigência de documento vem da
 * configuração do tenant, lida no servidor: o formulário diz se o campo é
 * obrigatório, mas quem decide é isto aqui.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { parseContactInput } from '@/lib/crm/contact-input';
import { dbErrorMessage } from '@/lib/db-errors';
import { isUuid } from '@/lib/ids';
import { currentSettings } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';

import { CONTATO_INICIAL, type ContatoFormState } from './state';

const ROTA = '/crm/contatos';
const REPETIDO = 'Já existe cadastro com este documento. Procure pela busca antes de criar outro.';

async function exigeDocumento(): Promise<boolean> {
  return (await currentSettings())['crm.contact_requires_document'] === true;
}

export async function criarContato(
  _anterior: ContatoFormState,
  form: FormData,
): Promise<ContatoFormState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...CONTATO_INICIAL, erro: 'Escolha uma empresa.' };

  const conferido = parseContactInput(form, { exigirDocumento: await exigeDocumento() });
  if (!conferido.ok) return { ...CONTATO_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { error } = await supabase.from('crm_contacts').insert({
    tenant_id: choice.tenant.id,
    name: v.nome,
    email: v.email,
    phone: v.telefone,
    document: v.documento,
    title: v.cargo,
    company_id: v.contaId,
    owner_id: v.responsavelId ?? viewer.userId,
    notes: v.notas,
  });

  if (error !== null) {
    return error.code === '23505'
      ? { ...CONTATO_INICIAL, campos: { documento: REPETIDO } }
      : { ...CONTATO_INICIAL, erro: dbErrorMessage(error) };
  }

  revalidatePath(ROTA);
  return { ...CONTATO_INICIAL, salvo: v.nome };
}

export async function editarContato(
  _anterior: ContatoFormState,
  form: FormData,
): Promise<ContatoFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...CONTATO_INICIAL, erro: 'Escolha uma empresa.' };

  const id = form.get('id');
  if (!isUuid(id)) return { ...CONTATO_INICIAL, erro: 'Não encontrei este cadastro.' };

  const conferido = parseContactInput(form, { exigirDocumento: await exigeDocumento() });
  if (!conferido.ok) return { ...CONTATO_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('crm_contacts')
    .update({
      name: v.nome,
      email: v.email,
      phone: v.telefone,
      document: v.documento,
      title: v.cargo,
      company_id: v.contaId,
      owner_id: v.responsavelId,
      notes: v.notas,
    })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) {
    return error.code === '23505'
      ? { ...CONTATO_INICIAL, campos: { documento: REPETIDO } }
      : { ...CONTATO_INICIAL, erro: dbErrorMessage(error) };
  }
  if (data.length === 0) {
    return {
      ...CONTATO_INICIAL,
      erro: 'Não foi possível salvar: sem permissão, ou o cadastro não existe mais.',
    };
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ...CONTATO_INICIAL, salvo: v.nome };
}
