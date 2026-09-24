'use server';

/**
 * As operações da ficha do cliente.
 *
 * ## `requireAccess('/admin')` em cada uma, de novo
 *
 * O layout já guardou a página, e isso não basta: **Server Action é um
 * endpoint**. Quem descobrir o identificador de uma delas pode chamá-la sem
 * nunca abrir a tela, e a guarda do layout não roda em chamada de ação.
 * Autorizar na tela e não na ação é o engano clássico desta camada.
 *
 * ## Onde mora cada regra
 *
 * | Operação        | Quem decide                                        |
 * | --------------- | -------------------------------------------------- |
 * | Editar dados    | RLS — `tenants_update` mais privilégio de coluna   |
 * | Suspender       | `admin_set_tenant_status()`, no banco              |
 * | Trocar plano    | `admin_set_tenant_plan()`, no banco                |
 * | Convidar        | RLS — `tenant_users_write` exige Super Admin ou    |
 * |                 | `core.users.write`                                  |
 *
 * As duas do meio são função porque `status` e `plan_id` **não são
 * atualizáveis** por `authenticated`: o privilégio de coluna só devolveu
 * `name, legal_name, document, settings`. A alternativa seria escrever com a
 * conexão de serviço, e aí a regra de quem pode suspender um cliente moraria
 * em TypeScript, fora do alcance dos testes de banco.
 */

import {
  PLAN_CODES,
  SYSTEM_ROLE_CODES,
  TENANT_STATUSES,
  type PlanCode,
  isValidTimeZone,
} from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { checkDocument, onlyDigits } from '@tivexy/core';
import { supabaseServer } from '@/lib/supabase/server';
import { sqlClient } from '@/server/db';
import { identityPort } from '@/server/provisioning/identity';

import { gerarLinkDeAcesso } from '../../access-link.ts';
import {
  CICLO_INICIAL,
  type CicloState,
  CONVITE_ADMIN_INICIAL,
  type ConviteState,
  EDICAO_INICIAL,
  type EdicaoState,
  PLANO_INICIAL,
  type PlanoState,
} from './state.ts';

/** Estreita o texto da rede para `PlanCode` provando, não afirmando. */
function ehPlano(valor: string): valor is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(valor);
}

function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * O tenant desta ficha, achado pelo slug da URL.
 *
 * Achar pelo slug e devolver o **id** é deliberado: o id é o que as funções do
 * banco recebem, e nenhum formulário desta tela envia id. O que vem do
 * navegador é o slug, que já está na URL e não decide nada sozinho — quem
 * decide é o RLS, que só devolve o tenant para quem pode vê-lo.
 */
async function tenantDoSlug(slug: string): Promise<{ id: string } | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle();
  return data === null ? null : { id: String(data.id) };
}

/** Revalida a ficha e a lista, que mostram o mesmo estado. */
function recarregar(slug: string): void {
  revalidatePath(`/admin/clientes/${slug}`);
  revalidatePath('/admin');
}

/* ── Editar os dados do cliente ────────────────────────────────────────── */

