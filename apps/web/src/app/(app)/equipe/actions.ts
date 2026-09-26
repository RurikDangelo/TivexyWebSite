'use server';

/**
 * As escritas da equipe.
 *
 * O banco segura o que importa: o RLS exige `core.users.write`; a empresa não
 * fica sem administrador; ninguém dá um papel com mais poder que o seu. Ver
 * `20260925060000_team_keeps_admin`. Daqui sai a mensagem.
 *
 * ## Duas conexões, por um motivo cada
 *
 * O vínculo é escrito **com a sessão** de quem convida, passando pelo RLS e
 * pelos gatilhos como qualquer escrita. Só duas coisas usam a chave de
 * serviço, porque só elas precisam: criar a identidade (é do Supabase, não se
 * cria por SQL) e perguntar se a conta tem vínculo em outra empresa (o RLS,
 * corretamente, não deixa ver). A permissão é conferida **antes** de qualquer
 * uma das duas.
 */

import { can } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';
import { decidirLink } from '@/lib/team/link-policy';
import { magicLinkFor } from '@/server/auth-links';
import { sqlClient } from '@/server/db';
import { identityPort } from '@/server/provisioning/identity';
import { contaPorEmail } from '@/server/team';

import { EQUIPE_INICIAL, type EquipeState } from './state';

const ROTA = '/equipe';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const falha = (erro: string, campos: EquipeState['campos'] = {}): EquipeState => ({
  ...EQUIPE_INICIAL,
  erro,
  campos,
});

type Contexto = { ok: false; erro: string } | { ok: true; tenantId: string; eu: string | null };

async function contexto(): Promise<Contexto> {
  const { choice, viewer } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return { ok: false, erro: 'Escolha uma empresa.' };
  if (!can(viewer, 'core.users.write')) {
    return { ok: false, erro: 'Você pode ver a equipe, mas não mudar.' };
  }
  return { ok: true, tenantId: choice.tenant.id, eu: viewer.userId };
}

async function registrar(
  tenantId: string,
  acao: string,
  vinculoId: string,
  metadata: Record<string, unknown>,
  eu: string | null,
) {
  const supabase = await supabaseServer();
  /* Registro de auditoria não derruba a operação que já aconteceu: se falhar, falha sozinho. */
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_user_id: eu,
    action: acao,
    resource_type: 'tenant_user',
    resource_id: vinculoId,
    metadata,
  });
}

/** O link, se a política deixar; senão, o motivo. */
async function linkSePuder(email: string, tenantId: string) {
  const conta = await contaPorEmail(email, tenantId);
  const decisao = decidirLink({
    jaExistia: true,
    nuncaEntrou: conta?.nuncaEntrou ?? true,
    outrasEmpresas: conta?.outrasEmpresas ?? 0,
    superAdmin: conta?.superAdmin ?? false,
  });
  if (!decisao.gerar) return { link: null, motivo: decisao.motivo } as const;
  const r = await magicLinkFor(email);
  return r.ok
    ? ({ link: r.link, motivo: null } as const)
    : ({ link: null, motivo: r.erro } as const);
}

export async function convidarPessoa(_a: EquipeState, form: FormData): Promise<EquipeState> {
  const ctx = await contexto();
  if (!ctx.ok) return falha(ctx.erro);

  const email = campo(form, 'email').toLowerCase();
  const nome = campo(form, 'nome');
  const papel = campo(form, 'papel');
  const campos: Record<string, string> = {};
  if (!EMAIL.test(email)) campos.email = 'Não parece um e-mail.';
  if (!isUuid(papel)) campos.papel = 'Escolha o papel.';
  if (Object.keys(campos).length > 0) return falha('', campos);

  const existente = await contaPorEmail(email, ctx.tenantId);
  if (existente?.vinculoAqui === 'active' || existente?.vinculoAqui === 'suspended') {
    return falha('', { email: 'Essa pessoa já faz parte da equipe.' });
  }
  if (existente?.vinculoAqui === 'invited') {
    return falha('', { email: 'Já há um convite para essa pessoa. Gere o link de novo na lista.' });
  }
  if (existente === null && nome === '') {
    return falha('', { nome: 'Para uma conta nova, o nome é obrigatório.' });
  }

  const identidades = identityPort(sqlClient());
  const criada =
    existente === null ? await identidades.ensureUser({ email, fullName: nome }) : null;
  const userId = existente?.userId ?? criada?.id ?? '';

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('tenant_users')
    .insert({
      tenant_id: ctx.tenantId,
      user_id: userId,
      role_id: papel,
      status: 'invited',
      invited_by: ctx.eu,
    })
    .select('id')
    .single();

  if (error !== null) {
    /*
     * O vínculo foi recusado — papel acima do de quem convida, por exemplo — e
     * a conta criada agora ficaria órfã: existe, entra, e não acha empresa
     * nenhuma. Desfaz **só o que esta chamada criou**, como a compensação do
     * provisionamento. Conta que já existia não é tocada.
     */
    if (criada?.created === true) await identidades.deleteUser(criada.id).catch(() => undefined);
    return falha(dbErrorMessage(error, 'Essa pessoa já tem vínculo aqui.'));
  }
  await registrar(ctx.tenantId, 'membership.invited', String(data.id), { user_id: userId }, ctx.eu);

  const { link, motivo } = await linkSePuder(email, ctx.tenantId);
  revalidatePath(ROTA);

  if (link !== null) {
    await registrar(ctx.tenantId, 'membership.link_generated', String(data.id), {}, ctx.eu);
    return {
      ...EQUIPE_INICIAL,
      ok: `Convite criado. Nenhum e-mail foi enviado: repasse o link a ${nome || email}.`,
      link,
    };
  }
  return { ...EQUIPE_INICIAL, ok: `Convite criado. ${motivo}` };
}

