'use server';

/**
 * As escritas da tela de leads.
 *
 * Nenhuma delas confia na tela. `requireAccess()` roda aqui dentro, de novo:
 * Server Action é endpoint, e quem descobrir o identificador dela pode chamá-la
 * sem nunca ter aberto a página. Abaixo disso ainda há o RLS, que nega a
 * escrita a quem não tem `crm.leads.write` mesmo que estas duas linhas sumam.
 *
 * ## O tenant vem da sessão, nunca do formulário
 *
 * O RLS impede escrever no tenant de outra pessoa, e **não** escolhe em qual
 * dos tenants dela a linha vai cair — quem participa de duas empresas tem
 * permissão nas duas. Aceitar `tenant_id` do formulário deixaria essa escolha
 * com o navegador, e o lead do cliente A iria parar na base do cliente B sem
 * que nada desse erro.
 */

import { type CrmLeadStatus, nextLeadStatuses, parseCents } from '@tivexy/core';
import { revalidatePath } from 'next/cache';

import { requireAccess } from '@/lib/auth/require';
import { conferirEmail, conferirTelefone, mensagemDeErro, opcional, texto } from '@/lib/crm/form';
import { supabaseServer } from '@/lib/supabase/server';
import { dispararAutomacoes } from '@/server/automation/run';

import {
  CONVERSAO_INICIAL,
  type ConversaoState,
  LEAD_INICIAL,
  type LeadFormState,
} from './state.ts';

/** De onde a tela lê e escreve. Uma constante: o caminho também é a regra. */
const ROTA = '/crm/leads';

/**
 * Validação de forma, antes de falar com o banco.
 *
 * O banco tem as suas — `name` não pode ser branco — e elas chegam como
 * violação de constraint, que não diz a quem preencheu qual campo consertar.
 * Isto aqui existe para a mensagem, não para a garantia. As regras em si
 * vivem em `lib/crm/form.ts`, compartilhadas com as outras telas do módulo:
 * três definições de "isto parece um e-mail?" divergem na primeira correção.
 */
function conferir(form: FormData): LeadFormState['campos'] {
  const campos: Record<string, string> = {};

  if (texto(form, 'name') === '') campos.name = 'Obrigatório.';

  const email = conferirEmail(texto(form, 'email'));
  if (email !== null) campos.email = email;

  const telefone = conferirTelefone(texto(form, 'phone'));
  if (telefone !== null) campos.phone = telefone;

  return campos;
}

export async function criarLead(_anterior: LeadFormState, form: FormData): Promise<LeadFormState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...LEAD_INICIAL, erro: 'Escolha uma empresa antes de cadastrar.' };
  }

  const campos = conferir(form);
  if (Object.keys(campos).length > 0) return { ...LEAD_INICIAL, campos };

  const nome = texto(form, 'name');
  const supabase = await supabaseServer();

  const { data: criado, error } = await supabase
    .from('crm_leads')
    .insert({
      tenant_id: choice.tenant.id,
      name: nome,
      email: opcional(form, 'email'),
      phone: opcional(form, 'phone'),
      company_name: opcional(form, 'company_name'),
      source: opcional(form, 'source'),
    })
    .select('id, name, source, company_name, status')
    .maybeSingle();

  if (error !== null) {
    /*
     * `42501` é negação do RLS. Traduzir é o que separa "você não tem
     * permissão para cadastrar" de um código que manda a pessoa abrir chamado.
     */
    return {
      ...LEAD_INICIAL,
      erro: mensagemDeErro(error, 'Você não tem permissão para cadastrar aqui.'),
    };
  }

  /*
   * As automações rodam **depois** da escrita, e a falha delas não desfaz o
   * cadastro: o lead está cadastrado. Uma regra mal escrita impedindo de
   * anotar um telefone, com mensagem falando de automação, seria o pior jeito
   * de errar aqui. Ver `server/automation/run.ts`.
   */
  if (criado !== null) {
    await dispararAutomacoes(supabase, choice.tenant.id, {
      type: 'crm.lead.created',
      data: {
        name: String(criado.name),
        source: (criado.source as string | null) ?? null,
        companyName: (criado.company_name as string | null) ?? null,
        status: String(criado.status),
      },
      alvo: { tipo: 'lead', id: String(criado.id) },
    });
  }

  revalidatePath(ROTA);
  return { ...LEAD_INICIAL, criado: nome };
}