export async function editarCliente(_anterior: EdicaoState, form: FormData): Promise<EdicaoState> {
  await requireAccess('/admin');

  const slug = texto(form, 'slug');
  const alvo = await tenantDoSlug(slug);
  if (alvo === null) return { ...EDICAO_INICIAL, erro: 'Cliente não encontrado.' };

  const campos: Record<string, string> = {};

  const nome = texto(form, 'name');
  if (nome === '') campos.name = 'Obrigatório.';

  const documento = texto(form, 'document');
  const problemaDoc = checkDocument(documento);
  if (problemaDoc !== null) campos.document = problemaDoc;

  /*
   * O fuso decide o que é "hoje" em relatório e o que é "atrasado" na agenda.
   * Um valor inválido aqui não derruba nada — a leitura cai no padrão —, e
   * por isso mesmo precisa ser recusado na escrita: gravar um fuso que o
   * sistema ignora é a configuração sem efeito, o defeito sem sintoma.
   */
  const fuso = texto(form, 'timezone');
  if (fuso !== '' && !isValidTimeZone(fuso)) campos.timezone = 'Fuso desconhecido.';

  if (Object.keys(campos).length > 0) {
    return { ...EDICAO_INICIAL, campos: campos as EdicaoState['campos'] };
  }

  const supabase = await supabaseServer();

  /*
   * `settings` é lido e reescrito inteiro porque é uma coluna `jsonb` — não há
   * update parcial de chave pelo PostgREST. Ler antes preserva o que outras
   * partes do sistema tenham gravado ali.
   */
  const { data: atual } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', alvo.id)
    .maybeSingle();

  const settings: Record<string, unknown> = {
    ...(typeof atual?.settings === 'object' && atual.settings !== null
      ? (atual.settings as Record<string, unknown>)
      : {}),
  };

  if (fuso === '') delete settings['core.timezone'];
  else settings['core.timezone'] = fuso;

  const { error } = await supabase
    .from('tenants')
    .update({
      name: nome,
      legal_name: texto(form, 'legal_name') || null,
      document: documento === '' ? null : onlyDigits(documento),
      settings,
    })
    .eq('id', alvo.id);

  if (error !== null) {
    return {
      ...EDICAO_INICIAL,
      erro:
        error.code === '42501'
          ? 'Você não tem permissão para editar este cliente.'
          : `Não consegui salvar: ${error.message}`,
    };
  }

  recarregar(slug);
  return { ...EDICAO_INICIAL, salvo: true };
}

/* ── Suspender, reativar, cancelar ─────────────────────────────────────── */

export async function mudarEstado(_anterior: CicloState, form: FormData): Promise<CicloState> {
  await requireAccess('/admin');

  const slug = texto(form, 'slug');
  const alvo = await tenantDoSlug(slug);
  if (alvo === null) return { ...CICLO_INICIAL, erro: 'Cliente não encontrado.' };

  /*
   * O destino é conferido contra a lista de estados que existem. A função no
   * banco recusaria de qualquer jeito — o parâmetro é tipado como
   * `tenant_status` —, mas o erro que chegaria falaria de tipo de enum, e não
   * de escolha inválida.
   */
  const destino = texto(form, 'destino');
  if (!(TENANT_STATUSES as readonly string[]).includes(destino)) {
    return { ...CICLO_INICIAL, erro: 'Estado desconhecido.' };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_set_tenant_status', {
    p_tenant_id: alvo.id,
    p_status: destino,
    p_reason: texto(form, 'motivo') || null,
  });

  if (error !== null) {
    return { ...CICLO_INICIAL, erro: error.message.replace(/^error:\s*/i, '') };
  }

  recarregar(slug);
  return { erro: null, agora: destino as CicloState['agora'] };
}

/* ── Trocar de plano ───────────────────────────────────────────────────── */