export async function gerarLinkDeNovo(_a: EquipeState, form: FormData): Promise<EquipeState> {
  const ctx = await contexto();
  if (!ctx.ok) return falha(ctx.erro);

  const vinculoId = campo(form, 'vinculo');
  if (!isUuid(vinculoId)) return falha('Convite não encontrado.');

  const supabase = await supabaseServer();
  const { data: vinculo } = await supabase
    .from('tenant_users')
    .select('status, users!tenant_users_user_id_fkey(email)')
    .eq('id', vinculoId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const pessoa = (Array.isArray(vinculo?.users) ? vinculo.users[0] : vinculo?.users) as {
    email?: string;
  } | null;
  if (vinculo?.status !== 'invited' || typeof pessoa?.email !== 'string') {
    return falha('Este convite não está mais pendente.');
  }

  const { link, motivo } = await linkSePuder(pessoa.email, ctx.tenantId);
  if (link === null) return { ...EQUIPE_INICIAL, ok: motivo };
  await registrar(ctx.tenantId, 'membership.link_generated', vinculoId, {}, ctx.eu);
  return { ...EQUIPE_INICIAL, ok: 'Link novo gerado. O anterior deixa de valer.', link };
}

export async function mudarPapel(_a: EquipeState, form: FormData): Promise<EquipeState> {
  const ctx = await contexto();
  if (!ctx.ok) return falha(ctx.erro);

  const vinculoId = campo(form, 'vinculo');
  const papel = campo(form, 'papel');
  if (!isUuid(vinculoId) || !isUuid(papel)) return falha('Escolha o papel.');

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('tenant_users')
    .update({ role_id: papel })
    .eq('id', vinculoId)
    .eq('tenant_id', ctx.tenantId)
    .select('id');
  if (error !== null) return falha(dbErrorMessage(error));
  if (data.length === 0) return falha('Não foi possível mudar: sem permissão.');

  await registrar(ctx.tenantId, 'membership.role_changed', vinculoId, { role_id: papel }, ctx.eu);
  revalidatePath(ROTA);
  return { ...EQUIPE_INICIAL, ok: 'Papel alterado.' };
}

/** Suspender e reativar. Convite pendente não se suspende — se remove. */
export async function mudarSituacao(_a: EquipeState, form: FormData): Promise<EquipeState> {
  const ctx = await contexto();
  if (!ctx.ok) return falha(ctx.erro);

  const vinculoId = campo(form, 'vinculo');
  const para = campo(form, 'para');
  if (!isUuid(vinculoId) || (para !== 'active' && para !== 'suspended')) {
    return falha('Mudança inválida.');
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('tenant_users')
    .update({ status: para })
    .eq('id', vinculoId)
    .eq('tenant_id', ctx.tenantId)
    .neq('status', 'invited')
    .select('id');
  if (error !== null) return falha(dbErrorMessage(error));
  if (data.length === 0)
    return falha('Não foi possível mudar: sem permissão, ou é um convite pendente.');

  await registrar(
    ctx.tenantId,
    para === 'suspended' ? 'membership.suspended' : 'membership.reactivated',
    vinculoId,
    {},
    ctx.eu,
  );
  revalidatePath(ROTA);
  return { ...EQUIPE_INICIAL, ok: para === 'suspended' ? 'Acesso suspenso.' : 'Acesso reativado.' };
}

/**
 * Tira a pessoa da empresa. A conta dela continua existindo — pode ser de
 * outra empresa — e o que ela cadastrou fica, sem responsável.
 */
export async function removerPessoa(_a: EquipeState, form: FormData): Promise<EquipeState> {
  const ctx = await contexto();
  if (!ctx.ok) return falha(ctx.erro);

  const vinculoId = campo(form, 'vinculo');
  if (!isUuid(vinculoId)) return falha('Pessoa não encontrada.');

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('tenant_users')
    .delete()
    .eq('id', vinculoId)
    .eq('tenant_id', ctx.tenantId)
    .select('id, user_id');
  if (error !== null) return falha(dbErrorMessage(error));
  if (data.length === 0) return falha('Não foi possível remover: sem permissão.');

  await registrar(
    ctx.tenantId,
    'membership.removed',
    vinculoId,
    { user_id: data[0]?.user_id ?? null },
    ctx.eu,
  );
  revalidatePath(ROTA);
  return { ...EQUIPE_INICIAL, ok: 'Pessoa removida da equipe.' };
}
