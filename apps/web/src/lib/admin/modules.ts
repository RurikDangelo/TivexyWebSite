'use server';

/**
 * Ligar e desligar um módulo de uma empresa, fora do plano.
 *
 * `admin_change_plan` já move módulos em bloco, seguindo o plano. Estas duas
 * ações são o caso que o plano não cobre — cortesia, piloto, migração — e
 * passam por `admin_set_tenant_module` (20260926010000), que confere
 * `is_super_admin()`, recusa empresa em provisionamento, trava a linha, recusa
 * o que já está no estado pedido e audita com o motivo na mesma transação.
 *
 * **Desligar não apaga nada.** A linha de `tenant_modules` fica, o acesso sai,
 * religar devolve tudo. É a mesma regra de `admin_change_plan`, e ela existe
 * porque cliente que volta atrás não pode perder o que cadastrou.
 */

import { MODULE_CODES, type ModuleCode } from '@tivexy/core';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';

import { requireAccess } from '@/lib/auth/require';
import { dbErrorMessage } from '@/lib/db-errors';
import { campo, isUuid } from '@/lib/ids';
import { supabaseServer } from '@/lib/supabase/server';

import { ADMIN_BASE, MODULOS_INICIAL, type ModulosState } from './state';

function ehModulo(valor: string): valor is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(valor);
}

/**
 * A guarda, o id e o código — as três coisas que as duas ações precisam.
 *
 * `requireAccess` em cada ação porque Server Action é endpoint, e a
 * conferência de `isSuperAdmin` porque a regra de prefixo pode ficar para trás
 * numa renomeação de rota e a regra padrão é mais fraca. Ver `brand.ts`.
 */
async function porta(form: FormData): Promise<{ id: string | null; codigo: ModuleCode | null }> {
  const contexto = await requireAccess(ADMIN_BASE);
  if (!contexto.viewer.isSuperAdmin) notFound();

  const id = campo(form, 'id');
  const codigo = campo(form, 'modulo');
  return {
    id: isUuid(id) ? id : null,
    codigo: ehModulo(codigo) ? codigo : null,
  };
}

function pronto(id: string, codigo: ModuleCode, ok: string): ModulosState {
  revalidatePath(`${ADMIN_BASE}/clientes/${id}`);
  revalidatePath(ADMIN_BASE);
  return { erro: null, ok, codigo };
}

function falhou(codigo: ModuleCode | null, erro: string): ModulosState {
  return { ...MODULOS_INICIAL, erro, codigo };
}

export async function ligarModulo(_anterior: ModulosState, form: FormData): Promise<ModulosState> {
  const { id, codigo } = await porta(form);
  if (codigo === null) return falhou(null, 'Módulo desconhecido.');
  if (id === null) return falhou(codigo, 'Empresa não encontrada.');

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_set_tenant_module', {
    p_tenant_id: id,
    p_module_code: codigo,
    p_enabled: true,
    p_reason: null,
  });
  if (error !== null) return falhou(codigo, dbErrorMessage(error));

  return pronto(id, codigo, 'Ligado. Quem está dentro alcança o módulo na próxima navegação.');
}

export async function desligarModulo(
  _anterior: ModulosState,
  form: FormData,
): Promise<ModulosState> {
  const { id, codigo } = await porta(form);
  if (codigo === null) return falhou(null, 'Módulo desconhecido.');
  if (id === null) return falhou(codigo, 'Empresa não encontrada.');

  /*
   * O Core não se desliga por aqui.
   *
   * Sem ele não há login, papéis nem permissões: a empresa fica de pé e
   * inalcançável, e quem religa é o Super Admin que acabou de se trancar do
   * lado de fora. `previewPlanChange` já protege o Core na troca de plano, mas
   * `admin_set_tenant_module` **não** tem essa guarda no banco — enquanto não
   * tiver, ela mora aqui. Está anotado para virar migração.
   */
  if (codigo === 'core') {
    return falhou(codigo, 'O Core não se desliga: é ele que sustenta login, papéis e permissões.');
  }

  /* O banco aceita motivo nulo; a tela não. É o texto que a auditoria guarda. */
  const motivo = campo(form, 'motivo');
  if (motivo === '') return falhou(codigo, 'Diga o motivo — é o que fica na auditoria.');

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('admin_set_tenant_module', {
    p_tenant_id: id,
    p_module_code: codigo,
    p_enabled: false,
    p_reason: motivo,
  });
  if (error !== null) return falhou(codigo, dbErrorMessage(error));

  return pronto(id, codigo, 'Desligado. O acesso sai; o cadastro fica, e religar devolve tudo.');
}