export async function trocarPlano(_anterior: PlanoState, form: FormData): Promise<PlanoState> {
  await requireAccess('/admin');

  const slug = texto(form, 'slug');
  const alvo = await tenantDoSlug(slug);
  if (alvo === null) return { ...PLANO_INICIAL, erro: 'Cliente não encontrado.' };

  /*
   * O código do plano é conferido contra o catálogo **antes** de virar
   * `PlanCode`. É a diferença entre estreitar o tipo por prova e estreitar por
   * afirmação: `as PlanCode` num texto da rede não confere nada.
   */
  const plano = texto(form, 'plano');
  if (!ehPlano(plano)) {
    return { ...PLANO_INICIAL, erro: 'Plano desconhecido.' };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('admin_set_tenant_plan', {
    p_tenant_id: alvo.id,
    p_plan_code: plano,
  });

  if (error !== null) {
    return { ...PLANO_INICIAL, erro: error.message.replace(/^error:\s*/i, '') };
  }

  /* A função devolve uma linha: o plano e quantos módulos mudaram de lado. */
  const linha = Array.isArray(data) ? data[0] : data;

  const contagem = linha as { habilitados?: unknown; desabilitados?: unknown } | null;

  recarregar(slug);
  return {
    erro: null,
    resultado: {
      plano,
      habilitados: Number(contagem?.habilitados ?? 0),
      desabilitados: Number(contagem?.desabilitados ?? 0),
    },
  };
}

/* ── Convidar alguém para a equipe do cliente ──────────────────────────── */

/**
 * Cria a identidade e o vínculo `invited`.
 *
 * **Não envia e-mail**, e a tela diz isso. O projeto ainda usa o servidor
 * embutido do Supabase, que só escreve para membros da equipe e para poucas
 * mensagens por hora — ver `docs/PROJECT_STATE.md`, dependências externas. O
 * link de acesso é gerado aqui para o Super Admin repassar pelo canal que já
 * usa com o cliente.
 *
 * Dizer "enviamos um convite" e nenhum e-mail sair é exatamente o tipo de
 * funcionalidade fingida que o `CLAUDE.md` proíbe.
 */
export async function convidarUsuario(
  _anterior: ConviteState,
  form: FormData,
): Promise<ConviteState> {
  await requireAccess('/admin');

  const slug = texto(form, 'slug');
  const alvo = await tenantDoSlug(slug);
  if (alvo === null) return { ...CONVITE_ADMIN_INICIAL, erro: 'Cliente não encontrado.' };

  const campos: Record<string, string> = {};

  const email = texto(form, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) campos.email = 'Não parece um e-mail.';

  const nome = texto(form, 'nome');
  if (nome === '') campos.nome = 'Obrigatório — é como a pessoa vai aparecer no sistema.';

  const papel = texto(form, 'papel');
  if (!(SYSTEM_ROLE_CODES as readonly string[]).includes(papel)) campos.papel = 'Escolha o papel.';

  if (Object.keys(campos).length > 0) {
    return { ...CONVITE_ADMIN_INICIAL, campos: campos as ConviteState['campos'] };
  }

  const supabase = await supabaseServer();

  const { data: papelLinha } = await supabase
    .from('roles')
    .select('id')
    .eq('code', papel)
    .is('tenant_id', null)
    .maybeSingle();

  if (papelLinha === null) {
    return { ...CONVITE_ADMIN_INICIAL, erro: `O papel ${papel} não existe no catálogo.` };
  }

  /*
   * Identidade não se cria por SQL. `ensureUser` é a mesma fronteira que o
   * provisionamento usa — em produção, a Auth Admin API. Fingir que um
   * `insert` em `auth.users` cria uma conta é o atalho que passa no teste e
   * falha na primeira pessoa real.
   */
  let identidade: { id: string; created: boolean };
  try {
    identidade = await identityPort(sqlClient()).ensureUser({ email, fullName: nome });
  } catch (erro) {
    return {
      ...CONVITE_ADMIN_INICIAL,
      erro: erro instanceof Error ? erro.message : 'Não consegui criar a conta.',
    };
  }

  const { error } = await supabase.from('tenant_users').insert({
    tenant_id: alvo.id,
    user_id: identidade.id,
    role_id: String(papelLinha.id),
    status: 'invited',
  });

  if (error !== null) {
    /*
     * `23505` é o índice `tenant_users_unique`: a pessoa já participa deste
     * cliente. Não é erro do sistema, é informação — e dizer isso evita que
     * alguém convide três vezes achando que não funcionou.
     */
    return {
      ...CONVITE_ADMIN_INICIAL,
      erro:
        error.code === '23505'
          ? `${email} já participa deste cliente. Veja a lista da equipe abaixo.`
          : `Criei a conta, mas não consegui vincular: ${error.message}`,
    };
  }

  /*
   * O link é gerado depois do vínculo, não antes: se o vínculo falhar, ter
   * gerado uma credencial de acesso seria pior do que não ter.
   */
  const linkForm = new FormData();
  linkForm.set('email', email);
  const link = await gerarLinkDeAcesso(linkForm);

  recarregar(slug);
  return {
    ...CONVITE_ADMIN_INICIAL,
    criado: { email, link: link.link, jaExistia: !identidade.created },
  };
}
