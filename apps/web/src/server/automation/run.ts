import 'server-only';

/**
 * A execução das automações.
 *
 * `planAutomations()`, no Core, decide **o que** fazer. Este arquivo faz — e a
 * divisão é a mesma de `planProvisioning()` e `executeProvisioning()`.
 *
 * ## Uma automação nunca derruba o que a provocou
 *
 * Quem chama isto acabou de cadastrar um lead ou confirmar uma venda. Se a
 * automação falhar, **a operação original continua valendo**: o lead está
 * cadastrado, a venda está confirmada. A falha vira linha em
 * `automation_runs`, com o motivo, e a tela de automações a mostra.
 *
 * O contrário seria pior de um jeito difícil de explicar: uma regra mal
 * escrita impediria de cadastrar lead, e a mensagem falaria de automação para
 * quem só queria anotar um nome de telefone.
 *
 * ## E nunca falha em silêncio
 *
 * Toda tentativa é registrada, inclusive as que deram errado. Automação que
 * falha calada é pior que automação nenhuma — a pessoa parou de fazer à mão
 * confiando nela.
 */

import {
  type AutomationEvent,
  type AutomationRule,
  type AutomationTriggerEvent,
  applyTemplate,
  planAutomations,
} from '@tivexy/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Sobre quem a automação vai agir, quando a ação precisar de um alvo. */
export interface AlvoDoEvento {
  tipo: 'lead' | 'contact' | 'company' | 'deal';
  id: string;
}

export interface EventoDeAutomacao extends AutomationTriggerEvent {
  /**
   * Fora de `data` de propósito. `data` é o que as **condições** comparam —
   * texto e número. O alvo é uma referência, e misturar os dois convidaria
   * alguém a escrever uma condição sobre um uuid.
   */
  alvo: AlvoDoEvento | null;
  /** Para a ação de financeiro amarrar o lançamento a um cliente. */
  empresaId?: string | null;
}

/** A coluna de alvo de cada tipo, espelhando `crm_activities_one_target`. */
const COLUNA_DO_ALVO: Record<AlvoDoEvento['tipo'], string> = {
  lead: 'lead_id',
  contact: 'contact_id',
  company: 'company_id',
  deal: 'deal_id',
};

/** `dueInDays` → data ISO. Dia inteiro, não instante: prazo é calendário. */
function daquiADias(dias: number): string {
  const instante = new Date();
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString();
}

/** `dueInDays` → `YYYY-MM-DD`, para a coluna `date` do financeiro. */
function vencimentoEm(dias: number): string {
  return daquiADias(dias).slice(0, 10);
}

