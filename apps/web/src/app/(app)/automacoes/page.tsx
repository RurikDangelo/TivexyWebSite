import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_CODES,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
  CONDITION_OPERATORS,
  type ConditionOperator,
  can,
  isAutomationTrigger,
} from '@tivexy/core';
import { History, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import { FormError } from '@/components/form/messages';
import { EmptyState } from '@/components/page/empty-state';
import { PageHeader } from '@/components/page/header';
import { NoTenant } from '@/components/page/no-tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionTitle } from '@/config/navigation';
import { requireAccess } from '@/lib/auth/require';
import { modelosDeAutomacao, permissoesDeDestino } from '@/lib/automation/rule-text';
import { formatInstant } from '@/lib/format';
import { tenantMembers } from '@/lib/members';
import { tenantTimeZone } from '@/lib/settings/current';
import { supabaseServer } from '@/lib/supabase/server';
import { currentTerms } from '@/lib/terms/current';
import { termOf } from '@/lib/terms/vocabulary';

import type { OpcoesDoEditor } from './rule-editor';
import { NovaAutomacao, RuleCard } from './rules';
import { RunList } from './runs';
import type { ExecucaoNaTela, RegraNaTela } from './state';

export async function generateMetadata(): Promise<Metadata> {
  return { title: sectionTitle(await currentTerms(), '/automacoes') };
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/** As condições como o banco guardou, conferidas — o que não se reconhece não vai para a tela. */
function condicoesDe(valor: unknown): AutomationCondition[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) => {
    const c = objeto(item);
    const operador = CONDITION_OPERATORS.find((op) => op === c.operador);
    if (typeof c.campo !== 'string' || operador === undefined) return [];
    if (typeof c.valor !== 'string' && typeof c.valor !== 'number') return [];
    return [{ campo: c.campo, operador: operador as ConditionOperator, valor: c.valor }];
  });
}

function paramsDe(valor: unknown): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(objeto(valor)).filter(
      (par): par is [string, string | number] =>
        typeof par[1] === 'string' || typeof par[1] === 'number',
    ),
  );
}

/** "Última vez: 25/09/2026 14:30 — 2 avisos". */
function ultimaVez(execucao: ExecucaoNaTela | undefined, fuso: string): string | null {
  if (execucao === undefined) return null;
  const resultado = execucao.deuCerto ? (execucao.detalhe ?? 'rodou') : 'falhou';
  return `Última vez: ${formatInstant(execucao.quando, fuso)} — ${resultado}`;
}

/**
 * Automações: quando acontece X, se Y, então Z — tudo dentro do Tivexy.
 *
 * **Motor interno.** O evento nasce no banco (lead criado, venda registrada,
 * saldo no mínimo), as condições são conferidas lá, e a ação é interna:
 * avisar alguém aqui dentro ou criar atividade no CRM. Nada depende de canal
 * externo — e-mail, WhatsApp e webhook não existem aqui, nem simulados.
 */
