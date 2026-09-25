'use server';

/**
 * As escritas de contas.
 *
 * `requireAccess()` de novo aqui dentro — Server Action é endpoint. O tenant
 * vem da sessão. O colaborador lê conta e não escreve (ver o catálogo), e quem
 * nega é o RLS; a resposta de zero linhas vira a mensagem de permissão.
 */

import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { parseCompanyInput } from '@/lib/crm/company-input';
import { dbErrorMessage } from '@/lib/db-errors';
import { isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { CONTA_INICIAL, type ContaFormState } from './state';

const ROTA = '/crm/empresas';
const REPETIDO = 'Já existe cadastro com este documento. Procure pela busca antes de criar outro.';

export async function criarConta(
  _anterior: ContaFormState,
  form: FormData,
): Promise<ContaFormState> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...CONTA_INICIAL, erro: 'Escolha uma empresa.' };

  const conferido = parseCompanyInput(form);
  if (!conferido.ok) return { ...CONTA_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { error } = await supabase.from('crm_companies').insert({
    tenant_id: choice.tenant.id,
    name: v.nome,
    legal_name: v.razaoSocial,
    document: v.documento,
    email: v.email,
    phone: v.telefone,
    website: v.site,
    owner_id: v.responsavelId ?? viewer.userId,
    notes: v.notas,
  });

  if (error !== null) {
    return error.code === '23505'
      ? { ...CONTA_INICIAL, campos: { documento: REPETIDO } }
      : { ...CONTA_INICIAL, erro: dbErrorMessage(error) };
  }

  revalidatePath(ROTA);
  return { ...CONTA_INICIAL, salvo: v.nome };
}

export async function editarConta(
  _anterior: ContaFormState,
  form: FormData,
): Promise<ContaFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ...CONTA_INICIAL, erro: 'Escolha uma empresa.' };

  const id = form.get('id');
  if (!isUuid(id)) return { ...CONTA_INICIAL, erro: 'Não encontrei este cadastro.' };

  const conferido = parseCompanyInput(form);
  if (!conferido.ok) return { ...CONTA_INICIAL, campos: conferido.campos };
  const v = conferido.valor;

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('crm_companies')
    .update({
      name: v.nome,
      legal_name: v.razaoSocial,
      document: v.documento,
      email: v.email,
      phone: v.telefone,
      website: v.site,
      owner_id: v.responsavelId,
      notes: v.notas,
    })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    .select('id');

  if (error !== null) {
    return error.code === '23505'
      ? { ...CONTA_INICIAL, campos: { documento: REPETIDO } }
      : { ...CONTA_INICIAL, erro: dbErrorMessage(error) };
  }
  if (data.length === 0) {
    return {
      ...CONTA_INICIAL,
      erro: 'Não foi possível salvar: sem permissão, ou o cadastro não existe mais.',
    };
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ...CONTA_INICIAL, salvo: v.nome };
}
