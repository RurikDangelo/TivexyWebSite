'use server';

/**
 * As escritas da tela de automações.
 *
 * `checkRule()` — do Core, puro — valida antes de gravar, e relata **todos**
 * os problemas de uma vez. O que ele pega e que o banco não pegaria:
 * condição sobre um campo que aquele gatilho nunca traz. Sem isso a regra é
 * salva, nunca dispara e não dá erro — o defeito sem sintoma.
 */

import {
  AUTOMATION_ACTIONS,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationCondition,
  type AutomationOperator,
  checkRule,
  needsValue,
} from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { mensagemDeErro, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';

import { REGRA_INICIAL, type RegraFormState } from './state.ts';

const ROTA = '/automacoes';

/**
 * Monta a regra a partir do formulário.
 *
 * O formulário é simples de propósito: **uma condição e uma ação**. Um
 * construtor de regras com listas dinâmicas é tela grande, e tela grande
 * antes de alguém usar a pequena é o tipo de coisa que se constrói e depois
 * se descobre que ninguém precisava. Regras com mais de uma condição já são
 * possíveis no esquema e no motor — falta só a interface, e ela vem quando
 * alguém pedir.
 */
function montar(form: FormData): {
  name: string;
  event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
} {
  const campo = texto(form, 'cond_field');
  const operador = texto(form, 'cond_operator') as AutomationOperator;

  const conditions: AutomationCondition[] =
    campo === '' || operador.length === 0
      ? []
      : [
          {
            field: campo,
            operator: operador,
            /* `exists` e `empty` não usam valor; mandar um faria `checkRule`
               aceitar e o motor ignorar, que é divergência calada. */
            ...(needsValue(operador) ? { value: texto(form, 'cond_value') } : {}),
          },
        ];

  const tipoAcao = texto(form, 'acao_kind') as AutomationActionKind;
  const params: Record<string, string> = (AUTOMATION_ACTIONS as readonly string[]).includes(
    tipoAcao,
  )
    ? tipoAcao === 'crm.activity.create'
      ? { subject: texto(form, 'acao_subject'), dueInDays: texto(form, 'acao_dueInDays') }
      : {
          kind: texto(form, 'acao_finance_kind'),
          description: texto(form, 'acao_description'),
          amountCents: texto(form, 'acao_amountCents'),
          dueInDays: texto(form, 'acao_dueInDays'),
        }
    : {};

  return {
    name: texto(form, 'name'),
    event: texto(form, 'event'),
    conditions,
    actions: [{ kind: tipoAcao, params }],
  };
}

export async function criarRegra(
  _anterior: RegraFormState,
  form: FormData,
): Promise<RegraFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...REGRA_INICIAL, erro: 'Escolha uma empresa antes de criar a regra.' };
  }

  const regra = montar(form);
  const problemas = checkRule(regra);
  if (problemas.length > 0) return { ...REGRA_INICIAL, problemas };

  const supabase = await supabaseServer();

  const { error } = await supabase.from('automation_rules').insert({
    tenant_id: choice.tenant.id,
    name: regra.name,
    event: regra.event,
    /*
     * `conditions` e `actions` vão como objeto, e o cliente PostgREST
     * serializa. A armadilha do `::text::jsonb` é do SQL escrito à mão — aqui
     * o caminho é outro, e o teste de banco confere o formato gravado.
     */
    conditions: regra.conditions,
    actions: regra.actions,
  });

  if (error !== null) {
    if (error.code === '23505') {
      return {
        ...REGRA_INICIAL,
        problemas: [{ path: 'name', message: 'já existe uma regra com esse nome' }],
      };
    }
    return {
      ...REGRA_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para criar automações aqui.'),
    };
  }

  revalidatePath(ROTA);
  return { ...REGRA_INICIAL, criada: regra.name };
}

/**
 * Liga e desliga a regra.
 *
 * Desligar e não apagar: o histórico aponta para a regra, e apagar deixaria
 * as linhas órfãs. E desligar é o que alguém quer fazer para testar se uma
 * automação é a causa de algo estranho — apagar torna esse teste
 * irreversível.
 */
export async function alternarRegra(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  if (id === '') return;

  const estavaAtiva = texto(form, 'ativa') === 'sim';

  const supabase = await supabaseServer();
  await supabase
    .from('automation_rules')
    .update({ is_active: !estavaAtiva })
    .eq('id', id)
    .eq('tenant_id', choice.tenant.id)
    /* O estado de origem: dois cliques rápidos não alternam duas vezes. */
    .eq('is_active', estavaAtiva);

  revalidatePath(ROTA);
}

export async function apagarRegra(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  if (id === '') return;

  const supabase = await supabaseServer();
  /*
   * O histórico sobrevive: `automation_runs.rule_id` é `on delete set null`, e
   * o nome da regra fica gravado à parte justamente para o registro continuar
   * respondendo "o que criou isso na minha agenda?".
   */
  await supabase.from('automation_rules').delete().eq('id', id).eq('tenant_id', choice.tenant.id);

  revalidatePath(ROTA);
}