/**
 * Converte o lead: ele vira conta, pessoa e oportunidade.
 *
 * Quem faz o trabalho é `crm_convert_lead()`, no banco. São quatro escritas
 * que só fazem sentido juntas, e o cliente PostgREST não tem transação — daqui
 * seriam quatro chamadas, com quatro pontos onde a rede pode cair. O pior
 * desfecho parcial não parece defeito: a oportunidade aparece no funil e o
 * lead continua na fila, esperando alguém ligar de novo.
 *
 * A função é `SECURITY INVOKER`, então cada escrita passa pelo RLS como se
 * tivesse partido daqui. Isto **não** é um atalho para escrever o que a pessoa
 * não poderia escrever.
 */
export async function converterLead(
  _anterior: ConversaoState,
  form: FormData,
): Promise<ConversaoState> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') {
    return { ...CONVERSAO_INICIAL, erro: 'Escolha uma empresa antes de converter.' };
  }

  const leadId = texto(form, 'id');
  const etapa = texto(form, 'etapa');
  if (leadId === '' || etapa === '') {
    return { ...CONVERSAO_INICIAL, erro: 'Escolha a etapa do funil onde a oportunidade entra.' };
  }

  /*
   * Valor em branco é zero, e valor torto é erro. A diferença importa: quem
   * ainda não sabe quanto vale deixa vazio de propósito, e quem digitou
   * `1.2.3` errou — transformar os dois em zero esconde o segundo.
   */
  const bruto = texto(form, 'valor');
  const centavos = bruto === '' ? 0 : parseCents(bruto);
  if (centavos === null) {
    return { ...CONVERSAO_INICIAL, erro: 'O valor não parece um número. Use 1.234,56.' };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('crm_convert_lead', {
    p_lead_id: leadId,
    p_stage_id: etapa,
    p_deal_title: texto(form, 'titulo') || null,
    p_value_cents: centavos,
  });

  if (error !== null) {
    /*
     * A função levanta mensagens escritas para gente — "já foi convertido",
     * "você não tem permissão para isso". Repassar é melhor do que um texto
     * genérico; o que não se repassa é erro de infraestrutura.
     */
    return {
      ...CONVERSAO_INICIAL,
      erro: error.message.replace(/^error:\s*/i, '') || 'Não consegui converter.',
    };
  }

  revalidatePath(ROTA);
  return { erro: null, convertido: texto(form, 'nome') || 'O lead' };
}

/**
 * Move o lead de estado.
 *
 * A transição permitida vem de `nextLeadStatuses()`, no Core — a mesma função
 * que a tela usa para desenhar os botões. Conferir aqui de novo não é
 * desconfiança do próprio código: o formulário chega pela rede, e o destino é
 * um campo que qualquer um edita.
 */
export async function moverLead(form: FormData): Promise<void> {
  const { choice } = await requireAccess(ROTA);
  if (choice.kind !== 'resolved') return;

  const id = texto(form, 'id');
  const de = texto(form, 'de') as CrmLeadStatus;
  const para = texto(form, 'para') as CrmLeadStatus;

  if (id === '' || !nextLeadStatuses(de).includes(para)) return;

  const supabase = await supabaseServer();
  const { data: movido } = await supabase
    .from('crm_leads')
    .update({ status: para })
    .eq('id', id)
    /*
     * O tenant no `where`, mesmo com o RLS filtrando. Sem ele, um id de outra
     * empresa em que a pessoa **também** trabalha seria atualizado a partir da
     * tela da empresa errada — o RLS deixaria passar, porque ela tem permissão
     * nas duas.
     */
    .eq('tenant_id', choice.tenant.id)
    /* E o estado de origem: dois cliques rápidos não aplicam a transição duas vezes. */
    .eq('status', de)
    .select('id, name, source, status')
    .maybeSingle();

  /*
   * Só dispara se a linha **mudou de verdade**. O `select` depois do `update`
   * devolve nulo quando nada casou — segundo clique, ou aba velha —, e sem
   * essa conferência a automação rodaria de novo sobre um estado que já
   * valia.
   */
  if (movido !== null) {
    await dispararAutomacoes(supabase, choice.tenant.id, {
      type: 'crm.lead.status_changed',
      data: {
        name: String(movido.name),
        source: (movido.source as string | null) ?? null,
        status: String(movido.status),
        previousStatus: de,
      },
      alvo: { tipo: 'lead', id: String(movido.id) },
    });
  }

  revalidatePath(ROTA);
}