export default async function AutomacoesPage() {
  const { choice, viewer } = await requireAccess('/automacoes');
  if (choice.kind !== 'resolved') return <NoTenant />;

  const tenantId = choice.tenant.id;
  const supabase = await supabaseServer();
  const [terms, fuso, pessoas, regras, execucoes] = await Promise.all([
    currentTerms(),
    tenantTimeZone(),
    tenantMembers(tenantId),
    supabase
      .from('automation_rules')
      .select('id, name, trigger, conditions, action, action_params, active')
      .eq('tenant_id', tenantId)
      .order('created_at')
      .order('id'),
    supabase
      .from('automation_runs')
      .select('id, rule_id, trigger, outcome, detail, payload, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const lista: RegraNaTela[] = (regras.data ?? []).flatMap((r) => {
    const gatilho = String(r.trigger);
    const acao = AUTOMATION_ACTIONS.find((a) => a === r.action);
    if (!isAutomationTrigger(gatilho) || acao === undefined) return [];
    return [
      {
        id: String(r.id),
        nome: String(r.name),
        gatilho,
        condicoes: condicoesDe(r.conditions),
        acao: acao as AutomationAction,
        params: paramsDe(r.action_params),
        ativa: r.active === true,
      },
    ];
  });

  const historico: ExecucaoNaTela[] = (execucoes.data ?? []).map((e) => ({
    id: String(e.id),
    regraId: String(e.rule_id),
    gatilho: String(e.trigger),
    deuCerto: e.outcome === 'executed',
    detalhe: typeof e.detail === 'string' ? e.detail : null,
    payload: objeto(e.payload),
    quando: String(e.created_at),
  }));

  const modulos = viewer.enabledModules;
  const gatilhos: AutomationTrigger[] = AUTOMATION_TRIGGER_CODES.filter((g) =>
    modulos.has(AUTOMATION_TRIGGERS[g].modulo),
  );
  const podeEditar = can(viewer, 'automation.rules.write');
  const podeCriarAtividade = modulos.has('crm') && can(viewer, 'crm.activities.write');
  const opcoes: OpcoesDoEditor = {
    gatilhos,
    podeCriarAtividade,
    pessoas,
    permissoes: permissoesDeDestino(modulos, terms),
    terms,
  };
  const nomes = new Map(lista.map((r) => [r.id, r.nome]));
  const automacao = termOf(terms, 'automation.rules');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        titulo={sectionTitle(terms, '/automacoes')}
        descricao="Motor interno: gatilho → condição → ação. Nada que dependa de canal externo — sem e-mail, WhatsApp ou webhook."
      />

      {(regras.error !== null || execucoes.error !== null) && (
        <div className="mb-4">
          <FormError>Não consegui ler tudo agora. Recarregue a página em instantes.</FormError>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {podeEditar && (
          <Card>
            <CardHeader>
              <CardTitle>Cadastrar</CardTitle>
            </CardHeader>
            <CardContent>
              <NovaAutomacao
                opcoes={opcoes}
                modelos={modelosDeAutomacao(modulos, podeCriarAtividade, terms)}
              />
            </CardContent>
          </Card>
        )}

        <section aria-labelledby="em-uso">
          <h2
            id="em-uso"
            className="mb-2 font-sans text-sm font-medium tracking-normal text-content-default"
          >
            Em uso e em pausa
          </h2>
          {lista.length === 0 ? (
            <EmptyState icone={Zap} titulo={`Ainda não há ${automacao.plural}`}>
              Cada {automacao.singular} escuta um evento do sistema — cadastro novo, registro em{' '}
              {termOf(terms, 'erp.sales').plural}, saldo no mínimo —, confere as condições e faz uma
              ação interna: avisar alguém aqui dentro ou criar{' '}
              {termOf(terms, 'crm.activities').singular} no CRM.
              {podeEditar
                ? ' Comece por um modelo acima.'
                : ' Quem administra a empresa cadastra aqui.'}
            </EmptyState>
          ) : (
            <Card>
              <CardContent className="pt-1">
                <ul className="flex flex-col divide-y divide-line-subtle">
                  {lista.map((regra) => (
                    <RuleCard
                      key={regra.id}
                      regra={regra}
                      opcoes={opcoes}
                      podeEditar={podeEditar}
                      ultimaExecucao={ultimaVez(
                        historico.find((e) => e.regraId === regra.id),
                        fuso,
                      )}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>

        <section aria-labelledby="execucoes">
          <h2
            id="execucoes"
            className="mb-2 flex items-center gap-1.5 font-sans text-sm font-medium tracking-normal text-content-default"
          >
            <History className="size-4 text-content-subtle" aria-hidden />
            Últimas execuções
          </h2>
          <RunList execucoes={historico} nomes={nomes} fuso={fuso} automacao={automacao} />
        </section>
      </div>
    </div>
  );
}