function inteiro(valor: string | undefined, padrao: number): number {
  const n = Number((valor ?? '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
}

/**
 * Dispara as automações de um evento.
 *
 * Devolve quantas rodaram e quantas falharam — quem chama normalmente ignora,
 * porque o resultado não muda o que ele já fez. Serve para teste e para a
 * tela poder dizer "duas automações rodaram".
 */
export async function dispararAutomacoes(
  supabase: SupabaseClient,
  tenantId: string,
  evento: EventoDeAutomacao,
): Promise<{ executadas: number; falhas: number }> {
  let executadas = 0;
  let falhas = 0;

  try {
    const { data } = await supabase
      .from('automation_rules')
      .select('id, name, event, conditions, actions, is_active')
      .eq('tenant_id', tenantId)
      .eq('event', evento.type)
      .eq('is_active', true)
      .limit(50);

    const regras: AutomationRule[] = (data ?? []).map((linha) => ({
      id: String(linha.id),
      name: String(linha.name),
      event: linha.event as AutomationEvent,
      /* O banco garante que são arrays — há constraint. O `?? []` é a rede
         embaixo, para o caso de a linha ter vindo de antes da constraint. */
      conditions: Array.isArray(linha.conditions) ? linha.conditions : [],
      actions: Array.isArray(linha.actions) ? linha.actions : [],
      isActive: linha.is_active === true,
    }));

    const plano = planAutomations(evento, regras);

    for (const planejada of plano) {
      try {
        const resultado = await executar(supabase, tenantId, evento, planejada.action);
        await registrar(supabase, tenantId, evento, planejada, true, null, resultado);
        executadas += 1;
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : 'falha desconhecida';
        await registrar(supabase, tenantId, evento, planejada, false, motivo, {});
        falhas += 1;
      }
    }
  } catch {
    /*
     * Nem ler as regras deu certo. Não há o que registrar — o registro mora
     * no mesmo banco — e, de novo, isto não pode derrubar quem chamou.
     */
    return { executadas, falhas };
  }

  return { executadas, falhas };
}

/** Uma ação. Lança em caso de falha; quem chama registra. */
async function executar(
  supabase: SupabaseClient,
  tenantId: string,
  evento: EventoDeAutomacao,
  acao: { kind: string; params: Readonly<Record<string, string>> },
): Promise<Record<string, unknown>> {
  if (acao.kind === 'crm.activity.create') {
    if (evento.alvo === null) {
      throw new Error('este gatilho não tem sobre quem criar a atividade');
    }

    const assunto = applyTemplate(acao.params.subject ?? '', evento.data).trim();
    if (assunto === '') throw new Error('o assunto da atividade ficou vazio');

    const { data, error } = await supabase
      .from('crm_activities')
      .insert({
        tenant_id: tenantId,
        subject: assunto,
        due_at: daquiADias(inteiro(acao.params.dueInDays, 1)),
        [COLUNA_DO_ALVO[evento.alvo.tipo]]: evento.alvo.id,
      })
      .select('id')
      .maybeSingle();

    if (error !== null) throw new Error(error.message);
    return { tabela: 'crm_activities', id: data === null ? null : String(data.id) };
  }

  if (acao.kind === 'finance.entry.create') {
    const descricao = applyTemplate(acao.params.description ?? '', evento.data).trim();
    if (descricao === '') throw new Error('a descrição do lançamento ficou vazia');

    /*
     * O valor pode vir de um campo do evento — `{{totalCents}}` numa regra de
     * comissão, por exemplo. Precisa acabar em centavos inteiros e maior que
     * zero: a constraint do banco recusa o resto, e a mensagem daqui diz o
     * que aconteceu em vez de falar de constraint.
     */
    const bruto = applyTemplate(acao.params.amountCents ?? '', evento.data).trim();
    const centavos = Math.trunc(Number(bruto));
    if (!Number.isFinite(centavos) || centavos <= 0) {
      throw new Error(`o valor "${bruto}" não é um número de centavos maior que zero`);
    }

    const tipo = acao.params.kind === 'payable' ? 'payable' : 'receivable';

    const { data, error } = await supabase
      .from('finance_entries')
      .insert({
        tenant_id: tenantId,
        kind: tipo,
        description: descricao,
        amount_cents: centavos,
        due_date: vencimentoEm(inteiro(acao.params.dueInDays, 0)),
        company_id: evento.empresaId ?? null,
      })
      .select('id')
      .maybeSingle();

    if (error !== null) throw new Error(error.message);
    return { tabela: 'finance_entries', id: data === null ? null : String(data.id) };
  }

  /* Ação que o catálogo não conhece. `checkRule()` já recusaria ao salvar; se
     chegou aqui, a regra veio de antes do catálogo mudar. */
  throw new Error(`ação desconhecida: ${acao.kind}`);
}

/** O registro do disparo. Nunca lança: falhar ao registrar não pode cascatear. */
async function registrar(
  supabase: SupabaseClient,
  tenantId: string,
  evento: EventoDeAutomacao,
  planejada: { ruleId: string; ruleName: string },
  sucesso: boolean,
  erro: string | null,
  resultado: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('automation_runs').insert({
      tenant_id: tenantId,
      rule_id: planejada.ruleId,
      rule_name: planejada.ruleName,
      event: evento.type,
      payload: evento.data,
      succeeded: sucesso,
      error: erro,
      result: resultado,
    });
  } catch {
    /* Silêncio aqui é a única opção honesta: não há outro lugar para
       registrar que o registro falhou. */
  }
}
